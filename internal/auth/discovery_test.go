package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestDiscoveryConsent(t *testing.T) {
	f := setup(t)
	for _, tc := range []struct{ query, want string }{{"", ""}, {"follows", "user:read:follows"}, {"chatters", "moderator:read:chatters"}} {
		res := f.request("GET", "/api/auth/login?discovery="+tc.query, nil, nil)
		if res.Code != 302 {
			t.Fatal(res.Code)
		}
		u, _ := url.Parse(res.Header().Get("Location"))
		scope := u.Query().Get("scope")
		if tc.want != "" && !strings.Contains(scope, tc.want) {
			t.Fatal(scope)
		}
		if tc.want == "" && (strings.Contains(scope, "user:read:follows") || strings.Contains(scope, "moderator:read:chatters")) {
			t.Fatal("unexpected optional consent")
		}
	}
	if res := f.request("GET", "/api/auth/login?discovery=arbitrary", nil, nil); res.Code != 400 {
		t.Fatal(res.Code)
	}
}
func TestDiscoveryAccountPagesPermissionsAndRateLimit(t *testing.T) {
	f := setup(t)
	cookies, _ := f.signin(t)
	f.service.mu.Lock()
	var p *session
	for _, value := range f.service.sessions {
		p = value
	}
	f.service.mu.Unlock()
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Method != "GET" || r.Header.Get("Authorization") != "Bearer access-secret" {
			t.Error("credential/method boundary")
		}
		q := r.URL.Query()
		if r.URL.Path == "/users" {
			if q.Get("login") != "alice" {
				t.Error(q)
			}
			_, _ = w.Write([]byte(`{"data":[{"id":"100"}]}`))
			return
		}
		if q.Get("after") == "denied" {
			http.Error(w, "upstream-secret", http.StatusForbidden)
			return
		}
		if q.Get("after") == "limited" {
			w.Header().Set("Ratelimit-Reset", strconv.FormatInt(time.Now().Add(5*time.Minute).Unix(), 10))
			http.Error(w, "upstream-secret", http.StatusTooManyRequests)
			return
		}
		if q.Get("after") == "malformed" {
			_, _ = w.Write([]byte(`{"data":[],"pagination":{"cursor":"\n"}}`))
			return
		}
		row := map[string]any{"broadcaster_id": "100", "broadcaster_login": "alice", "broadcaster_name": "Alice"}
		if r.URL.Path == "/chat/chatters" {
			if q.Get("moderator_id") != "42" || q.Get("broadcaster_id") != "100" || q.Has("user_id") {
				t.Error(q)
			}
			row = map[string]any{"user_id": "101", "user_login": "bob", "user_name": "Bob"}
		} else if q.Get("user_id") != "42" {
			t.Error(q)
		}
		if r.URL.Path == "/streams/followed" {
			row = map[string]any{"user_id": "100", "user_login": "alice", "user_name": "Alice", "title": "Live title", "game_name": "Music", "viewer_count": 10}
		}
		if err := json.NewEncoder(w).Encode(map[string]any{"data": []any{row}, "total": 1, "pagination": map[string]string{"cursor": "next+page"}}); err != nil {
			t.Error(err)
		}
	}))
	defer upstream.Close()
	f.service.cfg.HelixURL = upstream.URL
	if res := f.request("GET", "/api/auth/discovery?kind=live", cookies, nil); res.Code != 403 || calls.Load() != 0 {
		t.Fatal(res.Code, calls.Load())
	}
	p.mu.Lock()
	p.user.Scopes = append(p.user.Scopes, "user:read:follows", "moderator:read:chatters")
	p.mu.Unlock()
	for _, path := range []string{"?kind=live", "?kind=followed&after=next%2Bpage", "?kind=chatters&channel=alice"} {
		res := f.request("GET", "/api/auth/discovery"+path, cookies, nil)
		if res.Code != 200 || res.Header().Get("Cache-Control") != "no-store" || !strings.Contains(res.Body.String(), `"accountID":"42"`) || strings.Contains(res.Body.String(), "access-secret") {
			t.Fatal(res.Code, res.Body.String())
		}
	}
	for _, path := range []string{"?kind=bad", "?kind=live&user_id=43", "?kind=chatters&channel=bad!", "?kind=followed&after=%0A", "?kind=live&kind=followed"} {
		if res := f.request("GET", "/api/auth/discovery"+path, cookies, nil); res.Code != 400 {
			t.Fatal(path, res.Code)
		}
	}
	for _, tc := range []struct {
		after  string
		status int
	}{{"denied", 403}, {"malformed", 502}, {"limited", 429}} {
		res := f.request("GET", "/api/auth/discovery?kind=live&after="+tc.after, cookies, nil)
		if res.Code != tc.status || strings.Contains(res.Body.String(), "upstream-secret") {
			t.Fatal(tc, res.Code)
		}
	}
	before := calls.Load()
	res := f.request("GET", "/api/auth/discovery?kind=live", cookies, nil)
	delay, _ := strconv.Atoi(res.Header().Get("Retry-After"))
	if res.Code != 429 || calls.Load() != before || delay < 240 {
		t.Fatal(res.Code)
	}
	if res := f.request("GET", "/api/auth/discovery?kind=live", nil, nil); res.Code != 401 {
		t.Fatal(res.Code)
	}
}
