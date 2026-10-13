package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAdvancedModerationValidation(t *testing.T) {
	for _, s := range []string{"/warn alice", "/warn bad! reason", "/banid nope", "/banid 0", "/shield extra", "/shieldoff extra", "/untimeout alice extra"} {
		if _, err := parseCommand(s); err == nil {
			t.Fatal(s)
		}
	}
	for _, s := range []string{"/warn alice reason", "/banid 456 reason", "/shield", "/shieldoff", "/untimeout alice"} {
		if _, err := parseCommand(s); err != nil {
			t.Fatal(s, err)
		}
	}
}
func TestAdvancedModerationDeliveryAndAcknowledgement(t *testing.T) {
	f := setup(t)
	p := &session{tokens: tokens{Access: "fixture"}, user: identity{UserID: "42", Scopes: strings.Fields(commandScopes)}}
	var method, path string
	var body map[string]any
	writes := 0
	bad := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/users" {
			login := r.URL.Query().Get("login")
			id := "123"
			if login == "alice" {
				id = "456"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"id": id, "login": login}}})
			return
		}
		writes++
		method, path = r.Method, r.URL.Path
		body = nil
		if r.ContentLength > 0 {
			_ = json.NewDecoder(r.Body).Decode(&body)
		}
		if bad {
			_, _ = w.Write([]byte(`{"data":[{}]}`))
			return
		}
		if path == "/moderation/warnings" {
			_, _ = w.Write([]byte(`{"data":[{"broadcaster_id":"123","moderator_id":"42","user_id":"456","reason":"reason"}]}`))
		} else if path == "/moderation/shield_mode" {
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"is_active": body["is_active"]}}})
		} else if r.Method == "POST" && path == "/moderation/bans" {
			_, _ = w.Write([]byte(`{"data":[{"broadcaster_id":"123","user_id":"456"}]}`))
		} else {
			w.WriteHeader(204)
		}
	}))
	defer upstream.Close()
	f.service.cfg.HelixURL = upstream.URL
	for _, tc := range []struct{ text, method, path string }{{"/warn alice reason", "POST", "/moderation/warnings"}, {"/shield", "PUT", "/moderation/shield_mode"}, {"/shieldoff", "PUT", "/moderation/shield_mode"}, {"/banid 456 reason", "POST", "/moderation/bans"}, {"/untimeout alice", "DELETE", "/moderation/bans"}} {
		v, status := f.service.command(context.Background(), p, sendInput{Channel: "one", Message: tc.text, ExpectedBroadcasterID: "123", ExpectedTargetID: "456"})
		if status != 200 || !v.Sent || method != tc.method || path != tc.path {
			t.Fatal(tc, v, status, method, path)
		}
		if tc.text == "/banid 456 reason" && body["data"].(map[string]any)["user_id"] != "456" {
			t.Fatal(body)
		}
	}
	bad = true
	for _, s := range []string{"/warn alice reason", "/shield", "/banid 456"} {
		v, _ := f.service.command(context.Background(), p, sendInput{Channel: "one", Message: s})
		if v.Sent || !v.Uncertain {
			t.Fatal(s, v)
		}
	}
	before := writes
	v, status := f.service.command(context.Background(), p, sendInput{Channel: "one", Message: "/banid 456", ExpectedTargetID: "999"})
	if status != 409 || v.Sent || writes != before {
		t.Fatal(v, status, writes)
	}
	p.user.Scopes = nil
	v, status = f.service.command(context.Background(), p, sendInput{Channel: "one", Message: "/warn alice reason"})
	if status != 403 || v.Sent || writes != before {
		t.Fatal(v, status, writes)
	}
}
