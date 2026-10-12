package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

func TestPersonalChatWorkspaceLimit(t *testing.T) {
	f := setup(t)
	f.service.cfg.WorkspaceChannels = 12
	request := httptest.NewRequest(http.MethodGet, "https://chat.subcult.tv/api/auth/chat?channels=a,b,c,d,e,f,g,h,i,j,k,l,m", nil)
	request.Header.Set("Origin", "https://chat.subcult.tv")
	response := httptest.NewRecorder()
	f.handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatal(response.Code)
	}
}

func TestPersonalChat(t *testing.T) {
	f := setup(t)
	cookies, csrf := f.signin(t)
	f.service.mu.Lock()
	for _, p := range f.service.sessions {
		p.user.Scopes = append(p.user.Scopes, "chat:read", "chat:edit")
	}
	f.service.mu.Unlock()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		defer func() { _ = conn.CloseNow() }()
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		for _, expected := range []string{"CAP REQ :twitch.tv/tags twitch.tv/commands\r\n", "PASS oauth:access-secret\r\n", "NICK viewer\r\n", "JOIN #hasanabi\r\n"} {
			_, data, err := conn.Read(ctx)
			if err != nil {
				t.Error(err)
				return
			}
			if string(data) != expected {
				t.Error("wrong IRC handshake")
			}
		}
		data := ":tmi.twitch.tv 001 viewer :Welcome\r\n@user-id=42;display-name=Viewer :tmi.twitch.tv GLOBALUSERSTATE\r\n@mod=1;subscriber=0 :tmi.twitch.tv USERSTATE #hasanabi\r\n@mod=0 :tmi.twitch.tv USERSTATE #other\r\n:id!id@id PRIVMSG #hasanabi :not duplicated\r\nPING :tmi.twitch.tv\r\n"
		if err := conn.Write(ctx, websocket.MessageText, []byte(data)); err != nil {
			t.Error(err)
			return
		}
		_, pong, err := conn.Read(ctx)
		if err != nil || string(pong) != "PONG :tmi.twitch.tv\r\n" {
			t.Error("missing pong")
		}
		_, action, err := conn.Read(ctx)
		if err != nil || string(action) != "PRIVMSG #hasanabi :/me waves\r\n" {
			t.Error("action payload mismatch")
			return
		}
		if err := conn.Write(ctx, websocket.MessageText, []byte("@id=action-id;mod=1 :tmi.twitch.tv USERSTATE #hasanabi\r\n")); err != nil {
			t.Error(err)
			return
		}
		<-ctx.Done()
	}))
	defer upstream.Close()
	f.service.cfg.IRCURL = "ws" + strings.TrimPrefix(upstream.URL, "http")
	server := httptest.NewServer(f.handler)
	defer server.Close()
	f.service.origin = server.URL
	headers := http.Header{"Origin": {server.URL}}
	for _, cookie := range cookies {
		headers.Add("Cookie", cookie.Name+"="+cookie.Value)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, response, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/api/auth/chat?channels=hasanabi", &websocket.DialOptions{HTTPHeader: headers})
	if response != nil && response.Body != nil {
		_ = response.Body.Close()
	}
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.CloseNow() }()
	var event personalEvent
	if err := wsjson.Read(ctx, conn, &event); err != nil || event.State != "connected" {
		t.Fatal(event, err)
	}
	if err := wsjson.Read(ctx, conn, &event); err != nil || event.Message == nil || event.Message.Command != "GLOBALUSERSTATE" || event.Message.Channel != "" {
		t.Fatal(event, err)
	}
	if err := wsjson.Read(ctx, conn, &event); err != nil || event.Message == nil || event.Message.Command != "USERSTATE" || event.Message.Channel != "hasanabi" || event.Message.Tags["mod"] != "1" {
		t.Fatal(event, err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, server.URL+"/api/chat/send", strings.NewReader(sendBody("/me waves", "action-request-12345")))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", server.URL)
	req.Header.Set("X-CSRF-Token", csrf)
	req.Header.Set("Content-Type", "application/json")
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	result, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var sent sendResult
	if err := json.NewDecoder(result.Body).Decode(&sent); err != nil {
		t.Fatal(err)
	}
	if err := result.Body.Close(); err != nil {
		t.Error(err)
	}
	if result.StatusCode != 200 || !sent.Sent || !sent.Action || sent.MessageID != "action-id" {
		t.Fatal(result.StatusCode, sent)
	}
	if err := wsjson.Read(ctx, conn, &event); err != nil || event.Message == nil || event.Message.ID != "action-id" {
		t.Fatal(event, err)
	}
	shutdown := make(chan struct{})
	go func() { f.service.Close(); close(shutdown) }()
	select {
	case <-shutdown:
	case <-time.After(time.Second):
		t.Fatal("personal chat shutdown blocked")
	}
}
func TestPersonalChatRequestGuards(t *testing.T) {
	f := setup(t)
	cookies, _ := f.signin(t)
	for _, tc := range []struct {
		path, origin string
		cookies      []*http.Cookie
		status       int
	}{
		{"?channels=hasanabi", "https://evil.test", cookies, 403}, {"?channels=bad!", "https://chat.subcult.tv", cookies, 400}, {"?channels=a,b,c,d,e,f,g,h,i,j,k,l,m", "https://chat.subcult.tv", cookies, 400}, {"?channels=hasanabi", "https://chat.subcult.tv", nil, 401}, {"?channels=hasanabi", "https://chat.subcult.tv", cookies, 403},
	} {
		res := f.request("GET", "/api/auth/chat"+tc.path, tc.cookies, map[string]string{"Origin": tc.origin})
		if res.Code != tc.status {
			t.Fatal(tc.status, res.Code, res.Body.String())
		}
	}
}
