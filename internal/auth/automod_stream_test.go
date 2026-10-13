package auth

import (
	"bufio"
	"context"
	"encoding/json"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestPrivateAutoModStreamSharesSubscriptionsAndMigratesWithoutReplay(t *testing.T) {
	f := setup(t)
	cookies, _ := f.signin(t)
	var p *session
	for _, value := range f.service.sessions {
		p = value
	}
	p.user.Scopes = append(p.user.Scopes, autoModScope)
	connected := make(chan *websocket.Conn, 4)
	var subscriptions atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ws" {
			if r.Header.Get("Authorization") != "" {
				t.Error("token sent in socket handshake")
			}
			conn, err := websocket.Accept(w, r, nil)
			if err != nil {
				return
			}
			defer closeEventSub(conn)
			welcome := map[string]any{"metadata": map[string]string{"message_type": "session_welcome", "message_timestamp": time.Now().UTC().Format(time.RFC3339Nano)}, "payload": map[string]any{"session": map[string]any{"id": "fixture-session", "keepalive_timeout_seconds": 10}}}
			if err := wsjson.Write(r.Context(), conn, welcome); err != nil {
				return
			}
			connected <- conn
			ctx := conn.CloseRead(r.Context())
			<-ctx.Done()
			return
		}
		if r.URL.Path == "/users" {
			_, _ = w.Write([]byte(`{"data":[{"id":"123","login":"one"}]}`))
			return
		}
		if r.URL.Path != "/eventsub/subscriptions" {
			http.Error(w, "missing", 404)
			return
		}
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			t.Error("bad subscription")
			return
		}
		kind := body["type"].(string)
		id := "sub-hold"
		if kind == "automod.message.update" {
			id = "sub-update"
		}
		subscriptions.Add(1)
		body["id"] = id
		body["status"] = "enabled"
		w.WriteHeader(202)
		if err := json.NewEncoder(w).Encode(map[string]any{"data": []any{body}}); err != nil {
			t.Error(err)
		}
	}))
	defer provider.Close()
	f.service.cfg.HelixURL = provider.URL
	f.service.cfg.EventSubURL = "ws" + strings.TrimPrefix(provider.URL, "http") + "/ws"
	app := httptest.NewServer(f.handler)
	defer app.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	open := func() (*http.Response, *bufio.Reader) {
		req, err := http.NewRequestWithContext(ctx, "GET", app.URL+"/api/auth/automod/events?channel=one", nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Host = "chat.subcult.tv"
		req.Header.Set("Origin", f.service.origin)
		for _, cookie := range cookies {
			req.AddCookie(cookie)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		if res.StatusCode != 200 {
			t.Fatal(res.StatusCode)
		}
		return res, bufio.NewReader(res.Body)
	}
	read := func(reader *bufio.Reader, wantRows int, active bool) autoModSnapshot {
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				t.Fatal(err)
			}
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			if strings.Contains(line, "never-export") || strings.Contains(line, "access-secret") {
				t.Fatal("private provider metadata leaked")
			}
			var value autoModSnapshot
			if json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &value) != nil {
				t.Fatal("bad snapshot")
			}
			if len(value.Rows) == wantRows && value.Active == active {
				return value
			}
		}
	}
	a, ra := open()
	defer func() {
		if err := a.Body.Close(); err != nil {
			t.Error(err)
		}
	}()
	read(ra, 0, true)
	initial := <-connected
	b, rb := open()
	defer func() {
		if err := b.Body.Close(); err != nil {
			t.Error(err)
		}
	}()
	read(rb, 0, true)
	if subscriptions.Load() != 2 {
		t.Fatal("duplicated subscriptions", subscriptions.Load())
	}
	frame := func(id, kind, msg, status string) []byte {
		var v map[string]any
		if err := json.Unmarshal(automodFixture(id, kind, msg, status), &v); err != nil {
			t.Fatal(err)
		}
		sub := v["payload"].(map[string]any)["subscription"].(map[string]any)
		sub["id"] = "sub-hold"
		if kind == "automod.message.update" {
			sub["id"] = "sub-update"
		}
		data, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		return data
	}
	hold := frame("held-live", "automod.message.hold", "message-live", "")
	if err := initial.Write(ctx, websocket.MessageText, hold); err != nil {
		t.Fatal(err)
	}
	if value := read(ra, 1, true); value.Rows[0].Text != "private-held-sentinel <script>inert</script>" {
		t.Fatal(value)
	}
	read(rb, 1, true)
	if err := initial.Write(ctx, websocket.MessageText, frame("resolved-live", "automod.message.update", "message-live", "approved")); err != nil {
		t.Fatal(err)
	}
	read(ra, 0, true)
	read(rb, 0, true)
	reconnect := map[string]any{"metadata": map[string]string{"message_type": "session_reconnect", "message_id": "reconnect-live"}, "payload": map[string]any{"session": map[string]string{"reconnect_url": f.service.cfg.EventSubURL + "?reconnect=1"}}}
	if err := wsjson.Write(ctx, initial, reconnect); err != nil {
		t.Fatal(err)
	}
	replacement := <-connected
	if err := replacement.Write(ctx, websocket.MessageText, hold); err != nil {
		t.Fatal(err)
	}
	read(ra, 0, true)
	if subscriptions.Load() != 2 {
		t.Fatal("reconnect resubscribed", subscriptions.Load())
	}
	revoked := map[string]any{"metadata": map[string]string{"message_type": "revocation"}, "payload": map[string]any{"subscription": map[string]string{"id": "sub-hold"}}}
	if err := wsjson.Write(ctx, replacement, revoked); err != nil {
		t.Fatal(err)
	}
	read(ra, 0, false)
	read(rb, 0, false)
}
func TestEventSubReconnectTargetsAreBounded(t *testing.T) {
	base := "wss://eventsub.wss.twitch.tv/ws"
	for _, candidate := range []string{"wss://evil.example/ws", "ws://eventsub.wss.twitch.tv/ws", "wss://user:secret@eventsub.wss.twitch.tv/ws", "wss://eventsub.wss.twitch.tv/other", "wss://eventsub.wss.twitch.tv/ws#fragment"} {
		if allowedEventSubURL(base, candidate) {
			t.Fatal(candidate)
		}
	}
	if !allowedEventSubURL(base, base+"?reconnect=opaque") {
		t.Fatal("valid handoff refused")
	}
}
