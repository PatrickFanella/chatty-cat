package server

import (
	"context"
	"encoding/json"
	"github.com/PatrickFanella/hasanabi.neocities.org/rebuild/internal/metadata"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

func TestChannels(t *testing.T) {
	for _, tt := range []struct {
		raw    string
		length int
		bad    bool
	}{
		{"", 1, false}, {"HasanAbi,room,hasanabi", 2, false},
		{"a,b,c,d,e,f", 6, false}, {"a,b,c,d,e,f,g", 0, true},
		{"a,,b", 0, true}, {"a\r\nJOIN #b", 0, true}, {strings.Repeat("a", 26), 0, true},
	} {
		t.Run(tt.raw, func(t *testing.T) {
			got, err := channels(tt.raw)
			if (err != nil) != tt.bad {
				t.Fatalf("error: %v", err)
			}
			if err == nil && len(got) != tt.length {
				t.Fatalf("channels: %v", got)
			}
		})
	}
}

func TestRoutes(t *testing.T) {
	assets := t.TempDir()
	if err := os.WriteFile(filepath.Join(assets, "index.html"), []byte("preview"), 0600); err != nil {
		t.Fatal(err)
	}
	s := New(Config{Assets: assets})
	defer s.Close()
	for _, tt := range []struct {
		path string
		code int
	}{
		{"/", 200}, {"/api/health", 200}, {"/api/missing", 404},
		{"/api/chat?channels=a%0d%0aJOIN", 400},
	} {
		t.Run(tt.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			s.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, tt.path, nil))
			if w.Code != tt.code {
				t.Fatalf("status: %d", w.Code)
			}
			if w.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatal("missing header")
			}
		})
	}
}

func TestCrossOriginRejected(t *testing.T) {
	s := New(Config{})
	host := httptest.NewServer(s.Handler())
	defer host.Close()
	defer s.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, resp, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(host.URL, "http")+"/api/chat", &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{"https://unrelated.example"}}})
	if err == nil {
		t.Fatal("cross-origin socket accepted")
	}
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("unexpected response: %#v", resp)
	}
}

func TestChatSession(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	commands := make(chan string, 8)
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer func() {
			if err := c.CloseNow(); err != nil {
				t.Log(err)
			}
		}()
		for i := 0; i < 4; i++ {
			_, raw, err := c.Read(ctx)
			if err != nil {
				t.Error(err)
				return
			}
			commands <- strings.TrimSpace(string(raw))
		}
		lines := ":tmi.twitch.tv 001 justinfan :Welcome\r\nPING :tmi.twitch.tv\r\n@id=live;tmi-sent-ts=200 :alice!alice@alice PRIVMSG #room :hello\r\n@id=wrong;tmi-sent-ts=201 :alice!alice@alice PRIVMSG #other :ignore\r\n"
		if err := c.Write(ctx, websocket.MessageText, []byte(lines)); err != nil {
			t.Error(err)
			return
		}
		_, raw, err := c.Read(ctx)
		if err != nil {
			t.Error(err)
			return
		}
		commands <- strings.TrimSpace(string(raw))
		if _, _, err := c.Read(ctx); err != nil && ctx.Err() == nil && websocket.CloseStatus(err) == -1 {
			t.Log("session ended:", err)
		}
	}))
	defer up.Close()
	recent := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/room" || r.URL.Query().Get("limit") != "200" {
			t.Errorf("backfill path: %s", r.URL)
		}
		if err := json.NewEncoder(w).Encode(map[string]any{"messages": []string{"@id=old;tmi-sent-ts=100 :bob!bob@bob PRIVMSG #room :earlier", "@id=foreign :x!x@x PRIVMSG #other :skip"}}); err != nil {
			t.Error(err)
		}
	}))
	defer recent.Close()
	s := New(Config{IRCURL: "ws" + strings.TrimPrefix(up.URL, "http"), RecentURL: recent.URL + "/"})
	host := httptest.NewServer(s.Handler())
	defer host.Close()
	defer s.Close()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(host.URL, "http")+"/api/chat?channels=room", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := c.CloseNow(); err != nil {
			t.Log(err)
		}
	}()
	var got []event
	for len(got) < 4 {
		var e event
		if err := wsjson.Read(ctx, c, &e); err != nil {
			t.Fatal(err)
		}
		got = append(got, e)
	}
	if got[0].State != "connecting" || got[1].State != "connected" {
		t.Fatalf("states: %#v", got)
	}
	messages := make(map[string]event)
	for _, e := range got[2:] {
		if e.Message != nil {
			messages[e.Message.ID] = e
		}
	}
	if e := messages["old"]; e.Message == nil || !e.Replay {
		t.Fatalf("backfill: %#v", messages)
	}
	if e := messages["live"]; e.Message == nil || e.Replay {
		t.Fatalf("live: %#v", messages)
	}
	for _, prefix := range []string{"CAP REQ", "PASS justinfan", "NICK justinfan", "JOIN #room", "PONG :tmi.twitch.tv"} {
		select {
		case command := <-commands:
			if !strings.HasPrefix(command, prefix) {
				t.Fatalf("command %q, wanted %q", command, prefix)
			}
		case <-ctx.Done():
			t.Fatal("missing command")
		}
	}
}

func TestBackfillFailureDoesNotStopChat(t *testing.T) {
	for _, tt := range []struct {
		name, body string
		status     int
	}{
		{"provider unavailable", "", 503}, {"invalid JSON", "{", 200},
	} {
		t.Run(tt.name, func(t *testing.T) {
			host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tt.status)
				if _, err := w.Write([]byte(tt.body)); err != nil {
					t.Error(err)
				}
			}))
			defer host.Close()
			s := New(Config{RecentURL: host.URL + "/"})
			defer s.Close()
			if err := s.backfill(context.Background(), "room", func(event) error { t.Error("unexpected event"); return nil }); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestCloseCancelsActiveChat(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer func() {
			if err := c.CloseNow(); err != nil {
				t.Log(err)
			}
		}()
		for {
			if _, _, err := c.Read(ctx); err != nil {
				return
			}
		}
	}))
	defer up.Close()
	s := New(Config{IRCURL: "ws" + strings.TrimPrefix(up.URL, "http")})
	host := httptest.NewServer(s.Handler())
	defer host.Close()
	defer s.Close()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(host.URL, "http")+"/api/chat", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := c.CloseNow(); err != nil {
			t.Log(err)
		}
	}()
	var first event
	if err := wsjson.Read(ctx, c, &first); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { s.Close(); close(done) }()
	select {
	case <-done:
	case <-ctx.Done():
		t.Fatal("shutdown did not cancel active session")
	}
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/chat", nil))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("accepted session after shutdown: %d", w.Code)
	}
}

func TestChannelMetadataAPI(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/uptime/") || strings.Contains(r.URL.Path, "/viewercount/") || strings.Contains(r.URL.Path, "/title/") {
			if _, err := w.Write([]byte("status")); err != nil {
				t.Error(err)
			}
			return
		}
		if _, err := w.Write([]byte(`{}`)); err != nil {
			t.Error(err)
		}
	}))
	defer provider.Close()
	s := New(Config{MetadataEndpoints: metadata.Endpoints{SevenTV: provider.URL, BTTV: provider.URL, FFZ: provider.URL, IVR: provider.URL, DecAPI: provider.URL}})
	defer s.Close()
	host := httptest.NewServer(s.Handler())
	defer host.Close()
	for _, tt := range []struct {
		path string
		code int
	}{{"/api/channels/room", 200}, {"/api/channels/invalid-name", 400}} {
		t.Run(tt.path, func(t *testing.T) {
			res, err := host.Client().Get(host.URL + tt.path)
			if err != nil {
				t.Fatal(err)
			}
			defer func() {
				if err := res.Body.Close(); err != nil {
					t.Error(err)
				}
			}()
			if res.StatusCode != tt.code {
				t.Fatalf("status: %d", res.StatusCode)
			}
			if tt.code == 200 {
				var data metadata.Channel
				if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
					t.Fatal(err)
				}
				if data.Channel != "room" || data.Stream.Title != "status" || data.Emotes == nil || data.Badges == nil {
					t.Fatalf("response: %#v", data)
				}
				if res.Header.Get("Cache-Control") != "no-store" {
					t.Fatal("missing cache policy")
				}
			}
		})
	}
	for i := 0; i < cap(s.metadataSlots); i++ {
		s.metadataSlots <- struct{}{}
	}
	busy := httptest.NewRecorder()
	s.Handler().ServeHTTP(busy, httptest.NewRequest(http.MethodGet, "/api/channels/room", nil))
	if busy.Code != http.StatusServiceUnavailable {
		t.Fatalf("metadata capacity not enforced: %d", busy.Code)
	}
	for i := 0; i < cap(s.metadataSlots); i++ {
		<-s.metadataSlots
	}
	s.Close()
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/channels/room", nil))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("metadata after shutdown: %d", w.Code)
	}
}

func TestSlowBackfillDoesNotDelayLive(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	backfillStarted := make(chan struct{})
	recent := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { close(backfillStarted); <-r.Context().Done() }))
	defer recent.Close()
	pong := make(chan struct{})
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer func() {
			if err := c.CloseNow(); err != nil {
				t.Log(err)
			}
		}()
		for i := 0; i < 4; i++ {
			if _, _, err := c.Read(ctx); err != nil {
				t.Error(err)
				return
			}
		}
		if err := c.Write(ctx, websocket.MessageText, []byte(":tmi.twitch.tv 001 justinfan :Welcome\r\nPING :tmi.twitch.tv\r\n@id=live;tmi-sent-ts=200 :alice!alice@alice PRIVMSG #room :hello\r\n")); err != nil {
			t.Error(err)
			return
		}
		_, data, err := c.Read(ctx)
		if err != nil {
			t.Error(err)
			return
		}
		if strings.TrimSpace(string(data)) != "PONG :tmi.twitch.tv" {
			t.Error("missing pong")
			return
		}
		close(pong)
		if _, _, err := c.Read(ctx); err != nil {
			return
		}
	}))
	defer up.Close()
	s := New(Config{IRCURL: "ws" + strings.TrimPrefix(up.URL, "http"), RecentURL: recent.URL + "/"})
	host := httptest.NewServer(s.Handler())
	defer host.Close()
	defer s.Close()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(host.URL, "http")+"/api/chat?channels=room", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := c.CloseNow(); err != nil {
			t.Log(err)
		}
	}()
	for i := 0; i < 3; i++ {
		var got event
		if err := wsjson.Read(ctx, c, &got); err != nil {
			t.Fatal(err)
		}
		if i == 2 && (got.Message == nil || got.Message.ID != "live") {
			t.Fatalf("live delayed by history: %#v", got)
		}
	}
	select {
	case <-backfillStarted:
	case <-ctx.Done():
		t.Fatal("backfill never started")
	}
	select {
	case <-pong:
	case <-ctx.Done():
		t.Fatal("PING delayed by history")
	}
}
