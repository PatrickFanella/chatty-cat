package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestExtendedCommandBindings(t *testing.T) {
	f := setup(t)
	p := &session{tokens: tokens{Access: "access-secret"}, user: identity{UserID: "42", Scopes: strings.Fields(commandScopes)}}
	var method, path string
	var query url.Values
	mutations := 0
	status := 204
	response := `{"data":[{"created_at":"2026-10-11T12:00:00Z"}]}`
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/users" {
			login := r.URL.Query().Get("login")
			id := "99"
			if login == "owner" {
				id = "42"
			}
			if login == "missing" {
				id = ""
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"id": id, "login": login}}})
			return
		}
		mutations++
		method, path, query = r.Method, r.URL.Path, r.URL.Query()
		w.WriteHeader(status)
		if status == 200 {
			_, _ = w.Write([]byte(response))
		}
	}))
	defer upstream.Close()
	f.service.cfg.HelixURL = upstream.URL
	for _, tc := range []struct {
		text, method, path string
		query              url.Values
	}{
		{"/raid alice", "POST", "/raids", url.Values{"from_broadcaster_id": {"42"}, "to_broadcaster_id": {"99"}}},
		{"/unraid", "DELETE", "/raids", url.Values{"broadcaster_id": {"42"}}},
		{"/mod alice", "POST", "/moderation/moderators", url.Values{"broadcaster_id": {"42"}, "user_id": {"99"}}},
		{"/unmod alice", "DELETE", "/moderation/moderators", url.Values{"broadcaster_id": {"42"}, "user_id": {"99"}}},
		{"/vip alice", "POST", "/channels/vips", url.Values{"broadcaster_id": {"42"}, "user_id": {"99"}}},
		{"/unvip alice", "DELETE", "/channels/vips", url.Values{"broadcaster_id": {"42"}, "user_id": {"99"}}},
		{"/block alice", "PUT", "/users/blocks", url.Values{"target_user_id": {"99"}}},
		{"/unblock alice", "DELETE", "/users/blocks", url.Values{"target_user_id": {"99"}}},
		{"/shoutout alice", "POST", "/chat/shoutouts", url.Values{"from_broadcaster_id": {"42"}, "to_broadcaster_id": {"99"}, "moderator_id": {"42"}}},
	} {
		t.Run(tc.text, func(t *testing.T) {
			status = 204
			if tc.text == "/raid alice" {
				status = 200
			}
			result, code := f.service.command(context.Background(), p, sendInput{Channel: "owner", Message: tc.text})
			if code != 200 || !result.Sent || method != tc.method || path != tc.path || query.Encode() != tc.query.Encode() {
				t.Fatal(result, code, method, path, query)
			}
		})
	}
	for _, text := range []string{"/raid alice", "/unraid", "/mod alice", "/vip alice", "/unvip alice", "/unmod alice"} {
		before := mutations
		_, code := f.service.command(context.Background(), p, sendInput{Channel: "other", Message: text})
		if code != 403 || before != mutations {
			t.Fatal(text, code, mutations)
		}
	}
	for _, text := range []string{"/raid owner", "/mod owner", "/vip owner", "/block owner", "/unblock owner", "/shoutout owner"} {
		before := mutations
		_, code := f.service.command(context.Background(), p, sendInput{Channel: "owner", Message: text})
		if code != 400 || before != mutations {
			t.Fatal(text, code, mutations)
		}
	}
	for _, text := range []string{"/raid missing", "/block missing"} {
		before := mutations
		_, code := f.service.command(context.Background(), p, sendInput{Channel: "owner", Message: text})
		if code != 404 || before != mutations {
			t.Fatal(text, code, mutations)
		}
	}
	for _, rejection := range []int{422, 425} {
		status = rejection
		result, code := f.service.command(context.Background(), p, sendInput{Channel: "owner", Message: "/vip alice"})
		if code != rejection || result.Uncertain || result.Sent {
			t.Fatal(result, code)
		}
	}
	for _, tc := range []struct {
		text   string
		status int
		body   string
	}{
		{"/raid alice", 204, ""}, {"/raid alice", 200, `{"data":[{}]}`}, {"/raid alice", 200, `{"data":[{"created_at":"invalid"}]}`}, {"/block alice", 200, `{"data":[{}]}`},
	} {
		status, response = tc.status, tc.body
		result, code := f.service.command(context.Background(), p, sendInput{Channel: "owner", Message: tc.text})
		if code != 502 || !result.Uncertain || result.Sent {
			t.Fatal(tc, result, code)
		}
	}
	p.user.Scopes = nil
	before := mutations
	_, code := f.service.command(context.Background(), p, sendInput{Channel: "owner", Message: "/block alice"})
	if code != 403 || before != mutations {
		t.Fatal(code, mutations)
	}
}
func TestExtendedCommandValidation(t *testing.T) {
	for _, input := range []string{"/raid", "/raid @bad!", "/unraid extra", "/mod alice extra", "/unmod", "/vip", "/unvip bad!", "/block", "/unblock alice extra", "/shoutout"} {
		if _, err := parseCommand(input); err == nil {
			t.Fatal(input)
		}
	}
	for _, input := range []string{"/RAID @Alice", "/unraid", "/mod alice", "/unmod alice", "/vip alice", "/unvip alice", "/block alice", "/unblock alice", "/shoutout alice"} {
		if _, err := parseCommand(input); err != nil {
			t.Fatal(input, err)
		}
	}
}
