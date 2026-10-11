package auth

import (
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

type fixture struct {
	service                   *Service
	handler                   http.Handler
	tokenCalls, validateCalls atomic.Int32
	mode                      atomic.Int32
}

func setup(t *testing.T) *fixture {
	t.Helper()
	f := &fixture{}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/token" {
			f.tokenCalls.Add(1)
			if err := r.ParseForm(); err != nil {
				t.Error(err)
			}
			if r.Form.Get("client_secret") != "server-secret" || r.Form.Get("client_id") != "client" {
				t.Error("missing credentials")
			}
			if r.URL.RawQuery != "" {
				t.Error("credentials in URL")
			}
			if f.mode.Load() == 4 {
				http.Error(w, "secret-failure-body", 400)
				return
			}
			if r.Form.Get("grant_type") == "authorization_code" && r.Form.Get("redirect_uri") != "https://chat.subcult.tv/api/auth/callback" {
				t.Error("callback mismatch")
			}
			if r.Form.Get("grant_type") == "refresh_token" && r.Form.Get("refresh_token") != "refresh%+&" {
				t.Error("refresh encoding")
			}
			if _, err := w.Write([]byte(`{"access_token":"access-secret","refresh_token":"refresh%+&","expires_in":3600,"token_type":"bearer"}`)); err != nil {
				t.Error(err)
			}
			return
		}
		f.validateCalls.Add(1)
		if r.Header.Get("Authorization") != "OAuth access-secret" {
			t.Error("missing token header")
		}
		if f.mode.Load() == 1 && f.validateCalls.Load() == 2 {
			http.Error(w, "revoked", http.StatusUnauthorized)
			return
		}
		if f.mode.Load() == 5 {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
			return
		}
		user := identity{ClientID: "client", Login: "viewer", UserID: "42", Scopes: []string{"user:write:chat"}, Expires: 3600}
		if f.mode.Load() == 2 {
			user.ClientID = "other"
		}
		if f.mode.Load() == 3 {
			user.Scopes = nil
		}
		if f.mode.Load() == 6 {
			user.UserID = "43"
		}
		if err := json.NewEncoder(w).Encode(user); err != nil {
			t.Error(err)
		}
	}))
	t.Cleanup(upstream.Close)
	s, err := New(Config{ClientID: "client", ClientSecret: "server-secret", PublicURL: "https://chat.subcult.tv", AuthorizeURL: upstream.URL + "/authorize", TokenURL: upstream.URL + "/token", ValidateURL: upstream.URL + "/validate"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	f.service = s
	mux := http.NewServeMux()
	s.Register(mux)
	f.handler = mux
	return f
}
func (f *fixture) request(method, path string, cookies []*http.Cookie, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, "https://chat.subcult.tv"+path, nil)
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	res := httptest.NewRecorder()
	f.handler.ServeHTTP(res, req)
	return res
}
func (f *fixture) start(t *testing.T) (string, []*http.Cookie) {
	t.Helper()
	res := f.request("GET", "/api/auth/login?channel=hasanabi,other", nil, nil)
	if res.Code != 302 {
		t.Fatalf("login %d %s", res.Code, res.Body)
	}
	u, err := url.Parse(res.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	if q.Get("redirect_uri") != "https://chat.subcult.tv/api/auth/callback" || q.Get("response_type") != "code" || q.Get("scope") != "user:write:chat user:read:emotes chat:read chat:edit "+commandScopes {
		t.Fatal("authorization parameters")
	}
	cookies := res.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || !cookies[0].Secure || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatal("unsafe binding cookie")
	}
	return q.Get("state"), cookies
}
func (f *fixture) signin(t *testing.T) ([]*http.Cookie, string) {
	t.Helper()
	state, cookies := f.start(t)
	res := f.request("GET", "/api/auth/callback?code=code&state="+state, cookies, nil)
	if res.Code != 303 || res.Header().Get("Location") != "/?channel=hasanabi%2Cother" {
		t.Fatalf("callback %d %s %s", res.Code, res.Header().Get("Location"), res.Body)
	}
	var sessionCookies []*http.Cookie
	for _, cookie := range res.Result().Cookies() {
		if cookie.Name == "chatthing_session" {
			sessionCookies = append(sessionCookies, cookie)
		}
	}
	status := f.request("GET", "/api/auth/session", sessionCookies, nil)
	var data map[string]any
	if err := json.Unmarshal(status.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if data["authenticated"] != true || data["login"] != "viewer" {
		t.Fatalf("session %s", status.Body)
	}
	for _, secret := range []string{"access-secret", "refresh%", "server-secret"} {
		if strings.Contains(status.Body.String(), secret) {
			t.Fatal("leaked credential")
		}
	}
	return sessionCookies, data["csrf"].(string)
}
func TestLoginSessionLogout(t *testing.T) {
	f := setup(t)
	cookies, csrf := f.signin(t)
	for _, headers := range []map[string]string{{"Origin": "https://evil.example", "X-CSRF-Token": csrf}, {"Origin": "https://chat.subcult.tv", "X-CSRF-Token": "wrong"}} {
		if f.request("POST", "/api/auth/logout", cookies, headers).Code != 403 {
			t.Fatal("forged logout accepted")
		}
	}
	res := f.request("POST", "/api/auth/logout", cookies, map[string]string{"Origin": "https://chat.subcult.tv", "X-CSRF-Token": csrf})
	if res.Code != 204 {
		t.Fatal(res.Code)
	}
	if strings.Contains(f.request("GET", "/api/auth/session", cookies, nil).Body.String(), `"authenticated":true`) {
		t.Fatal("session survived logout")
	}
}
func TestStateBinding(t *testing.T) {
	for _, name := range []string{"missing", "wrong-browser", "expired", "denied", "replay", "missing-code"} {
		t.Run(name, func(t *testing.T) {
			f := setup(t)
			state, cookies := f.start(t)
			query := "?code=code&state=" + state
			switch name {
			case "missing":
				cookies = nil
			case "wrong-browser":
				cookies = []*http.Cookie{{Name: "chatthing_oauth", Value: "wrong"}}
			case "expired":
				f.service.mu.Lock()
				p := f.service.pending[state]
				p.expires = time.Now().Add(-time.Second)
				f.service.pending[state] = p
				f.service.mu.Unlock()
			case "denied":
				query = "?error=access_denied&state=" + state
			case "missing-code":
				query = "?state=" + state
			}
			res := f.request("GET", "/api/auth/callback"+query, cookies, nil)
			switch name {
			case "denied", "missing-code":
				if res.Code != 303 {
					t.Fatal(res.Code)
				}
			case "replay":
				res = f.request("GET", "/api/auth/callback"+query, cookies, nil)
				if res.Code != 400 {
					t.Fatal("replay accepted")
				}
			default:
				if res.Code != 400 {
					t.Fatal("bad state accepted")
				}
			}
			if name != "replay" && f.tokenCalls.Load() != 0 {
				t.Fatal("exchanged invalid state")
			}
		})
	}
}
func TestProviderFailures(t *testing.T) {
	for _, mode := range []int32{2, 3, 4, 5} {
		t.Run(string(rune('0'+mode)), func(t *testing.T) {
			f := setup(t)
			f.mode.Store(mode)
			state, cookies := f.start(t)
			res := f.request("GET", "/api/auth/callback?code=code&state="+state, cookies, nil)
			if res.Header().Get("Location") != "/?channel=hasanabi%2Cother&auth=failed" || len(f.service.sessions) != 0 {
				t.Fatal("invalid provider accepted")
			}
			if strings.Contains(res.Body.String(), "secret") {
				t.Fatal("error body leaked")
			}
		})
	}
}
func TestRefreshAndValidation(t *testing.T) {
	for _, mode := range []int32{0, 1, 5, 6} {
		t.Run(string(rune('0'+mode)), func(t *testing.T) {
			f := setup(t)
			cookies, _ := f.signin(t)
			f.mode.Store(mode)
			key := sha256.Sum256([]byte(cookies[0].Value))
			p := f.service.sessions[key]
			p.mu.Lock()
			p.validated = time.Now().Add(-time.Hour)
			p.mu.Unlock()
			f.service.maintain(time.Now())
			res := f.request("GET", "/api/auth/session", cookies, nil)
			want := mode == 0 || mode == 1
			if strings.Contains(res.Body.String(), `"authenticated":true`) != want {
				t.Fatal("validation lifecycle mismatch")
			}
			if mode == 1 && f.tokenCalls.Load() != 2 {
				t.Fatal("did not refresh")
			}
		})
	}
}
func TestConfigAndBounds(t *testing.T) {
	for _, cfg := range []Config{{ClientID: "only"}, {PublicURL: "http://chat.subcult.tv"}, {PublicURL: "https://chat.subcult.tv/path"}, {PublicURL: "https://user@chat.subcult.tv"}} {
		if s, err := New(cfg); err == nil {
			s.Close()
			t.Fatal("invalid configuration accepted")
		}
	}
	s, err := New(Config{PublicURL: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	mux := http.NewServeMux()
	s.Register(mux)
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, httptest.NewRequest("GET", "http://localhost:8080/api/auth/login", nil))
	if res.Code != 503 {
		t.Fatal("unconfigured login accepted")
	}
	f := setup(t)
	res = httptest.NewRecorder()
	f.handler.ServeHTTP(res, httptest.NewRequest("GET", "http://localhost:8080/api/auth/login", nil))
	if res.Code != 400 {
		t.Fatal("wrong origin accepted")
	}
	for i := 0; i < cap(f.service.slots); i++ {
		f.service.slots <- struct{}{}
	}
	if f.request("GET", "/api/auth/session", nil, nil).Code != 503 {
		t.Fatal("capacity missing")
	}
	for i := 0; i < cap(f.service.slots); i++ {
		<-f.service.slots
	}
	f.service.pending["expired"] = pending{expires: time.Now().Add(-time.Second)}
	f.service.sessions[[32]byte{}] = &session{expires: time.Now().Add(-time.Second)}
	f.service.maintain(time.Now())
	if len(f.service.pending) != 0 || len(f.service.sessions) != 0 {
		t.Fatal("expired entries retained")
	}
}
