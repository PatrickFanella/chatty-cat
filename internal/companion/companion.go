// Package companion serves the separately installed, loopback-only desktop helper.
// It is never registered on the public Chatty Cat server.
package companion

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

const Address = "127.0.0.1:47831"

type Tool struct {
	ID         string   `json:"id"`
	Label      string   `json:"label"`
	Executable string   `json:"executable"`
	Arguments  []string `json:"arguments"`
	Requires   []string `json:"requires,omitempty"`
}
type Config struct {
	Origin            string `json:"origin"`
	Tools             []Tool `json:"tools"`
	OverlayExecutable string `json:"overlayExecutable,omitempty"`
}
type ToolStatus struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Available bool   `json:"available"`
}
type Job struct {
	ID       string `json:"id"`
	Tool     string `json:"tool"`
	Channel  string `json:"channel"`
	Quality  string `json:"quality"`
	State    string `json:"state"`
	ExitCode *int   `json:"exitCode,omitempty"`
}
type Service struct {
	config           Config
	mu               sync.Mutex
	code             string
	codeUntil        time.Time
	attempts         int
	token, account   string
	expires          time.Time
	jobs             []*Job
	ctx              context.Context
	cancel           context.CancelFunc
	start            func(string, []string, func(int))
	wg               sync.WaitGroup
	closed           bool
	slots            chan struct{}
	overlay          *overlayHost
	overlayReceipts  map[string]overlayReceipt
	overlaySupported func() bool
}

type overlayReceipt struct {
	Body  overlayAction
	State OverlayState
}
type overlayAction struct {
	Kind     string           `json:"kind"`
	ID       string           `json:"requestID"`
	Settings *OverlaySettings `json:"settings,omitempty"`
}

var identifier = regexp.MustCompile(`^[a-z0-9_-]{1,32}$`)
var accountID = regexp.MustCompile(`^[1-9][0-9]{0,19}$`)
var channelID = regexp.MustCompile(`^[a-z0-9_]{1,25}$`)
var requestID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
var qualities = map[string]bool{"best": true, "worst": true, "audio_only": true, "160p": true, "360p": true, "480p": true, "720p": true, "720p60": true, "1080p": true, "1080p60": true, "1440p60": true}

func opaque() string {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic("system randomness unavailable")
	}
	return hex.EncodeToString(b[:])
}
func New(c Config) (*Service, error) {
	u, err := url.Parse(c.Origin)
	if err != nil || u.User != nil || u.Host == "" || u.RawQuery != "" || u.Fragment != "" || u.Path != "" || u.Opaque != "" || (u.Scheme != "https" && (u.Scheme != "http" || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost"))) || len(c.Tools) == 0 && c.OverlayExecutable == "" || len(c.Tools) > 8 || c.OverlayExecutable != "" && !filepath.IsAbs(c.OverlayExecutable) {
		return nil, errors.New("configure an exact HTTPS origin (or HTTP loopback), with playback tools or an absolute overlay executable")
	}
	seen := map[string]bool{}
	for _, t := range c.Tools {
		if !identifier.MatchString(t.ID) || seen[t.ID] || len(t.Label) < 1 || len(t.Label) > 64 || !filepath.IsAbs(t.Executable) || len(t.Arguments) == 0 || len(t.Arguments) > 32 || len(t.Requires) > 4 {
			return nil, errors.New("invalid configured playback tool")
		}
		seen[t.ID] = true
		hasURL := false
		for _, a := range t.Arguments {
			if len(a) > 2048 || strings.ContainsRune(a, 0) {
				return nil, errors.New("invalid argument")
			}
			if a == "{url}" {
				hasURL = true
				continue
			}
			if a == "{quality}" {
				continue
			}
			if strings.ContainsAny(a, "{}") {
				return nil, errors.New("placeholders must be whole arguments and use url or quality")
			}
		}
		if !hasURL {
			return nil, errors.New("tool requires a url argument")
		}
		for _, p := range t.Requires {
			if !filepath.IsAbs(p) {
				return nil, errors.New("dependencies require absolute paths")
			}
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	s := &Service{config: c, code: opaque(), codeUntil: time.Now().Add(5 * time.Minute), ctx: ctx, cancel: cancel, slots: make(chan struct{}, 16), overlayReceipts: map[string]overlayReceipt{}}
	s.start = s.execute
	s.overlaySupported = s.platformOverlayAvailable
	return s, nil
}
func (s *Service) PairCode() string { return s.code }
func (s *Service) Close() {
	s.mu.Lock()
	s.closed = true
	s.token = ""
	s.cancel()
	if s.overlay != nil {
		s.overlay.close()
		s.overlay = nil
	}
	s.mu.Unlock()
	s.wg.Wait()
}
func available(t Tool) bool {
	for _, p := range append([]string{t.Executable}, t.Requires...) {
		info, err := os.Stat(p)
		if err != nil || !info.Mode().IsRegular() || runtime.GOOS != "windows" && info.Mode().Perm()&0111 == 0 {
			return false
		}
	}
	return true
}
func (s *Service) Plan(tool, channel, quality string) (string, []string, error) {
	if !channelID.MatchString(channel) || !qualities[quality] {
		return "", nil, errors.New("invalid channel or quality")
	}
	for _, t := range s.config.Tools {
		if t.ID != tool {
			continue
		}
		if !available(t) {
			return "", nil, errors.New("configured executable or dependency is missing/not executable")
		}
		args := make([]string, len(t.Arguments))
		for i, a := range t.Arguments {
			switch a {
			case "{url}":
				args[i] = "https://www.twitch.tv/" + channel
			case "{quality}":
				args[i] = quality
			default:
				args[i] = a
			}
		}
		return t.Executable, args, nil
	}
	return "", nil, errors.New("tool not configured")
}
func (s *Service) execute(path string, args []string, done func(int)) {
	// The owner-controlled executable and argument vector never pass through a shell.
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		done(-1)
		return
	}
	s.wg.Add(1)
	s.mu.Unlock()
	go func() {
		defer s.wg.Done()
		ctx, cancel := context.WithDeadline(s.ctx, s.expires)
		defer cancel()
		cmd := exec.CommandContext(ctx, path, args...)
		cmd.WaitDelay = time.Second
		cmd.Stdout = io.Discard
		cmd.Stderr = io.Discard
		code := 0
		if err := cmd.Run(); err != nil {
			code = -1
			var exit *exec.ExitError
			if errors.As(err, &exit) {
				code = exit.ExitCode()
			}
		}
		done(code)
	}()
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if r.Header.Get("Content-Type") != "application/json" {
		http.Error(w, "application/json required", http.StatusUnsupportedMediaType)
		return false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if decoder.Decode(v) != nil || decoder.Decode(new(any)) != io.EOF {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return false
	}
	return true
}
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Vary", "Origin")
	if r.Host != Address || r.Header.Get("Origin") != s.config.Origin {
		http.Error(w, "origin or host refused", http.StatusForbidden)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", s.config.Origin)
	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Companion-Account")
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
		w.WriteHeader(204)
		return
	}
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		http.Error(w, "companion busy", http.StatusServiceUnavailable)
		return
	}
	if r.URL.RawQuery != "" {
		http.Error(w, "query not supported", http.StatusBadRequest)
		return
	}
	if r.Method == "POST" && r.URL.Path == "/v1/pair" {
		var body struct {
			Code    string `json:"code"`
			Account string `json:"account"`
		}
		if !decode(w, r, &body) {
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.closed || s.token != "" || s.attempts >= 5 || time.Now().After(s.codeUntil) {
			http.Error(w, "pairing unavailable; restart companion for a new code", http.StatusForbidden)
			return
		}
		s.attempts++
		if !accountID.MatchString(body.Account) || body.Account != r.Header.Get("X-Companion-Account") || subtle.ConstantTimeCompare([]byte(body.Code), []byte(s.code)) != 1 {
			http.Error(w, "pairing refused", http.StatusForbidden)
			return
		}
		s.codeUntil = time.Time{}
		s.token = opaque()
		s.account = body.Account
		s.expires = time.Now().Add(8 * time.Hour)
		respond(w, 200, map[string]any{"version": 1, "token": s.token, "account": s.account})
		return
	}
	s.mu.Lock()
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if s.closed || s.token == "" || subtle.ConstantTimeCompare([]byte(token), []byte(s.token)) != 1 || s.account != r.Header.Get("X-Companion-Account") || time.Now().After(s.expires) {
		s.mu.Unlock()
		http.Error(w, "pair this account first", http.StatusUnauthorized)
		return
	}
	switch {
	case r.Method == "DELETE" && r.URL.Path == "/v1/pair":
		s.token = ""
		s.cancel()
		if s.overlay != nil {
			s.overlay.close()
			s.overlay = nil
		}
		s.mu.Unlock()
		w.WriteHeader(204)
	case r.Method == "GET" && r.URL.Path == "/v1/status":
		tools := make([]ToolStatus, 0, len(s.config.Tools))
		for _, t := range s.config.Tools {
			tools = append(tools, ToolStatus{t.ID, t.Label, available(t)})
		}
		respond(w, 200, map[string]any{"version": 1, "platform": runtime.GOOS, "tools": tools, "jobs": s.jobs, "overlayAvailable": s.overlaySupported()})
		s.mu.Unlock()
	case r.URL.Path == "/v1/overlay" && (r.Method == "GET" || r.Method == "POST"):
		s.overlayHTTP(w, r)
		s.mu.Unlock()
	case r.Method == "POST" && r.URL.Path == "/v1/launch":
		var body struct {
			Tool    string `json:"tool"`
			Channel string `json:"channel"`
			Quality string `json:"quality"`
			ID      string `json:"requestID"`
		}
		if !decode(w, r, &body) {
			s.mu.Unlock()
			return
		}
		if !requestID.MatchString(body.ID) {
			s.mu.Unlock()
			http.Error(w, "invalid request ID", http.StatusBadRequest)
			return
		}
		for _, j := range s.jobs {
			if j.ID == body.ID {
				if j.Tool != body.Tool || j.Channel != body.Channel || j.Quality != body.Quality {
					s.mu.Unlock()
					http.Error(w, "request ID already used", http.StatusConflict)
					return
				}
				respond(w, 200, j)
				s.mu.Unlock()
				return
			}
		}
		path, args, err := s.Plan(body.Tool, body.Channel, body.Quality)
		if err != nil {
			s.mu.Unlock()
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		running := 0
		for _, j := range s.jobs {
			if j.State == "running" {
				running++
			}
		}
		if running >= 2 {
			s.mu.Unlock()
			http.Error(w, "two playback processes are already active", http.StatusConflict)
			return
		}
		if len(s.jobs) >= 32 {
			s.mu.Unlock()
			http.Error(w, "session launch limit reached; restart and pair again", http.StatusConflict)
			return
		}
		j := &Job{ID: body.ID, Tool: body.Tool, Channel: body.Channel, Quality: body.Quality, State: "running"}
		s.jobs = append(s.jobs, j)
		respond(w, 200, j)
		s.mu.Unlock()
		s.start(path, args, func(code int) { s.mu.Lock(); defer s.mu.Unlock(); j.State = "exited"; j.ExitCode = &code })
	default:
		s.mu.Unlock()
		http.NotFound(w, r)
	}
}
