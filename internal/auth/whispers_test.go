package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

func notification(id, user string) eventSubEnvelope {
	var e eventSubEnvelope
	e.Metadata.Type = "notification"
	e.Metadata.Timestamp = "2026-10-11T20:00:00Z"
	e.Payload.Subscription.Type = "user.whisper.message"
	e.Payload.Subscription.Version = "1"
	e.Payload.Subscription.Condition.User = user
	e.Payload.Event.ToID = user
	e.Payload.Event.FromID = "99"
	e.Payload.Event.FromLogin = "alice"
	e.Payload.Event.FromName = "Alice"
	e.Payload.Event.ID = id
	e.Payload.Event.Whisper.Text = "private <script>text</script>"
	return e
}
func TestWhisperBoundary(t *testing.T) {
	e := notification("whisper-id", "42")
	m, ok := whisperMessage(e, "42")
	if !ok || m.Command != "WHISPER" || m.Channel != "" || m.Text != e.Payload.Event.Whisper.Text {
		t.Fatal(m, ok)
	}
	for _, mutate := range []func(*eventSubEnvelope){func(e *eventSubEnvelope) { e.Payload.Event.ToID = "other" }, func(e *eventSubEnvelope) { e.Payload.Subscription.Condition.User = "other" }, func(e *eventSubEnvelope) { e.Payload.Subscription.Type = "channel.follow" }, func(e *eventSubEnvelope) { e.Metadata.Timestamp = "bad" }, func(e *eventSubEnvelope) { e.Payload.Event.FromLogin = "bad!" }, func(e *eventSubEnvelope) { e.Payload.Event.Whisper.Text = strings.Repeat("a", 10001) }, func(e *eventSubEnvelope) { e.Payload.Event.ID = "bad/id" }} {
		bad := e
		mutate(&bad)
		if _, ok := whisperMessage(bad, "42"); ok {
			t.Fatal(bad)
		}
	}
	f := setup(t)
	for _, raw := range []string{"wss://evil.test/ws", "https://eventsub.wss.twitch.tv/ws", "wss://user@eventsub.wss.twitch.tv/ws", "wss://eventsub.wss.twitch.tv/ws#secret"} {
		if f.service.reconnectAllowed(raw) {
			t.Fatal(raw)
		}
	}
	if !f.service.reconnectAllowed("wss://eventsub.wss.twitch.tv/ws?reconnect=opaque") {
		t.Fatal("reconnect rejected")
	}
}
func TestWhisperEventSubSharedHandoff(t *testing.T) {
	f := setup(t)
	cookies, _ := f.signin(t)
	f.service.mu.Lock()
	for _, p := range f.service.sessions {
		p.user.Scopes = append(p.user.Scopes, "user:manage:whispers")
	}
	f.service.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	subscribed := make(chan struct{}, 1)
	var subscriptions, connections atomic.Int32
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/eventsub/subscriptions" || r.Header.Get("Authorization") != "Bearer access-secret" {
			t.Error("invalid subscription request")
		}
		var input struct {
			Type, Version string
			Condition     map[string]string
			Transport     map[string]string
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.Type != "user.whisper.message" || input.Condition["user_id"] != "42" || input.Transport["session_id"] != "socket-1" {
			t.Errorf("invalid subscription: %+v", input)
		}
		subscriptions.Add(1)
		w.WriteHeader(202)
		_, _ = w.Write([]byte(`{"data":[{"id":"subscription-id"}]}`))
		subscribed <- struct{}{}
	}))
	defer api.Close()
	f.service.cfg.HelixURL = api.URL
	send := make(chan struct{})
	handoff := make(chan struct{})
	var upstreamURL string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer func() { _ = conn.CloseNow() }()
		connections.Add(1)
		var welcome eventSubEnvelope
		welcome.Metadata.Type = "session_welcome"
		welcome.Payload.Session.ID = "socket-1"
		welcome.Payload.Session.Keepalive = 10
		if r.URL.Query().Has("reconnect") {
			welcome.Payload.Session.ID = "socket-2"
			if err := wsjson.Write(ctx, conn, welcome); err != nil {
				return
			}
			close(handoff)
			_ = wsjson.Write(ctx, conn, notification("first", "42"))
			_ = wsjson.Write(ctx, conn, notification("second", "42"))
			<-ctx.Done()
			return
		}
		if err := wsjson.Write(ctx, conn, welcome); err != nil {
			return
		}
		select {
		case <-subscribed:
		case <-ctx.Done():
			return
		}
		select {
		case <-send:
		case <-ctx.Done():
			return
		}
		_ = wsjson.Write(ctx, conn, notification("wrong", "other"))
		_ = wsjson.Write(ctx, conn, notification("first", "42"))
		_ = wsjson.Write(ctx, conn, notification("first", "42"))
		var reconnect eventSubEnvelope
		reconnect.Metadata.Type = "session_reconnect"
		reconnect.Payload.Session.Reconnect = upstreamURL + "?reconnect=opaque"
		_ = wsjson.Write(ctx, conn, reconnect)
		select {
		case <-handoff:
		case <-ctx.Done():
		}
		<-ctx.Done()
	}))
	defer upstream.Close()
	upstreamURL = "ws" + strings.TrimPrefix(upstream.URL, "http")
	f.service.cfg.EventSubURL = upstreamURL
	server := httptest.NewServer(f.handler)
	defer server.Close()
	f.service.origin = server.URL
	headers := http.Header{"Origin": {server.URL}}
	for _, cookie := range cookies {
		headers.Add("Cookie", cookie.Name+"="+cookie.Value)
	}
	open := func() *websocket.Conn {
		conn, response, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/api/auth/whispers", &websocket.DialOptions{HTTPHeader: headers})
		if response != nil && response.Body != nil {
			_ = response.Body.Close()
		}
		if err != nil {
			t.Fatal(err)
		}
		return conn
	}
	a, b := open(), open()
	defer func() { _ = a.CloseNow(); _ = b.CloseNow() }()
	for _, conn := range []*websocket.Conn{a, b} {
		for {
			var event personalEvent
			if err := wsjson.Read(ctx, conn, &event); err != nil {
				t.Fatal(err)
			}
			if event.State == "connected" {
				break
			}
		}
	}
	close(send)
	for _, conn := range []*websocket.Conn{a, b} {
		for _, id := range []string{"first", "second"} {
			var event personalEvent
			if err := wsjson.Read(ctx, conn, &event); err != nil || event.Message == nil || event.Message.ID != id {
				t.Fatal(event, err)
			}
		}
	}
	if subscriptions.Load() != 1 || connections.Load() != 2 {
		t.Fatal(subscriptions.Load(), connections.Load())
	}
	cancel()
	f.service.Close()
}
func TestWhisperEndpointGuard(t *testing.T) {
	f := setup(t)
	r := httptest.NewRequest(http.MethodGet, "https://chat.subcult.tv/api/auth/whispers", nil)
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal(w.Code)
	}
	r.Header.Set("Origin", "https://chat.subcult.tv")
	w = httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatal(w.Code)
	}
}
