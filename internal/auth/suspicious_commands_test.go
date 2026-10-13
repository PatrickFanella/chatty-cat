package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSuspiciousCommandsRequireExactArgumentsAndAcknowledgement(t *testing.T) {
	for _, text := range []string{"/monitor", "/restrict bad!", "/unmonitor alice extra", "/unrestrict alice extra"} {
		if _, err := parseCommand(text); err == nil {
			t.Fatal(text)
		}
	}
	f := setup(t)
	p := &session{tokens: tokens{Access: "fixture"}, user: identity{UserID: "42", Scopes: []string{suspiciousManageScope}}}
	writes := 0
	bad := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/users" {
			id := "123"
			if r.URL.Query().Get("login") == "alice" {
				id = "456"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"id": id, "login": r.URL.Query().Get("login")}}})
			return
		}
		if r.URL.Path != "/moderation/suspicious_users" || r.URL.Query().Get("moderator_id") != "42" || r.URL.Query().Get("broadcaster_id") != "123" {
			t.Error("wrong destination", r.URL)
		}
		writes++
		state := "NO_TREATMENT"
		if r.Method == http.MethodPost {
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["user_id"] != "456" {
				t.Error(body)
			}
			state = body["status"]
		} else if r.Method != http.MethodDelete || r.URL.Query().Get("user_id") != "456" {
			t.Error(r.Method, r.URL)
		}
		if bad {
			state = "WRONG"
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"broadcaster_id": "123", "moderator_id": "42", "user_id": "456", "status": state, "updated_at": "2026-10-12T12:00:00Z"}}})
	}))
	defer upstream.Close()
	f.service.cfg.HelixURL = upstream.URL
	for _, verb := range []string{"monitor", "restrict", "unmonitor", "unrestrict"} {
		v, status := f.service.command(context.Background(), p, sendInput{Channel: "one", Message: "/" + verb + " alice", ExpectedBroadcasterID: "123", ExpectedTargetID: "456"})
		if !v.Sent || status != 200 {
			t.Fatal(verb, v, status)
		}
	}
	bad = true
	v, _ := f.service.command(context.Background(), p, sendInput{Channel: "one", Message: "/monitor alice"})
	if !v.Uncertain || v.Sent {
		t.Fatal(v)
	}
	before := writes
	v, status := f.service.command(context.Background(), p, sendInput{Channel: "one", Message: "/restrict alice", ExpectedTargetID: "999"})
	if status != 409 || v.Sent || writes != before {
		t.Fatal("identity guard", v)
	}
	p.user.Scopes = nil
	v, status = f.service.command(context.Background(), p, sendInput{Channel: "one", Message: "/restrict alice"})
	if status != 403 || writes != before {
		t.Fatal("scope guard", v)
	}
}
