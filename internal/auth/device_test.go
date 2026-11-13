package auth

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type deviceFixture struct {
	s         *Service
	handler   http.Handler
	mode      atomic.Int32
	polls     atomic.Int32
	refreshes atomic.Int32
}

func setupDevice(t *testing.T) *deviceFixture {
	t.Helper()
	f := &deviceFixture{}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/device", "/token":
			_ = r.ParseForm()
			if r.Form.Get("client_id") != "public-client" || r.Form.Has("client_secret") || r.URL.RawQuery != "" {
				t.Error("unexpected public client credentials")
			}
			if r.URL.Path == "/device" {
				if !strings.Contains(r.Form.Get("scopes"), "user:read:emotes") {
					t.Error("missing emote consent")
				}
				uri := "https://www.twitch.tv/activate?public=true&device-code=ABCDEFGH"
				if f.mode.Load() == 8 {
					uri = "https://evil.example/activate"
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"device_code": "private-device-code", "user_code": "ABCDEFGH", "verification_uri": uri, "expires_in": 1800, "interval": 5})
				return
			}
			if r.Form.Get("grant_type") == "refresh_token" {
				if r.Form.Get("refresh_token") != "private-refresh" {
					t.Error("refresh token mismatch")
				}
				f.refreshes.Add(1)
			} else {
				if r.Form.Get("grant_type") != "urn:ietf:params:oauth:grant-type:device_code" || r.Form.Get("device_code") != "private-device-code" {
					t.Error("invalid device grant")
				}
				f.polls.Add(1)
				switch f.mode.Load() {
				case 0, 1, 2:
					w.WriteHeader(400)
					message := map[int32]string{0: "authorization_pending", 1: "slow_down", 2: "access_denied"}[f.mode.Load()]
					_ = json.NewEncoder(w).Encode(map[string]string{"message": message})
					return
				}
			}
			_, _ = w.Write([]byte(`{"access_token":"private-access","refresh_token":"private-refresh","token_type":"bearer","expires_in":3600}`))
		case "/validate":
			if r.Header.Get("Authorization") != "OAuth private-access" {
				t.Error("missing validation token")
			}
			if f.mode.Load() == 6 && f.refreshes.Load() == 0 {
				w.WriteHeader(401)
				return
			}
			user := identity{ClientID: "public-client", UserID: "42", Login: "viewer", Scopes: []string{"user:write:chat", "user:read:emotes", "chat:read", "chat:edit"}, Expires: 3600}
			if f.mode.Load() == 4 {
				user.ClientID = "other"
			}
			if f.mode.Load() == 5 {
				user.Scopes = nil
			}
			_ = json.NewEncoder(w).Encode(user)
		case "/helix/users":
			if r.Header.Get("Authorization") != "Bearer private-access" || r.Header.Get("Client-Id") != "public-client" {
				t.Error("missing public read credentials")
			}
			_, _ = w.Write([]byte(`{"data":[{"id":"42"}]}`))
		default:
			t.Errorf("unexpected request %s", r.URL.Path)
		}
	}))
	t.Cleanup(upstream.Close)
	var err error
	f.s, err = New(Config{PublicClient: true, ClientID: "public-client", PublicURL: "http://localhost:47830", DeviceURL: upstream.URL + "/device", TokenURL: upstream.URL + "/token", ValidateURL: upstream.URL + "/validate", HelixURL: upstream.URL + "/helix"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(f.s.Close)
	mux := http.NewServeMux()
	f.s.Register(mux)
	f.handler = mux
	return f
}
func (f *deviceFixture) request(method, path string, cookies []*http.Cookie, origin string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "http://localhost:47830"+path, nil)
	for _, c := range cookies {
		r.AddCookie(c)
	}
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	return w
}
func (f *deviceFixture) start(t *testing.T, query string) (string, []*http.Cookie) {
	t.Helper()
	w := f.request("GET", "/api/auth/login"+query, nil, "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), "ABCDEFGH") || strings.Contains(w.Body.String(), "private-device-code") {
		t.Fatalf("start: %d %s", w.Code, w.Body)
	}
	if !strings.Contains(w.Header().Get("Content-Security-Policy"), "script-src 'nonce-") {
		t.Fatal("missing sign-in page CSP")
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatal("missing browser binding")
	}
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	for state, p := range f.s.pending {
		if p.binding == sha256.Sum256([]byte(cookies[0].Value)) {
			return state, cookies
		}
	}
	t.Fatal("no device attempt")
	return "", nil
}
func (f *deviceFixture) ready(state string) {
	f.s.mu.Lock()
	defer f.s.mu.Unlock()
	if p, ok := f.s.pending[state]; ok {
		p.device.nextPoll = time.Time{}
	}
}
func TestPublicDeviceLoginSessionRefreshAndPublicMetadata(t *testing.T) {
	f := setupDevice(t)
	if _, err := f.s.PublicRead(context.Background(), "/users?login=viewer"); err == nil {
		t.Fatal("anonymous metadata unexpectedly authorized")
	}
	state, cookies := f.start(t, "?channel=room")
	path := "/api/auth/device?state=" + url.QueryEscape(state)
	w := f.request("POST", path, cookies, f.s.origin)
	if w.Code != 202 || f.polls.Load() != 0 {
		t.Fatal("early polling reached Twitch")
	}
	f.ready(state)
	w = f.request("POST", path, cookies, f.s.origin)
	if w.Code != 202 || w.Header().Get("Retry-After") != "5" {
		t.Fatal("pending flow", w.Code, w.Body)
	}
	f.mode.Store(1)
	f.ready(state)
	w = f.request("POST", path, cookies, f.s.origin)
	if w.Code != 202 || w.Header().Get("Retry-After") != "10" {
		t.Fatal("slowdown ignored")
	}
	f.mode.Store(3)
	f.ready(state)
	w = f.request("POST", path, cookies, f.s.origin)
	if w.Code != 204 {
		t.Fatalf("completion %d %s", w.Code, w.Body)
	}
	var sessionCookies []*http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == "chatty_cat_session" {
			sessionCookies = append(sessionCookies, c)
		}
	}
	if len(sessionCookies) != 1 || !sessionCookies[0].HttpOnly {
		t.Fatal("missing session")
	}
	status := f.request("GET", "/api/auth/session", sessionCookies, "")
	if !strings.Contains(status.Body.String(), `"authenticated":true`) || !strings.Contains(status.Body.String(), `"emotesEnabled":true`) || strings.Contains(status.Body.String(), "private-") {
		t.Fatal("session", status.Body)
	}
	if f.request("POST", path, cookies, f.s.origin).Code != 400 {
		t.Fatal("replay accepted")
	}
	// The serialized refresh path must omit client_secret for Public clients.
	var p *session
	f.s.mu.Lock()
	for _, sess := range f.s.sessions {
		p = sess
	}
	f.s.mu.Unlock()
	f.mode.Store(6)
	p.mu.Lock()
	p.validated = time.Time{}
	if !f.s.check(context.Background(), p, time.Now()) {
		t.Error("public refresh failed")
	}
	p.mu.Unlock()
	if f.refreshes.Load() != 1 {
		t.Fatal("refresh not attempted")
	}
	data, err := f.s.PublicRead(context.Background(), "/users?login=viewer")
	if err != nil || !strings.Contains(string(data), `"id":"42"`) {
		t.Fatal("public metadata", err, string(data))
	}
}
func TestDeviceLoginBoundaries(t *testing.T) {
	for _, name := range []string{"missing-cookie", "wrong-cookie", "origin", "expired", "denied", "wrong-client", "missing-scope", "account-mismatch"} {
		t.Run(name, func(t *testing.T) {
			f := setupDevice(t)
			query := ""
			if name == "account-mismatch" {
				query = "?account=43"
			}
			state, cookies := f.start(t, query)
			f.ready(state)
			f.mode.Store(3)
			origin := f.s.origin
			switch name {
			case "missing-cookie":
				cookies = nil
			case "wrong-cookie":
				cookies = []*http.Cookie{{Name: "chatty_cat_oauth", Value: "wrong"}}
			case "origin":
				origin = "https://evil.example"
			case "expired":
				f.s.mu.Lock()
				p := f.s.pending[state]
				p.expires = time.Now().Add(-time.Minute)
				f.s.pending[state] = p
				f.s.mu.Unlock()
			case "denied":
				f.mode.Store(2)
			case "wrong-client":
				f.mode.Store(4)
			case "missing-scope":
				f.mode.Store(5)
			}
			w := f.request("POST", "/api/auth/device?state="+state, cookies, origin)
			if w.Code < 400 || len(f.s.sessions) != 0 || strings.Contains(w.Body.String(), "private-") {
				t.Fatalf("unsafe outcome %d %s", w.Code, w.Body)
			}
		})
	}
}
func TestDeviceConfigurationAndActivationURL(t *testing.T) {
	for _, cfg := range []Config{{PublicClient: true, ClientID: "id", PublicURL: "https://chat.subcult.tv"}, {PublicClient: true, ClientID: "id", ClientSecret: "secret", PublicURL: "http://localhost:47830"}} {
		if s, err := New(cfg); err == nil {
			s.Close()
			t.Fatal("invalid public configuration accepted")
		}
	}
	f := setupDevice(t)
	f.mode.Store(8)
	if w := f.request("GET", "/api/auth/login", nil, ""); w.Code != 502 {
		t.Fatal("unsafe activation URL accepted")
	}
	if f.request("GET", "/api/auth/callback?code=anything", nil, "").Code != 400 {
		t.Fatal("public client accepted web callback")
	}
	if f.request("POST", "/api/auth/device", nil, "https://evil.example").Code != 403 {
		t.Fatal("forged device request accepted")
	}
}
