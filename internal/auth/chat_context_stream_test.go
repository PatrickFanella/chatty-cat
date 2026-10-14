package auth

import (
	"bufio"
	"context"
	"encoding/json"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/chatlimits"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestPublicContextAuthenticatedStreamSharesAndDropsBodies(t *testing.T) {
	f := setup(t)
	cookies, csrf := f.signin(t)
	for _, p := range f.service.sessions {
		p.user.Scopes = append(p.user.Scopes, userChatReadScope)
	}
	connected := make(chan *websocket.Conn, 1)
	var subscriptions atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ws" {
			if r.Header.Get("Authorization") != "" {
				t.Error("token in WebSocket handshake")
			}
			conn, err := websocket.Accept(w, r, nil)
			if err != nil {
				return
			}
			defer closeEventSub(conn)
			if wsjson.Write(r.Context(), conn, map[string]any{"metadata": map[string]string{"message_type": "session_welcome", "message_timestamp": time.Now().UTC().Format(time.RFC3339Nano)}, "payload": map[string]any{"session": map[string]any{"id": "context-session", "keepalive_timeout_seconds": 20}}}) != nil {
				return
			}
			connected <- conn
			<-conn.CloseRead(r.Context()).Done()
			return
		}
		if r.URL.Path == "/users" {
			_, _ = w.Write([]byte(`{"data":[{"id":"123","login":"one"}]}`))
			return
		}
		if r.URL.Path != "/eventsub/subscriptions" {
			http.NotFound(w, r)
			return
		}
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			t.Error("invalid subscription")
			return
		}
		kind, _ := body["type"].(string)
		condition, _ := body["condition"].(map[string]any)
		if !slices.Contains([]string{chatMessageKind, chatNoticeKind}, kind) || condition["user_id"] != "42" || condition["moderator_user_id"] != nil || body["version"] != "1" {
			t.Error("public subscription condition")
		}
		subscriptions.Add(1)
		body["id"] = map[string]string{chatMessageKind: "sub-message", chatNoticeKind: "sub-notice"}[kind]
		body["status"] = "enabled"
		w.WriteHeader(202)
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{body}})
	}))
	defer provider.Close()
	f.service.cfg.HelixURL = provider.URL
	f.service.cfg.EventSubURL = "ws" + strings.TrimPrefix(provider.URL, "http") + "/ws"
	app := httptest.NewServer(f.handler)
	defer app.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	open := func() (*http.Response, *bufio.Reader) {
		req, _ := http.NewRequestWithContext(ctx, "GET", app.URL+"/api/auth/chat-context/events?channel=one", nil)
		req.Host = "chat.subcult.tv"
		req.Header.Set("Origin", f.service.origin)
		for _, cookie := range cookies {
			req.AddCookie(cookie)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		if res.StatusCode != 200 || res.Header.Get("Cache-Control") != "no-store" {
			t.Fatal("stream status/headers", res.StatusCode)
		}
		return res, bufio.NewReader(res.Body)
	}
	read := func(reader *bufio.Reader, want int) chatContextSnapshot {
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				t.Fatal(err)
			}
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			if strings.Contains(line, "never-forward") || strings.Contains(line, "never-export") {
				t.Fatal("body/token escaped")
			}
			var value chatContextSnapshot
			if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &value) != nil {
				t.Fatal("bad snapshot")
			}
			if value.Active && len(value.Rows) == want {
				return value
			}
		}
	}
	a, ra := open()
	defer func() { _ = a.Body.Close() }()
	read(ra, 0)
	conn := <-connected
	b, rb := open()
	defer func() { _ = b.Body.Close() }()
	read(rb, 0)
	if f.service.chatBudget.Active() != 1 {
		t.Fatal("context did not share one chat admission lease")
	}
	if subscriptions.Load() != 2 {
		t.Fatal("subscriptions duplicated")
	}
	if err := conn.Write(ctx, websocket.MessageText, contextFixture("public-one", chatMessageKind, publicContextEvent())); err != nil {
		t.Fatal(err)
	}
	if row := read(ra, 1).Rows[0]; row.Tags["source-room-id"] != "456" {
		t.Fatal("context missing")
	}
	read(rb, 1)
	if res := f.request("POST", "/api/auth/logout", cookies, map[string]string{"Origin": f.service.origin, "X-CSRF-Token": csrf}); res.Code != http.StatusNoContent {
		t.Fatal("logout", res.Code)
	}
	_, err := ra.ReadString('\n')
	if err != nil {
		return
	}
	for {
		line, err := ra.ReadString('\n')
		if err != nil {
			break
		}
		if strings.HasPrefix(line, "data: ") {
			t.Fatal("snapshot emitted after logout")
		}
	}
}
func TestPublicContextConsentAndOriginBoundary(t *testing.T) {
	f := setup(t)
	cookies, _ := f.signin(t)
	for _, path := range []string{"/api/auth/chat-context/events?channel=one", "/api/auth/chat-context/events?channel=one&account=43"} {
		res := f.request("GET", path, cookies, map[string]string{"Origin": f.service.origin})
		if res.Code != 403 && res.Code != 400 {
			t.Fatal("unauthorized context read", res.Code)
		}
	}
	for _, value := range []string{"read", "invalid"} {
		res := f.request("GET", "/api/auth/login?context="+value, nil, nil)
		if value == "invalid" {
			if res.Code != 400 {
				t.Fatal("invalid consent")
			}
			continue
		}
		location, err := url.Parse(res.Header().Get("Location"))
		if err != nil || !slices.Contains(strings.Fields(location.Query().Get("scope")), userChatReadScope) {
			t.Fatal("context permission not explicit")
		}
	}
}
func TestPublicContextAdmissionFailureAndTeardownRelease(t *testing.T) {
	f := setup(t)
	f.signin(t)
	var p *session
	for _, value := range f.service.sessions {
		p = value
	}
	f.service.chatBudget = chatlimits.New(1, 2)
	occupied, err := f.service.chatBudget.Acquire("other", 1)
	if err != nil {
		t.Fatal(err)
	}
	if hub, _, err := f.service.privateHubKindFor(p, "42", "one", "123", chatContextFeed); err == nil || hub != nil {
		t.Fatal("context bypassed full chat admission")
	}
	occupied.Release()
	f.service.cfg.EventSubURL = "https://invalid.example" // Rejected before any network connection.
	hub, peer, err := f.service.privateHubKindFor(p, "42", "one", "123", chatContextFeed)
	if err != nil {
		t.Fatal(err)
	}
	hub.detach(peer)
	f.service.Close()
	if f.service.chatBudget.Active() != 0 {
		t.Fatal("context lease survived failure/cancel")
	}
}
