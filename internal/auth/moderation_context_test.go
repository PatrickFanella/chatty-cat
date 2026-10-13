package auth

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestModerationContextIsReadOnlyBoundedAndDoesNotInventRole(t *testing.T) {
	f := setup(t)
	cookies, _ := f.signin(t)
	p := f.service.sessions[sha256.Sum256([]byte(cookies[0].Value))]
	p.user.Scopes = append(p.user.Scopes, "user:read:moderated_channels")
	pages := 0
	mode := "found"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Error("unexpected write")
		}
		switch r.URL.Path {
		case "/users":
			login := r.URL.Query().Get("login")
			id := "123"
			if login == "alice" {
				id = "456"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"id": id, "login": login}}})
		case "/moderation/channels":
			pages++
			switch mode {
			case "found":
				_, _ = w.Write([]byte(`{"data":[{"broadcaster_id":"123"}],"pagination":{},"access_token":"private"}`))
			case "empty":
				_, _ = w.Write([]byte(`{"data":[],"pagination":{}}`))
			case "limit":
				_, _ = w.Write([]byte(`{"data":[],"pagination":{"cursor":"page-` + strings.Repeat("x", pages) + `"}}`))
			case "bad":
				_, _ = w.Write([]byte(`{}`))
			}
		case "/chat/settings":
			_, _ = w.Write([]byte(`{"data":[{"broadcaster_id":"123","slow_mode":true,"slow_mode_wait_time":30,"secret":"private"}]}`))
		default:
			http.Error(w, "missing", 404)
		}
	}))
	defer upstream.Close()
	f.service.cfg.HelixURL = upstream.URL
	for _, tc := range []struct {
		mode, role string
		maxPages   int
	}{{"found", "moderator", 1}, {"empty", "viewer", 1}, {"limit", "unknown", 5}, {"bad", "unknown", 1}} {
		mode = tc.mode
		pages = 0
		result := f.request("GET", "/api/auth/moderation-context?channel=one&user=alice", cookies, nil)
		var value moderationContext
		if result.Code != 200 || json.Unmarshal(result.Body.Bytes(), &value) != nil || value.Role != tc.role || pages != tc.maxPages || value.TargetID != "456" || value.Settings["slow_mode"] != true || strings.Contains(result.Body.String(), "private") {
			t.Fatal(tc, result.Code, result.Body, pages)
		}
	}
	if result := f.request("GET", "/api/auth/moderation-context?channel=one&user=alice&extra=1", cookies, nil); result.Code != 400 {
		t.Fatal("invalid query")
	}
	if result := f.request("GET", "/api/auth/moderation-context?channel=one&user=alice", nil, nil); result.Code != 401 {
		t.Fatal("missing session")
	}
}
func TestModerationExpectedIdentitiesRefuseBeforeWrite(t *testing.T) {
	f := setup(t)
	p := &session{tokens: tokens{Access: "fixture"}, user: identity{UserID: "42", Scopes: strings.Fields(commandScopes)}}
	writes := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			writes++
			http.Error(w, "unexpected write", 500)
			return
		}
		login := r.URL.Query().Get("login")
		id := "123"
		if login == "alice" {
			id = "456"
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"id": id, "login": login}}})
	}))
	defer upstream.Close()
	f.service.cfg.HelixURL = upstream.URL
	for _, input := range []sendInput{{Channel: "one", Message: "/clear", ExpectedBroadcasterID: "999"}, {Channel: "one", Message: "/timeout alice 3", ExpectedBroadcasterID: "123", ExpectedTargetID: "999"}} {
		result, status := f.service.command(context.Background(), p, input)
		if status != 409 || result.Sent || result.Uncertain || writes != 0 {
			t.Fatal(result, status, writes)
		}
	}
}

func TestModerationBroadcasterStateAndRefreshLimit(t *testing.T) {
	f := setup(t)
	cookies, _ := f.signin(t)
	p := f.service.sessions[sha256.Sum256([]byte(cookies[0].Value))]
	p.user.Scopes = append(p.user.Scopes, "moderator:manage:banned_users")
	banReads := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/users":
			id := p.user.UserID
			if r.URL.Query().Get("login") == "alice" {
				id = "456"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"id": id, "login": r.URL.Query().Get("login")}}})
		case "/chat/settings":
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"broadcaster_id": p.user.UserID, "slow_mode": 1, "slow_mode_wait_time": true, "emote_mode": false}}})
		case "/moderation/banned":
			banReads++
			_, _ = w.Write([]byte(`{"data":[{"user_id":"456","expires_at":"","reason":"private-provider-reason"}]}`))
		default:
			t.Error("unexpected membership read")
			http.Error(w, "unexpected", http.StatusNotFound)
		}
	}))
	defer upstream.Close()
	f.service.cfg.HelixURL = upstream.URL
	for i := 0; i < 12; i++ {
		r := f.request("GET", "/api/auth/moderation-context?channel=one&user=alice", cookies, nil)
		var v moderationContext
		if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &v) != nil || v.Role != "broadcaster" || v.TargetState != "Banned at this read" || len(v.Settings) != 1 || v.Settings["emote_mode"] != false || strings.Contains(r.Body.String(), "private-provider-reason") {
			t.Fatal(r.Code, r.Body)
		}
	}
	r := f.request("GET", "/api/auth/moderation-context?channel=one&user=alice", cookies, nil)
	if r.Code != http.StatusTooManyRequests || banReads != 12 {
		t.Fatal(r.Code, banReads)
	}
}
func TestDirectNumericModerationContextAndShieldState(t *testing.T) {
	f := setup(t)
	cookies, _ := f.signin(t)
	p := f.service.sessions[sha256.Sum256([]byte(cookies[0].Value))]
	p.user.Scopes = append(p.user.Scopes, "user:read:moderated_channels", "moderator:manage:shield_mode")
	lookups := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/users":
			lookups++
			if r.URL.Query().Get("login") != "one" {
				t.Error("numeric target must not be resolved as a login")
			}
			_, _ = w.Write([]byte(`{"data":[{"id":"123","login":"one"}]}`))
		case "/moderation/channels":
			_, _ = w.Write([]byte(`{"data":[{"broadcaster_id":"123"}]}`))
		case "/moderation/shield_mode":
			_, _ = w.Write([]byte(`{"data":[{"is_active":true,"private":"excluded"}]}`))
		case "/chat/settings":
			_, _ = w.Write([]byte(`{"data":[]}`))
		default:
			t.Error(r.URL)
		}
	}))
	defer upstream.Close()
	f.service.cfg.HelixURL = upstream.URL
	r := f.request("GET", "/api/auth/moderation-context?channel=one&user=456&identity=id", cookies, nil)
	var v moderationContext
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &v) != nil || v.TargetKind != "id" || v.TargetID != "456" || v.ShieldState != "Active at this read" || lookups != 1 || strings.Contains(r.Body.String(), "excluded") {
		t.Fatal(r.Code, r.Body, lookups)
	}
	for _, q := range []string{"user=0&identity=id", "user=alice&identity=id", "user=alice&identity=other"} {
		if r := f.request("GET", "/api/auth/moderation-context?channel=one&"+q, cookies, nil); r.Code != http.StatusBadRequest {
			t.Fatal(r.Code, r.Body)
		}
	}
}
