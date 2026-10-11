package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAccountEmotes(t *testing.T) {
	f := setup(t)
	cookies, _ := f.signin(t)
	f.service.mu.Lock()
	var p *session
	for _, value := range f.service.sessions {
		p = value
	}
	f.service.mu.Unlock()
	p.mu.Lock()
	p.user.Scopes = append(p.user.Scopes, "user:read:emotes")
	p.mu.Unlock()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer access-secret" {
			t.Error("missing server-held token")
		}
		if r.URL.Path == "/users" {
			if _, err := w.Write([]byte(`{"data":[{"id":"123","login":"hasanabi"}]}`)); err != nil {
				t.Error(err)
			}
			return
		}
		if r.URL.Path != "/chat/emotes/user" || r.URL.Query().Get("user_id") != "42" || r.URL.Query().Get("broadcaster_id") != "123" {
			t.Error("wrong account query")
		}
		if r.URL.Query().Get("after") == "bad" {
			http.Error(w, "upstream secret", 500)
			return
		}
		if r.URL.Query().Get("after") == "invalid" {
			if _, err := w.Write([]byte(`{"pagination":{"cursor":"\n"}}`)); err != nil {
				t.Error(err)
			}
			return
		}
		if err := json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"id": "25", "name": "Kappa", "format": []string{"static"}, "scale": []string{"1.0", "2.0"}, "theme_mode": []string{"dark"}}, {"id": "emotesv2_abc", "name": "SubDance", "format": []string{"animated", "static"}, "theme_mode": []string{"light"}}, {"id": "unsafe/id", "name": "Bad"}}, "pagination": map[string]string{"cursor": "next+page"}}); err != nil {
			t.Error(err)
		}
	}))
	defer upstream.Close()
	f.service.cfg.HelixURL = upstream.URL
	res := f.request("GET", "/api/auth/emotes?channel=hasanabi&after=next%2Bpage", cookies, nil)
	if res.Code != 200 || strings.Contains(res.Body.String(), "access-secret") {
		t.Fatal(res.Code, res.Body.String())
	}
	var result struct {
		Emotes []accountEmote
		After  string
	}
	if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Emotes) != 2 || result.Emotes[0].Animated || !result.Emotes[1].Animated || !strings.Contains(result.Emotes[1].URL, "animated/light/1.0") || result.After != "next+page" {
		t.Fatal(result)
	}
	for _, tc := range []struct {
		path string
		code int
	}{{"?channel=bad!", 400}, {"?user_id=other", 400}, {"?after=%0A", 400}, {"?after=" + strings.Repeat("a", 513), 400}, {"?channel=hasanabi&after=bad", 502}, {"?channel=hasanabi&after=invalid", 502}} {
		if r := f.request("GET", "/api/auth/emotes"+tc.path, cookies, nil); r.Code != tc.code || strings.Contains(r.Body.String(), "upstream secret") {
			t.Fatal(tc, r.Code, r.Body.String())
		}
	}
	if r := f.request("GET", "/api/auth/emotes", nil, nil); r.Code != 401 {
		t.Fatal(r.Code)
	}
	p.mu.Lock()
	p.emoteRequests = 60
	p.emoteWindow = time.Now()
	p.mu.Unlock()
	if r := f.request("GET", "/api/auth/emotes", cookies, nil); r.Code != 429 {
		t.Fatal(r.Code)
	}
	p.mu.Lock()
	p.user.Scopes = []string{"user:write:chat"}
	p.mu.Unlock()
	if r := f.request("GET", "/api/auth/emotes", cookies, nil); r.Code != 403 {
		t.Fatal(r.Code)
	}
	p.mu.Lock()
	p.invalid = true
	p.mu.Unlock()
	if r := f.request("GET", "/api/auth/emotes", cookies, nil); r.Code != 401 {
		t.Fatal(r.Code)
	}
}
