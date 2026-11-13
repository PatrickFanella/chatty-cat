package auth

import (
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"html/template"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// deviceLogin is held only on the loopback server, never sent to the renderer.
// The browser receives a user code and an opaque, cookie-bound polling ID.
type deviceLogin struct {
	code, scopes string
	interval     int
	nextPoll     time.Time
	polling      bool
}

//go:embed device.html
var deviceHTML string

var devicePage = template.Must(template.New("device").Parse(deviceHTML))

func (s *Service) startDeviceLogin(w http.ResponseWriter, r *http.Request, scopes, returnTo, account string) {
	values := url.Values{"client_id": {s.cfg.ClientID}, "scopes": {scopes}}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, s.cfg.DeviceURL, strings.NewReader(values.Encode()))
	if err != nil {
		http.Error(w, "Twitch sign-in unavailable; go back and try again", 503)
		return
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := s.client.Do(req)
	if err != nil {
		http.Error(w, "Twitch sign-in unavailable; go back and try again", 503)
		return
	}
	defer res.Body.Close()
	var code struct {
		DeviceCode string `json:"device_code"`
		UserCode   string `json:"user_code"`
		URI        string `json:"verification_uri"`
		Expires    int    `json:"expires_in"`
		Interval   int    `json:"interval"`
	}
	if res.StatusCode != 200 || json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&code) != nil || code.DeviceCode == "" || len(code.DeviceCode) > 2048 || code.UserCode == "" || len(code.UserCode) > 64 || code.Expires <= 0 || code.Interval > 1800 {
		http.Error(w, "Twitch sign-in unavailable; check the desktop Public client registration", 502)
		return
	}
	uri, err := url.Parse(code.URI)
	if err != nil || uri.Scheme != "https" || uri.Host != "www.twitch.tv" || uri.Path != "/activate" || uri.User != nil || uri.Fragment != "" {
		http.Error(w, "Twitch returned an invalid activation link; try again", 502)
		return
	}
	state, binding := randomValue(), randomValue()
	interval := max(5, code.Interval)
	s.mu.Lock()
	s.pruneLocked(time.Now())
	if len(s.pending) >= maxEntries {
		s.mu.Unlock()
		http.Error(w, "login capacity reached", 503)
		return
	}
	s.pending[state] = pending{
		binding: sha256.Sum256([]byte(binding)), expires: time.Now().Add(time.Duration(min(code.Expires, 1800)) * time.Second),
		returnTo: returnTo, account: account,
		device: &deviceLogin{code: code.DeviceCode, scopes: scopes, interval: interval, nextPoll: time.Now().Add(time.Duration(interval) * time.Second)},
	}
	s.mu.Unlock()
	s.cookie(w, "chatty_cat_oauth", binding, min(code.Expires, 1800))
	nonce := randomValue()
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
	_ = devicePage.Execute(w, struct {
		Code, URI, State, Nonce, ReturnTo string
		Interval                          int
	}{code.UserCode, code.URI, state, nonce, returnTo, interval})
}

func (s *Service) pollDeviceLogin(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.PublicClient || !s.sameHost(r) || !equal(r.Header.Get("Origin"), s.origin) {
		http.Error(w, "invalid sign-in origin", 403)
		return
	}
	state := r.URL.Query().Get("state")
	cookie, err := r.Cookie("chatty_cat_oauth")
	s.mu.Lock()
	p, ok := s.pending[state]
	if err != nil || !ok || p.device == nil || p.binding != sha256.Sum256([]byte(cookie.Value)) || !time.Now().Before(p.expires) {
		s.mu.Unlock()
		http.Error(w, "Sign-in expired; go back and try again", 400)
		return
	}
	d := p.device
	if d.polling || time.Now().Before(d.nextPoll) {
		interval := d.interval
		s.mu.Unlock()
		w.Header().Set("Retry-After", strconv.Itoa(interval))
		w.WriteHeader(http.StatusAccepted)
		return
	}
	d.polling = true
	d.nextPoll = time.Now().Add(time.Duration(d.interval) * time.Second)
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		d.polling = false
		s.mu.Unlock()
	}()

	values := url.Values{"client_id": {s.cfg.ClientID}, "scopes": {d.scopes}, "device_code": {d.code}, "grant_type": {"urn:ietf:params:oauth:grant-type:device_code"}}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, s.cfg.TokenURL, strings.NewReader(values.Encode()))
	if err != nil {
		http.Error(w, "Sign-in unavailable; go back and try again", 503)
		return
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := s.client.Do(req)
	if err != nil {
		w.Header().Set("Retry-After", "10")
		w.WriteHeader(http.StatusAccepted)
		return
	}
	defer res.Body.Close()
	var result struct {
		tokens
		Message string `json:"message"`
		Error   string `json:"error"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&result) != nil {
		http.Error(w, "Sign-in unavailable; go back and try again", 502)
		return
	}
	message := result.Message
	if message == "" {
		message = result.Error
	}
	if res.StatusCode != 200 && (message == "authorization_pending" || message == "slow_down" || res.StatusCode == 429 || res.StatusCode >= 500) {
		s.mu.Lock()
		if message == "slow_down" || res.StatusCode == 429 {
			d.interval += 5
		}
		if retry, err := strconv.Atoi(res.Header.Get("Retry-After")); err == nil {
			d.interval = max(d.interval, min(retry, 1800))
		}
		interval := d.interval
		d.nextPoll = time.Now().Add(time.Duration(interval) * time.Second)
		s.mu.Unlock()
		w.Header().Set("Retry-After", strconv.Itoa(interval))
		w.WriteHeader(http.StatusAccepted)
		return
	}
	// Completion, rejection and replay all consume this attempt.
	s.mu.Lock()
	delete(s.pending, state)
	s.mu.Unlock()
	s.cookie(w, "chatty_cat_oauth", "", -1)
	if res.StatusCode != 200 || result.Access == "" || result.Refresh == "" || result.Expires <= 0 || result.Type != "bearer" {
		http.Error(w, "Twitch sign-in was cancelled or expired; go back and try again", 400)
		return
	}
	user, _, err := s.validate(r.Context(), result.Access)
	if err != nil || !time.Now().Before(p.expires) {
		http.Error(w, "Twitch sign-in could not be verified; go back and try again", 400)
		return
	}
	if p.account != "" && user.UserID != p.account {
		http.Error(w, "Twitch returned a different account; go back and choose the saved account", 403)
		return
	}
	if s.establishSession(w, r, result.tokens, user) {
		w.WriteHeader(http.StatusNoContent)
	}
}
