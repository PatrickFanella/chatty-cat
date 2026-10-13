// Package auth owns Twitch credentials and opaque browser sessions.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/chatlimits"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"
)

const sessionLifetime = 7 * 24 * time.Hour
const stateLifetime = 10 * time.Minute
const validateInterval = 30 * time.Minute
const maxEntries = 1024

// Config contains server-only credentials and the public origin.
// Endpoint overrides are for local integration tests.
type Config struct {
	WorkspaceChannels, ChatSubscriptions int
	ClientID, ClientSecret, PublicURL    string
	AuthorizeURL, TokenURL, ValidateURL  string
	HelixURL                             string
	IRCURL                               string
	EventSubURL                          string
}

type pending struct {
	binding  [32]byte
	expires  time.Time
	returnTo string
	account  string
}
type tokens struct {
	Access  string `json:"access_token"`
	Refresh string `json:"refresh_token"`
	Expires int64  `json:"expires_in"`
	Type    string `json:"token_type"`
}
type identity struct {
	ClientID string   `json:"client_id"`
	Login    string   `json:"login"`
	UserID   string   `json:"user_id"`
	Scopes   []string `json:"scopes"`
	Expires  int64    `json:"expires_in"`
}
type session struct {
	mu                                sync.Mutex
	tokens                            tokens
	user                              identity
	csrf                              string
	expires, validated                time.Time
	invalid                           bool
	lastSend                          time.Time
	emoteWindow                       time.Time
	emoteRequests                     int
	discoveryWindow, discoveryRetryAt time.Time
	discoveryRequests                 int
	personalConnections               int
	personalPeers                     []*personalPeer
	receipts                          map[string]receipt
	receiptOrder                      []string
}

// Service keeps credentials in bounded memory. Restarting signs all users out.
type Service struct {
	appMu                                   sync.Mutex
	appAccess                               string
	appExpires, appValidated, appRetryAfter time.Time
	cfg                                     Config
	chatBudget                              *chatlimits.Budget
	origin                                  string
	secure                                  bool
	client                                  *http.Client
	mu                                      sync.Mutex
	pending                                 map[string]pending
	sessions                                map[[32]byte]*session
	slots                                   chan struct{}
	ctx                                     context.Context
	cancel                                  context.CancelFunc
	wg                                      sync.WaitGroup
	closing                                 bool
	ircSlots                                chan struct{}
	whisperSlots                            chan struct{}
	whispers                                map[string]*whisperHub
}

// New validates configuration and starts the cancellable token validation worker.
func New(cfg Config) (*Service, error) {
	if cfg.ChatSubscriptions == 0 {
		cfg.ChatSubscriptions = chatlimits.MaxSubscriptions
	}
	cfg.ChatSubscriptions = max(1, min(cfg.ChatSubscriptions, chatlimits.MaxSubscriptions))
	cfg.WorkspaceChannels = min(chatlimits.Capacity(cfg.WorkspaceChannels), cfg.ChatSubscriptions)
	if (cfg.ClientID == "") != (cfg.ClientSecret == "") {
		return nil, errors.New("set both TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET")
	}
	if cfg.PublicURL == "" {
		cfg.PublicURL = "https://chat.subcult.tv"
	}
	u, err := url.Parse(cfg.PublicURL)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return nil, errors.New("CHATTHING_PUBLIC_URL must be an origin")
	}
	loopback := u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"
	if u.Scheme != "https" && (u.Scheme != "http" || !loopback) {
		return nil, errors.New("CHATTHING_PUBLIC_URL requires HTTPS except on loopback")
	}
	cfg.PublicURL = strings.TrimSuffix(cfg.PublicURL, "/")
	if cfg.AuthorizeURL == "" {
		cfg.AuthorizeURL = "https://id.twitch.tv/oauth2/authorize"
	}
	if cfg.TokenURL == "" {
		cfg.TokenURL = "https://id.twitch.tv/oauth2/token"
	}
	if cfg.ValidateURL == "" {
		cfg.ValidateURL = "https://id.twitch.tv/oauth2/validate"
	}
	if cfg.HelixURL == "" {
		cfg.HelixURL = "https://api.twitch.tv/helix"
	}
	if cfg.IRCURL == "" {
		cfg.IRCURL = "wss://irc-ws.chat.twitch.tv:443"
	}
	if cfg.EventSubURL == "" {
		cfg.EventSubURL = "wss://eventsub.wss.twitch.tv/ws"
	}
	ctx, cancel := context.WithCancel(context.Background())
	s := &Service{cfg: cfg, chatBudget: chatlimits.New(cfg.ChatSubscriptions, maxEntries), origin: cfg.PublicURL, secure: u.Scheme == "https", client: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, pending: make(map[string]pending), sessions: make(map[[32]byte]*session), slots: make(chan struct{}, 16), ircSlots: make(chan struct{}, 32), whisperSlots: make(chan struct{}, 32), whispers: make(map[string]*whisperHub), ctx: ctx, cancel: cancel}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				s.maintain(now)
			}
		}
	}()
	return s, nil
}

// Close stops validation and forgets all credentials.
func (s *Service) Close() {
	s.mu.Lock()
	s.closing = true
	s.cancel()
	s.mu.Unlock()
	s.wg.Wait()
	s.client.CloseIdleConnections()
	s.mu.Lock()
	defer s.mu.Unlock()
	clear(s.pending)
	clear(s.sessions)
}

// Register installs OAuth endpoints and a browser-safe session endpoint.
func (s *Service) Register(mux *http.ServeMux) {
	mux.Handle("GET /api/auth/login", s.limit(s.login))
	mux.Handle("GET /api/auth/callback", s.limit(s.callback))
	mux.Handle("GET /api/auth/session", s.limit(s.status))
	mux.Handle("POST /api/auth/logout", s.limit(s.logout))
	mux.Handle("POST /api/chat/send", s.limit(s.send))
	mux.Handle("GET /api/auth/emotes", s.limit(s.emotes))
	mux.Handle("GET /api/auth/discovery", s.limit(s.discovery))
	mux.HandleFunc("GET /api/auth/chat", s.personalChat)
	mux.HandleFunc("GET /api/auth/chat-admission", s.personalAdmission)
	mux.HandleFunc("GET /api/auth/whispers", s.whisperChat)
}

func (s *Service) limit(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Referrer-Policy", "no-referrer")
		select {
		case s.slots <- struct{}{}:
			defer func() { <-s.slots }()
		default:
			http.Error(w, "authentication busy", http.StatusServiceUnavailable)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
		defer cancel()
		stop := context.AfterFunc(s.ctx, cancel)
		defer stop()
		next(w, r.WithContext(ctx))
	})
}

func randomValue() string    { return base64.RawURLEncoding.EncodeToString([]byte(rand.Text())) }
func equal(a, b string) bool { return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1 }
func (s *Service) cookie(w http.ResponseWriter, name, value string, age int) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", HttpOnly: true, Secure: s.secure, SameSite: http.SameSiteLaxMode, MaxAge: age})
}
func (s *Service) sameHost(r *http.Request) bool {
	u, err := url.Parse(s.origin)
	return err == nil && equal(strings.ToLower(r.Host), strings.ToLower(u.Host))
}
func (s *Service) pruneLocked(now time.Time) {
	for key, p := range s.pending {
		if !now.Before(p.expires) {
			delete(s.pending, key)
		}
	}
	for key, p := range s.sessions {
		if !now.Before(p.expires) {
			delete(s.sessions, key)
		}
	}
}
func (s *Service) login(w http.ResponseWriter, r *http.Request) {
	if s.cfg.ClientID == "" {
		http.Error(w, "Twitch login is not configured", http.StatusServiceUnavailable)
		return
	}
	if !s.sameHost(r) {
		http.Error(w, "open the configured public origin to log in", 400)
		return
	}
	account := r.URL.Query().Get("account")
	if account != "" && (len(account) > 32 || strings.IndexFunc(account, func(c rune) bool { return c < '0' || c > '9' }) >= 0) {
		http.Error(w, "Invalid account profile", 400)
		return
	}
	scopes := "user:write:chat user:read:emotes chat:read chat:edit " + commandScopes
	switch r.URL.Query().Get("discovery") {
	case "follows":
		scopes += " user:read:follows"
	case "chatters":
		scopes += " moderator:read:chatters"
	case "":
	default:
		http.Error(w, "Invalid discovery consent", 400)
		return
	}
	if p := s.lookup(r); p != nil {
		p.mu.Lock()
		for _, scope := range []string{"user:read:follows", "moderator:read:chatters"} {
			if slices.Contains(p.user.Scopes, scope) && !slices.Contains(strings.Fields(scopes), scope) {
				scopes += " " + scope
			}
		}
		p.mu.Unlock()
	}

	// Only a channel query is retained; never accept an arbitrary redirect target.
	returnTo := "/"
	if channel := r.URL.Query().Get("channel"); len(channel) <= 155 && channel != "" {
		returnTo += "?" + url.Values{"channel": {channel}}.Encode()
	}
	state, binding := randomValue(), randomValue()
	s.mu.Lock()
	s.pruneLocked(time.Now())
	if len(s.pending) >= maxEntries {
		s.mu.Unlock()
		http.Error(w, "login capacity reached", http.StatusServiceUnavailable)
		return
	}
	s.pending[state] = pending{binding: sha256.Sum256([]byte(binding)), expires: time.Now().Add(stateLifetime), returnTo: returnTo, account: account}
	s.mu.Unlock()
	s.cookie(w, "chatthing_oauth", binding, int(stateLifetime.Seconds()))
	u, err := url.Parse(s.cfg.AuthorizeURL)
	if err != nil {
		http.Error(w, "login unavailable", http.StatusServiceUnavailable)
		return
	}
	q := u.Query()
	q.Set("client_id", s.cfg.ClientID)
	q.Set("redirect_uri", s.origin+"/api/auth/callback")
	q.Set("response_type", "code")
	q.Set("scope", scopes)
	q.Set("state", state)
	if account != "" || r.URL.Query().Get("profile") == "add" {
		q.Set("force_verify", "true")
	}
	u.RawQuery = q.Encode()
	http.Redirect(w, r, u.String(), http.StatusFound)
}
func authReturn(returnTo, result string) string {
	separator := "?"
	if strings.Contains(returnTo, "?") {
		separator = "&"
	}
	return returnTo + separator + "auth=" + result
}
func (s *Service) callback(w http.ResponseWriter, r *http.Request) {
	if !s.sameHost(r) {
		http.Error(w, "invalid callback host", 400)
		return
	}
	state := r.URL.Query().Get("state")
	c, err := r.Cookie("chatthing_oauth")
	s.mu.Lock()
	p, ok := s.pending[state]
	if err == nil && ok && time.Now().Before(p.expires) && p.binding == sha256.Sum256([]byte(c.Value)) {
		delete(s.pending, state)
	} else {
		ok = false
	}
	s.mu.Unlock()
	if !ok {
		http.Error(w, "invalid or expired login; try again", 400)
		return
	}
	s.cookie(w, "chatthing_oauth", "", -1)
	if r.URL.Query().Get("error") != "" {
		http.Redirect(w, r, authReturn(p.returnTo, "denied"), http.StatusSeeOther)
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" || len(code) > 2048 {
		http.Redirect(w, r, authReturn(p.returnTo, "failed"), http.StatusSeeOther)
		return
	}
	tok, err := s.exchange(r.Context(), url.Values{"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {s.origin + "/api/auth/callback"}})
	if err != nil {
		http.Redirect(w, r, authReturn(p.returnTo, "failed"), http.StatusSeeOther)
		return
	}
	user, _, err := s.validate(r.Context(), tok.Access)
	if err != nil {
		http.Redirect(w, r, authReturn(p.returnTo, "failed"), http.StatusSeeOther)
		return
	}
	if p.account != "" && user.UserID != p.account {
		http.Redirect(w, r, authReturn(p.returnTo, "account-mismatch"), http.StatusSeeOther)
		return
	}
	sid := randomValue()
	sess := &session{tokens: tok, user: user, csrf: randomValue(), expires: time.Now().Add(sessionLifetime), validated: time.Now()}
	s.mu.Lock()
	s.pruneLocked(time.Now())
	if len(s.sessions) >= maxEntries {
		s.mu.Unlock()
		http.Error(w, "session capacity reached", http.StatusServiceUnavailable)
		return
	}
	// Switching accounts invalidates the old session rather than orphaning it.
	var oldSession *session
	if old, err := r.Cookie("chatthing_session"); err == nil {
		key := sha256.Sum256([]byte(old.Value))
		oldSession = s.sessions[key]
		delete(s.sessions, key)
	}
	s.sessions[sha256.Sum256([]byte(sid))] = sess
	s.mu.Unlock()
	if oldSession != nil {
		oldSession.mu.Lock()
		oldSession.invalid = true
		oldSession.tokens = tokens{}
		oldSession.mu.Unlock()
	}
	s.cookie(w, "chatthing_session", sid, int(sessionLifetime.Seconds()))
	http.Redirect(w, r, p.returnTo, http.StatusSeeOther)
}
func (s *Service) exchange(ctx context.Context, values url.Values) (tokens, error) {
	values.Set("client_id", s.cfg.ClientID)
	values.Set("client_secret", s.cfg.ClientSecret)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.TokenURL, strings.NewReader(values.Encode()))
	if err != nil {
		return tokens{}, errors.New("token request unavailable")
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := s.client.Do(req)
	if err != nil {
		return tokens{}, errors.New("token request failed")
	}
	defer func() {
		if err := res.Body.Close(); err != nil {
			slog.Debug("authentication response close failed")
		}
	}()
	var tok tokens
	if res.StatusCode != 200 || json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&tok) != nil || tok.Access == "" || tok.Refresh == "" || tok.Expires <= 0 || tok.Type != "bearer" {
		return tokens{}, errors.New("token exchange rejected")
	}
	return tok, nil
}
func (s *Service) validate(ctx context.Context, access string) (identity, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.cfg.ValidateURL, nil)
	if err != nil {
		return identity{}, 0, errors.New("validation unavailable")
	}
	req.Header.Set("Authorization", "OAuth "+access)
	res, err := s.client.Do(req)
	if err != nil {
		return identity{}, 0, errors.New("validation failed")
	}
	defer func() {
		if err := res.Body.Close(); err != nil {
			slog.Debug("authentication response close failed")
		}
	}()
	var user identity
	if res.StatusCode != 200 {
		return user, res.StatusCode, errors.New("token invalid")
	}
	if json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&user) != nil || user.ClientID != s.cfg.ClientID || user.UserID == "" || user.Login == "" || user.Expires <= 0 {
		return user, 400, errors.New("identity invalid")
	}
	found := false
	for _, scope := range user.Scopes {
		if scope == "user:write:chat" {
			found = true
		}
	}
	if !found {
		return user, 400, errors.New("chat permission missing")
	}
	return user, 200, nil
}
func (s *Service) lookup(r *http.Request) *session {
	c, err := r.Cookie("chatthing_session")
	if err != nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	p := s.sessions[sha256.Sum256([]byte(c.Value))]
	if p != nil && !time.Now().Before(p.expires) {
		delete(s.sessions, sha256.Sum256([]byte(c.Value)))
		return nil
	}
	return p
}
func (s *Service) check(ctx context.Context, p *session, now time.Time) bool {
	// The caller owns p.mu. Refreshes are serialized per session.
	if p.invalid {
		return false
	}
	if now.Sub(p.validated) < validateInterval {
		return true
	}
	user, status, err := s.validate(ctx, p.tokens.Access)
	if status == 401 {
		tok, refreshErr := s.exchange(ctx, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {p.tokens.Refresh}})
		if refreshErr == nil {
			p.tokens = tok
			user, _, err = s.validate(ctx, tok.Access)
		}
	}
	if err != nil || user.UserID != p.user.UserID {
		p.invalid = true
		p.tokens = tokens{}
		return false
	}
	p.user = user
	p.validated = now
	return true
}
func (s *Service) status(w http.ResponseWriter, r *http.Request) {
	result := map[string]any{"enabled": s.cfg.ClientID != "", "authenticated": false, "loginURL": s.origin + "/api/auth/login"}
	if p := s.lookup(r); p != nil {
		p.mu.Lock()
		if s.check(r.Context(), p, time.Now()) {
			result["authenticated"] = true
			result["login"] = p.user.Login
			result["userID"] = p.user.UserID
			result["csrf"] = p.csrf
			result["whispersEnabled"] = slices.Contains(p.user.Scopes, "user:manage:whispers")
			result["personalChatEnabled"] = slices.Contains(p.user.Scopes, "chat:read") && slices.Contains(p.user.Scopes, "chat:edit")
			result["followsEnabled"] = slices.Contains(p.user.Scopes, "user:read:follows")
			result["chattersEnabled"] = slices.Contains(p.user.Scopes, "moderator:read:chatters")
			result["emotesEnabled"] = slices.Contains(p.user.Scopes, "user:read:emotes")
			permissions := []string{}
			for _, scope := range strings.Fields(commandScopes) {
				if slices.Contains(p.user.Scopes, scope) {
					permissions = append(permissions, scope)
				}
			}
			result["commandPermissions"] = permissions
		} else {
			s.cookie(w, "chatthing_session", "", -1)
		}
		p.mu.Unlock()
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		return
	}
}
func (s *Service) logout(w http.ResponseWriter, r *http.Request) {
	if !s.sameHost(r) || !equal(r.Header.Get("Origin"), s.origin) {
		http.Error(w, "invalid origin", http.StatusForbidden)
		return
	}
	if p := s.lookup(r); p != nil {
		p.mu.Lock()
		valid := equal(r.Header.Get("X-CSRF-Token"), p.csrf)
		p.mu.Unlock()
		if !valid {
			http.Error(w, "invalid session request", http.StatusForbidden)
			return
		}
		c, err := r.Cookie("chatthing_session")
		if err == nil {
			s.mu.Lock()
			delete(s.sessions, sha256.Sum256([]byte(c.Value)))
			s.mu.Unlock()
		}
		p.mu.Lock()
		p.invalid = true
		p.tokens = tokens{}
		p.mu.Unlock()
	}
	s.cookie(w, "chatthing_session", "", -1)
	w.WriteHeader(http.StatusNoContent)
}
func (s *Service) maintain(now time.Time) {
	s.mu.Lock()
	s.pruneLocked(now)
	list := make(map[[32]byte]*session, len(s.sessions))
	for key, p := range s.sessions {
		list[key] = p
	}
	s.mu.Unlock()
	if len(list) == 0 {
		return
	}
	jobs := make(chan struct {
		key [32]byte
		p   *session
	})
	var workers sync.WaitGroup
	for i := 0; i < 16; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for job := range jobs {
				ctx, cancel := context.WithTimeout(s.ctx, 25*time.Second)
				job.p.mu.Lock()
				valid := s.check(ctx, job.p, now)
				job.p.mu.Unlock()
				cancel()
				if !valid {
					s.mu.Lock()
					delete(s.sessions, job.key)
					s.mu.Unlock()
				}
			}
		}()
	}
	defer workers.Wait()
	defer close(jobs)
	for key, p := range list {
		select {
		case <-s.ctx.Done():
			return
		case jobs <- struct {
			key [32]byte
			p   *session
		}{key, p}:
		}
	}
}
