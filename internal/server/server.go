// Package server serves the TypeScript client and a same-origin chat stream.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"git.subcult.tv/subculture-collective/chatty-cat/internal/auth"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/irc"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/metadata"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/preview"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

var channelName = regexp.MustCompile(`^[a-z0-9_]{1,25}$`)

// Config holds deployment settings and upstream addresses for integration tests.
type Config struct {
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
	return &Server{cfg: cfg, ctx: ctx, cancel: cancel, client: client, slots: make(chan struct{}, 32), metadata: metadata.New(client, cfg.MetadataEndpoints, read), metadataSlots: make(chan struct{}, 16), previews: preview.New(nil), previewSlots: make(chan struct{}, 16)}
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
		if _, err := io.WriteString(w, `{"status":"ok","stage":"migration-foundation"}`); err != nil {
			slog.Debug("health response closed", "error", err)
		}
	})
	mux.HandleFunc("GET /api/public-config", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if err := json.NewEncoder(w).Encode(struct {
			GiphyAPIKey string `json:"giphyApiKey"`
		}{s.cfg.GiphyAPIKey}); err != nil {
			slog.Debug("public configuration response closed", "error", err)
		}
	})
	mux.HandleFunc("GET /api/chat", s.chat)
	mux.HandleFunc("GET /api/channels/{channel}", s.channelMetadata)
	mux.HandleFunc("GET /api/preview", s.linkPreview)
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

func channels(raw string) ([]string, error) {
	if raw == "" {
		raw = "hasanabi"
	}
	parts := strings.Split(strings.ToLower(raw), ",")
	if len(parts) > 6 {
		return nil, errors.New("choose at most six channels")
	}
	seen := make(map[string]bool)
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if !channelName.MatchString(part) {
			return nil, errors.New("invalid channel name")
		}
		if !seen[part] {
			seen[part] = true
			result = append(result, part)
		}
	}
	return result, nil
}

type event struct {
	Type    string       `json:"type"`
	State   string       `json:"state,omitempty"`
	Detail  string       `json:"detail,omitempty"`
	Message *irc.Message `json:"message,omitempty"`
	Replay  bool         `json:"replay,omitempty"`
}

func (s *Server) chat(w http.ResponseWriter, r *http.Request) {
	want, err := channels(r.URL.Query().Get("channels"))
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
		http.Error(w, "chat capacity reached", http.StatusServiceUnavailable)
		return
	}
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
	for _, command := range []string{"CAP REQ :twitch.tv/tags twitch.tv/commands", "PASS justinfan", fmt.Sprintf("NICK justinfan%d", time.Now().UnixNano()%99999)} {
		if err := send(command); err != nil {
			return fmt.Errorf("authenticate IRC: %w", err)
		}
	}
	for _, channel := range want {
		if err := send("JOIN #" + channel); err != nil {
			return fmt.Errorf("join IRC: %w", err)
		}
	}
	ready := false
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
				if !ready {
					ready = true
					if err := write(event{Type: "status", State: "connected"}); err != nil {
						return err
					}
					// Fetch history without delaying live reads or Twitch PINGs.
					// Each worker is cancelled and joined when this session ends.
					for _, channel := range want {
						background.Add(1)
						go func(channel string) {
							defer background.Done()
							if err := s.backfill(ctx, channel, write); err != nil {
								stop()
							}
						}(channel)
					}
				}
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
