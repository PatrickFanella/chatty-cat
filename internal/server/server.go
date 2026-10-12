// Package server serves the TypeScript client and a same-origin chat stream.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"git.subcult.tv/subculture-collective/chatty-cat/internal/auth"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/chatlimits"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/irc"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/metadata"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/preview"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

var channelName = regexp.MustCompile(`^[a-z0-9_]{1,25}$`)

// Config holds deployment settings and upstream addresses for integration tests.
type Config struct {
	WorkspaceChannels int
	Subscriptions     int
	GiphyAPIKey       string
	Auth              *auth.Service
	Assets            string
	IRCURL            string
	RecentURL         string
	MetadataEndpoints metadata.Endpoints
}

// Server owns the bounded active connection set and its shutdown context.
type Server struct {
	cfg           Config
	budget        *chatlimits.Budget
	ctx           context.Context
	cancel        context.CancelFunc
	client        *http.Client
	slots         chan struct{}
	mu            sync.Mutex
	closing       bool
	wg            sync.WaitGroup
	metadata      *metadata.Service
	metadataSlots chan struct{}
	previews      *preview.Service
	previewSlots  chan struct{}
}

// New creates a service. Call Close during shutdown to cancel WebSocket sessions.
func New(cfg Config) *Server {
	if cfg.Subscriptions == 0 {
		cfg.Subscriptions = chatlimits.MaxSubscriptions
	}
	cfg.Subscriptions = max(1, min(cfg.Subscriptions, chatlimits.MaxSubscriptions))
	cfg.WorkspaceChannels = min(chatlimits.Capacity(cfg.WorkspaceChannels), cfg.Subscriptions)
	if cfg.IRCURL == "" {
		cfg.IRCURL = "wss://irc-ws.chat.twitch.tv:443"
	}
	if cfg.RecentURL == "" {
		cfg.RecentURL = "https://recent-messages.robotty.de/api/v2/recent-messages/"
	}
	ctx, cancel := context.WithCancel(context.Background())
	client := &http.Client{Timeout: 10 * time.Second}
	var read metadata.PublicReader
	if cfg.Auth != nil && cfg.Auth.HasAppCredentials() {
		read = cfg.Auth.PublicRead
	}
	return &Server{cfg: cfg, budget: chatlimits.New(cfg.Subscriptions, 1), ctx: ctx, cancel: cancel, client: client, slots: make(chan struct{}, 32), metadata: metadata.New(client, cfg.MetadataEndpoints, read), metadataSlots: make(chan struct{}, 16), previews: preview.New(nil, preview.PublicReader(read)), previewSlots: make(chan struct{}, 16)}
}

// Close cancels and waits for all active chat handlers.
func (s *Server) Close() {
	s.mu.Lock()
	s.closing = true
	s.cancel()
	s.mu.Unlock()
	s.wg.Wait()
	s.client.CloseIdleConnections()
	s.previews.Close()
	if s.cfg.Auth != nil {
		s.cfg.Auth.Close()
	}
}

// Handler returns same-origin API and static asset routes.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	if s.cfg.Auth != nil {
		s.cfg.Auth.Register(mux)
	}
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if _, err := io.WriteString(w, `{"status":"ok"}`); err != nil {
			slog.Debug("health response closed", "error", err)
		}
	})
	mux.HandleFunc("GET /api/ready", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		s.mu.Lock()
		closing := s.closing
		s.mu.Unlock()
		info, err := os.Stat(filepath.Join(s.cfg.Assets, "index.html"))
		if closing || err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
			http.Error(w, `{"status":"unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		if _, err := io.WriteString(w, `{"status":"ready"}`); err != nil {
			slog.Debug("readiness response closed", "error", err)
		}
	})

	mux.HandleFunc("GET /api/public-config", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if err := json.NewEncoder(w).Encode(struct {
			GiphyAPIKey       string `json:"giphyApiKey"`
			PaneChannels      int    `json:"paneChannels"`
			WorkspaceChannels int    `json:"workspaceChannels"`
			Subscriptions     int    `json:"subscriptions"`
		}{s.cfg.GiphyAPIKey, chatlimits.PaneChannels, s.cfg.WorkspaceChannels, s.cfg.Subscriptions}); err != nil {
			slog.Debug("public configuration response closed", "error", err)
		}
	})
	mux.HandleFunc("GET /api/chat", s.chat)
	mux.HandleFunc("GET /api/chat-admission", s.admission)
	mux.HandleFunc("GET /api/channels/{channel}", s.channelMetadata)
	mux.HandleFunc("GET /api/preview", s.linkPreview)
	mux.HandleFunc("GET /api/nitter", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
		defer cancel()
		stop := context.AfterFunc(s.ctx, cancel)
		defer stop()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if err := json.NewEncoder(w).Encode(struct {
			Host string `json:"host"`
		}{s.previews.Nitter(ctx)}); err != nil {
			slog.Debug("mirror selection response closed")
		}
	})
	mux.HandleFunc("GET /api/users/{login}", s.userProfile)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) { http.Error(w, "unknown API route", http.StatusNotFound) })
	mux.Handle("/", http.FileServer(http.Dir(s.cfg.Assets)))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		mux.ServeHTTP(w, r)
	})
}

func (s *Server) linkPreview(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		http.Error(w, "same-origin preview required", http.StatusForbidden)
		return
	}
	if origin := r.Header.Get("Origin"); origin != "" {
		u, err := url.Parse(origin)
		if err != nil || u.Host != r.Host {
			http.Error(w, "same-origin preview required", http.StatusForbidden)
			return
		}
	}
	raw := r.URL.Query().Get("url")
	if _, err := preview.Target(raw); err != nil {
		http.Error(w, "invalid public preview URL", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	if s.closing {
		s.mu.Unlock()
		http.Error(w, "service shutting down", http.StatusServiceUnavailable)
		return
	}
	s.wg.Add(1)
	s.mu.Unlock()
	defer s.wg.Done()
	select {
	case s.previewSlots <- struct{}{}:
		defer func() { <-s.previewSlots }()
	default:
		http.Error(w, "preview capacity reached", http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	stop := context.AfterFunc(s.ctx, cancel)
	defer stop()
	caller, _, splitErr := net.SplitHostPort(r.RemoteAddr)
	if splitErr != nil {
		caller = r.RemoteAddr
	}
	card, err := s.previews.LoadFor(ctx, raw, caller)
	if err != nil {
		http.Error(w, "preview unavailable", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, max-age=60")
	if err := json.NewEncoder(w).Encode(card); err != nil {
		slog.Debug("preview response closed")
	}
}

func (s *Server) channelMetadata(w http.ResponseWriter, r *http.Request) {
	channel := strings.ToLower(r.PathValue("channel"))
	if !channelName.MatchString(channel) {
		http.Error(w, "invalid channel", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	if s.closing {
		s.mu.Unlock()
		http.Error(w, "service shutting down", http.StatusServiceUnavailable)
		return
	}
	s.wg.Add(1)
	s.mu.Unlock()
	defer s.wg.Done()
	select {
	case s.metadataSlots <- struct{}{}:
		defer func() { <-s.metadataSlots }()
	default:
		http.Error(w, "metadata capacity reached", http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	stop := context.AfterFunc(s.ctx, cancel)
	defer stop()
	data, err := s.metadata.Load(ctx, channel)
	if err != nil {
		http.Error(w, "metadata temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		slog.Debug("metadata response closed", "error", err)
	}
}

func (s *Server) userProfile(w http.ResponseWriter, r *http.Request) {
	channel := strings.ToLower(r.PathValue("login"))
	if !channelName.MatchString(channel) {
		http.Error(w, "invalid channel", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	if s.closing {
		s.mu.Unlock()
		http.Error(w, "service shutting down", http.StatusServiceUnavailable)
		return
	}
	s.wg.Add(1)
	s.mu.Unlock()
	defer s.wg.Done()
	select {
	case s.metadataSlots <- struct{}{}:
		defer func() { <-s.metadataSlots }()
	default:
		http.Error(w, "metadata capacity reached", http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	stop := context.AfterFunc(s.ctx, cancel)
	defer stop()
	data, err := s.metadata.Profile(ctx, channel)
	if err != nil {
		http.Error(w, "metadata temporarily unavailable", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		slog.Debug("metadata response closed", "error", err)
	}
}

func channels(raw string) ([]string, error) { return workspaceChannels(raw, chatlimits.PaneChannels) }
func workspaceChannels(raw string, limit int) ([]string, error) {
	if raw == "" {
		raw = "hasanabi"
	}
	return chatlimits.Parse(raw, limit)
}
func (s *Server) admission(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	want, err := workspaceChannels(r.URL.Query().Get("channels"), s.cfg.WorkspaceChannels)
	status, detail, retry := http.StatusOK, "Capacity available", 0
	s.mu.Lock()
	closing := s.closing
	s.mu.Unlock()
	if err != nil {
		status, detail = http.StatusBadRequest, err.Error()
	} else if closing {
		status, detail, retry = http.StatusServiceUnavailable, "Service shutting down", 5
	} else if len(s.slots) >= cap(s.slots) || !s.budget.Available(len(want)) {
		status, detail, retry = http.StatusTooManyRequests, "Chat capacity reached; close another view and retry", 5
	}
	if retry > 0 {
		w.Header().Set("Retry-After", fmt.Sprint(retry))
	}
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(struct {
		Allowed bool   `json:"allowed"`
		Detail  string `json:"detail"`
		Retry   int    `json:"retryAfter"`
	}{status == http.StatusOK, detail, retry}); err != nil {
		slog.Debug("admission response closed", "error", err)
	}
}

type event struct {
	Type    string       `json:"type"`
	State   string       `json:"state,omitempty"`
	Detail  string       `json:"detail,omitempty"`
	Message *irc.Message `json:"message,omitempty"`
	Replay  bool         `json:"replay,omitempty"`
}

func (s *Server) chat(w http.ResponseWriter, r *http.Request) {
	want, err := workspaceChannels(r.URL.Query().Get("channels"), s.cfg.WorkspaceChannels)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	if s.closing {
		s.mu.Unlock()
		http.Error(w, "service shutting down", http.StatusServiceUnavailable)
		return
	}
	s.wg.Add(1)
	s.mu.Unlock()
	defer s.wg.Done()
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		w.Header().Set("Retry-After", "5")
		http.Error(w, "chat capacity reached; close another view and retry", http.StatusServiceUnavailable)
		return
	}
	lease, err := s.budget.Acquire("public", len(want))
	if err != nil {
		w.Header().Set("Retry-After", "5")
		http.Error(w, err.Error(), http.StatusTooManyRequests)
		return
	}
	defer lease.Release()
	conn, err := websocket.Accept(w, r, nil) // Same-origin verification is enabled.
	if err != nil {
		return
	}
	defer func() {
		if err := conn.CloseNow(); err != nil {
			slog.Debug("chat socket closed", "error", err)
		}
	}()
	ctx, cancel := context.WithCancel(s.ctx)
	defer cancel()
	// Read control frames so a tab closing promptly cancels upstream work.
	ctx = conn.CloseRead(ctx)
	write := func(e event) error {
		writeCtx, stop := context.WithTimeout(ctx, 5*time.Second)
		defer stop()
		return wsjson.Write(writeCtx, conn, e)
	}
	delay := time.Second
	for ctx.Err() == nil {
		if err := write(event{Type: "status", State: "connecting"}); err != nil {
			return
		}
		err := s.relay(ctx, want, write)
		if ctx.Err() != nil {
			return
		}
		// Do not send upstream error bodies or credentials to the browser.
		if err != nil {
			slog.Debug("upstream disconnected", "error", err)
		}
		if err := write(event{Type: "status", State: "reconnecting", Detail: "Twitch connection interrupted; retrying"}); err != nil {
			return
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		delay = min(delay*2, 30*time.Second)
	}
}

func (s *Server) relay(ctx context.Context, want []string, write func(event) error) error {
	ctx, stop := context.WithCancel(ctx)
	var background sync.WaitGroup
	defer func() { stop(); background.Wait() }()
	dialCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	upstream, resp, err := websocket.Dial(dialCtx, s.cfg.IRCURL, nil)
	cancel()
	if resp != nil && resp.Body != nil {
		if err := resp.Body.Close(); err != nil {
			slog.Debug("handshake response closed", "error", err)
		}
	}
	if err != nil {
		return fmt.Errorf("connect IRC: %w", err)
	}
	defer func() {
		if err := upstream.CloseNow(); err != nil {
			slog.Debug("upstream closed", "error", err)
		}
	}()
	upstream.SetReadLimit(1 << 20)
	send := func(text string) error {
		writeCtx, stop := context.WithTimeout(ctx, 5*time.Second)
		defer stop()
		return upstream.Write(writeCtx, websocket.MessageText, []byte(text+"\r\n"))
	}
	if err := s.budget.Wait(ctx, "public", chatlimits.Authenticate, func(delay time.Duration) error {
		return write(event{Type: "status", State: "connecting", Detail: fmt.Sprintf("Waiting for IRC login capacity; retrying in %d seconds", int(math.Ceil(delay.Seconds())))})
	}); err != nil {
		return err
	}
	for _, command := range []string{"CAP REQ :twitch.tv/tags twitch.tv/commands", "PASS justinfan", fmt.Sprintf("NICK justinfan%d", time.Now().UnixNano()%99999)} {
		if err := send(command); err != nil {
			return fmt.Errorf("authenticate IRC: %w", err)
		}
	}
	var welcome, joined atomic.Bool
	var readyOnce sync.Once
	notifyReady := func() {
		if !welcome.Load() || !joined.Load() || ctx.Err() != nil {
			return
		}
		readyOnce.Do(func() {
			if err := write(event{Type: "status", State: "connected"}); err != nil {
				stop()
				return
			}
			for _, channel := range want {
				background.Add(1)
				go func(channel string) {
					defer background.Done()
					if err := s.backfill(ctx, channel, write); err != nil {
						stop()
					}
				}(channel)
			}
		})
	}
	background.Add(1)
	go func() {
		defer background.Done()
		for _, channel := range want {
			if err := s.budget.Wait(ctx, "public", chatlimits.Join, func(delay time.Duration) error {
				return write(event{Type: "status", State: "connecting", Detail: fmt.Sprintf("Waiting for channel join capacity; retrying in %d seconds", int(math.Ceil(delay.Seconds())))})
			}); err != nil {
				stop()
				return
			}
			if err := send("JOIN #" + channel); err != nil {
				stop()
				return
			}
		}
		joined.Store(true)
		notifyReady()
	}()
	allowed := make(map[string]bool, len(want))
	for _, channel := range want {
		allowed[channel] = true
	}
	for {
		_, data, err := upstream.Read(ctx)
		if err != nil {
			return fmt.Errorf("read IRC: %w", err)
		}
		for _, line := range strings.Split(string(data), "\r\n") {
			msg, err := irc.Parse(line)
			if err != nil {
				continue
			}
			switch msg.Command {
			case "PING":
				if err := send("PONG :" + msg.Text); err != nil {
					return fmt.Errorf("IRC pong: %w", err)
				}
			case "RECONNECT":
				return errors.New("IRC requested reconnect")
			case "001":
				welcome.Store(true)
				notifyReady()
			default:
				if allowed[msg.Channel] && displayCommand(msg.Command) {
					if msg.Timestamp == 0 {
						msg.Timestamp = time.Now().UnixMilli()
					}
					if err := write(event{Type: "message", Message: &msg}); err != nil {
						return err
					}
				}
			}
		}
	}
}

func displayCommand(command string) bool {
	switch command {
	case "PRIVMSG", "USERNOTICE", "NOTICE", "CLEARCHAT", "CLEARMSG", "ROOMSTATE", "USERSTATE":
		return true
	default:
		return false
	}
}

func (s *Server) backfill(ctx context.Context, channel string, write func(event) error) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.cfg.RecentURL+channel+"?limit=200", nil)
	if err != nil {
		return fmt.Errorf("create backlog request: %w", err)
	}
	res, err := s.client.Do(req)
	if err != nil {
		return nil
	} // An unavailable history provider must not stop live chat.
	defer func() {
		if err := res.Body.Close(); err != nil {
			slog.Debug("backlog body closed", "error", err)
		}
	}()
	if res.StatusCode != http.StatusOK {
		return nil
	}
	var backlog struct {
		Messages []string `json:"messages"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 2<<20)).Decode(&backlog); err != nil {
		return nil
	}
	for _, line := range backlog.Messages[:min(len(backlog.Messages), 200)] {
		msg, err := irc.Parse(line)
		if err != nil || msg.Channel != channel || !displayCommand(msg.Command) {
			continue
		}
		if err := write(event{Type: "message", Message: &msg, Replay: true}); err != nil {
			return err
		}
	}
	return nil
}
