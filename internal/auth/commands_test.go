package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCommandTranslation(t *testing.T) {
	f := setup(t)
	p := &session{tokens: tokens{Access: "access-secret"}, user: identity{UserID: "42", Scopes: strings.Fields(commandScopes)}}
	var method, path string
	var query map[string][]string
	var payload map[string]any
	status := 200
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer access-secret" {
			t.Error("missing token")
		}
		if r.URL.Path == "/users" {
			login := r.URL.Query().Get("login")
			id := "123"
			if login == "alice" {
				id = "456"
			}
			if login == "missing" {
				id = ""
			}
			if err := json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"id": id, "login": login}}}); err != nil {
				t.Error(err)
			}
			return
		}
		method, path, query = r.Method, r.URL.Path, r.URL.Query()
		payload = nil
		if r.Body != nil && r.ContentLength > 0 {
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Error(err)
			}
		}
		if status != 200 && status != 204 {
			http.Error(w, "secret upstream error", status)
			return
		}
		w.WriteHeader(status)
		if status == 200 {
			if _, err := w.Write([]byte(`{"data":[{}]}`)); err != nil {
				t.Error(err)
			}
		}
	}))
	defer upstream.Close()
	f.service.cfg.HelixURL = upstream.URL
	for _, tc := range []struct {
		text, method, path, field string
		value                     any
	}{
		{"/timeout @Alice 60 spam", "POST", "/moderation/bans", "data", nil}, {"/ban alice reason", "POST", "/moderation/bans", "data", nil}, {"/unban alice", "DELETE", "/moderation/bans", "", nil}, {"/delete msg-id", "DELETE", "/moderation/chat", "", nil}, {"/clear", "DELETE", "/moderation/chat", "", nil},
		{"/slow", "PATCH", "/chat/settings", "slow_mode_wait_time", float64(30)}, {"/slowoff", "PATCH", "/chat/settings", "slow_mode", false}, {"/followers 10", "PATCH", "/chat/settings", "follower_mode_duration", float64(10)}, {"/followersoff", "PATCH", "/chat/settings", "follower_mode", false},
		{"/subscribers", "PATCH", "/chat/settings", "subscriber_mode", true}, {"/subscribersoff", "PATCH", "/chat/settings", "subscriber_mode", false}, {"/emoteonly", "PATCH", "/chat/settings", "emote_mode", true}, {"/emoteonlyoff", "PATCH", "/chat/settings", "emote_mode", false}, {"/uniquechat", "PATCH", "/chat/settings", "unique_chat_mode", true}, {"/uniquechatoff", "PATCH", "/chat/settings", "unique_chat_mode", false}, {"/r9kbeta", "PATCH", "/chat/settings", "unique_chat_mode", true}, {"/r9kbetaoff", "PATCH", "/chat/settings", "unique_chat_mode", false},
		{"/announcepurple hello world", "POST", "/chat/announcements", "color", "purple"}, {"/announce hello", "POST", "/chat/announcements", "color", "primary"}, {"/color #AA00FF", "PUT", "/chat/color", "", nil},
	} {
		t.Run(tc.text, func(t *testing.T) {
			result, code := f.service.command(context.Background(), p, sendInput{Channel: "hasanabi", Message: tc.text})
			if code != 200 || !result.Command || !result.Sent || result.MessageID != "" {
				t.Fatal(result, code)
			}
			if method != tc.method || path != tc.path {
				t.Fatal(method, path)
			}
			if tc.field != "" && tc.value != nil && payload[tc.field] != tc.value {
				t.Fatal(payload)
			}
			if tc.text != "/color #AA00FF" && (query["moderator_id"][0] != "42" || query["broadcaster_id"][0] != "123") {
				t.Fatal(query)
			}
			if strings.HasPrefix(tc.text, "/timeout") {
				data := payload["data"].(map[string]any)
				if data["duration"] != float64(60) || data["user_id"] != "456" || data["reason"] != "spam" {
					t.Fatal(payload)
				}
			}
			if strings.HasPrefix(tc.text, "/delete") && query["message_id"][0] != "msg-id" {
				t.Fatal(query)
			}
		})
	}
	for _, code := range []int{400, 403, 404, 409, 429, 500} {
		status = code
		result, actual := f.service.command(context.Background(), p, sendInput{Channel: "hasanabi", Message: "/clear"})
		if result.Sent || strings.Contains(result.Error, "secret") || (code == 500 && (!result.Uncertain || actual != 502)) {
			t.Fatal(result, actual)
		}
	}
	status = 204
	if result, code := f.service.command(context.Background(), p, sendInput{Channel: "hasanabi", Message: "/clear"}); !result.Sent || code != 200 {
		t.Fatal(result, code)
	}
	if _, code := f.service.command(context.Background(), p, sendInput{Channel: "hasanabi", Message: "/ban missing"}); code != 404 {
		t.Fatal(code)
	}
	p.user.Scopes = nil
	if _, code := f.service.command(context.Background(), p, sendInput{Channel: "hasanabi", Message: "/clear"}); code != 403 {
		t.Fatal(code)
	}
}
func TestCommandValidation(t *testing.T) {
	for _, input := range []string{"", "/unknown", "/ban", "/ban bad!", "/unban alice extra", "/timeout alice 0", "/timeout alice 1209601", "/timeout alice nope", "/clear extra", "/delete", "/delete bad/id", "/slow 2", "/slow 121", "/followers -1", "/followers 129601", "/slow 10 extra", "/announce", "/color", "/color bad", "/subscribers extra"} {
		if _, err := parseCommand(input); err == nil {
			t.Fatal(input)
		}
	}
	for _, input := range []string{"/timeout alice", "/ban Alice", "/slow 3", "/slow 120", "/followers", "/followers 129600", "/color blue", "/announcegreen hello", "/announceblue hello", "/announceorange hello"} {
		if _, err := parseCommand(input); err != nil {
			t.Fatal(input, err)
		}
	}
}
func TestCommandReceipts(t *testing.T) {
	f := setupSend(t)
	f.service.mu.Lock()
	for _, p := range f.service.sessions {
		p.mu.Lock()
		p.user.Scopes = strings.Fields(commandScopes)
		p.mu.Unlock()
	}
	f.service.mu.Unlock()
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/users" {
			if _, err := w.Write([]byte(`{"data":[{"id":"123","login":"hasanabi"}]}`)); err != nil {
				t.Error(err)
			}
			return
		}
		if r.Method != "DELETE" || r.URL.Path != "/moderation/chat" || r.URL.Query().Get("moderator_id") != "42" {
			t.Error("wrong command identity")
		}
		calls++
		w.WriteHeader(204)
	}))
	defer upstream.Close()
	f.service.cfg.HelixURL = upstream.URL
	body := sendBody("/clear", "command-request-123456")
	for range 2 {
		res := f.post(t, body, f.cookies, "https://chat.subcult.tv", f.csrf)
		if res.Code != 200 || !strings.Contains(res.Body.String(), `"command":true`) {
			t.Fatal(res.Code, res.Body.String())
		}
	}
	if calls != 1 {
		t.Fatal("command repeated", calls)
	}
	res := f.post(t, sendBody("/slow 10", "command-request-123456"), f.cookies, "https://chat.subcult.tv", f.csrf)
	if res.Code != 409 {
		t.Fatal(res.Code)
	}
}

func TestWhisperRequest(t *testing.T) {
	f := setup(t)
	p := &session{tokens: tokens{Access: "secret"}, user: identity{UserID: "42", Scopes: []string{"user:manage:whispers"}}}
	status := 204
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/users" {
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"id": "99", "login": "alice"}}})
			return
		}
		if r.Method != "POST" || r.URL.Path != "/whispers" || r.URL.Query().Get("from_user_id") != "42" || r.URL.Query().Get("to_user_id") != "99" {
			t.Errorf("unexpected whisper request: %s %s", r.Method, r.URL)
		}
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body["message"] != "hello  world" {
			t.Errorf("unexpected body: %v", body)
		}
		w.WriteHeader(status)
	}))
	defer upstream.Close()
	f.service.cfg.HelixURL = upstream.URL
	result, code := f.service.command(context.Background(), p, sendInput{Channel: "hasanabi", Message: "/w @Alice hello  world"})
	if code != 200 || !result.Sent || !result.Whisper || result.Recipient != "alice" || result.MessageID != "" {
		t.Fatal(result, code)
	}
	for _, next := range []int{403, 429, 500, 200} {
		status = next
		result, code = f.service.command(context.Background(), p, sendInput{Message: "/w alice hello  world"})
		if result.Sent || code == 200 || result.Uncertain != (next >= 500) {
			t.Fatal(result, code)
		}
	}
	p.user.UserID = "99"
	if _, code = f.service.command(context.Background(), p, sendInput{Message: "/w alice hello  world"}); code != 400 {
		t.Fatal(code)
	}
	for _, text := range []string{"/w", "/w alice", "/w bad! hello"} {
		if _, err := parseCommand(text); err == nil {
			t.Fatal(text)
		}
	}
}

func TestLocalCommandsNeverTranslateToProviderWrites(t *testing.T) {
	for _, command := range []string{"/clearmessages", "/uptime", "/openurl https://example.com", "/copy text", "/user alice", "/usercard alice", "/reply text", "/r text", "/whisper alice text", "/msg alice text", ".w alice text", "/requests", "/help", "/disconnect", "/reconnect", "/popout", "/popup", "/ignore alice", "/unignore alice", "/follow", "/unfollow"} {
		if _, err := parseCommand(command); err == nil {
			t.Errorf("local command accepted by server: %s", command)
		}
	}
}
