package server

import (
	"context"
	"fmt"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/chatlimits"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestQueuedJoinsStillAnswerPingAndReclaimOnClose(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	pong := make(chan struct{}, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer func() {
			if err := conn.CloseNow(); err != nil {
				t.Log(err)
			}
		}()
		for i := 0; i < 3; i++ {
			if _, _, err := conn.Read(ctx); err != nil {
				t.Error(err)
				return
			}
		}
		if err := conn.Write(ctx, websocket.MessageText, []byte(":tmi.twitch.tv 001 justinfan :Welcome\r\nPING :capacity-test\r\n")); err != nil {
			t.Error(err)
			return
		}
		_, raw, err := conn.Read(ctx)
		if err != nil || string(raw) != "PONG :capacity-test\r\n" {
			t.Errorf("queued joins blocked PONG: %s, %v", raw, err)
			return
		}
		pong <- struct{}{}
		_, _, err = conn.Read(ctx)
		if err == nil {
			t.Error("unexpected JOIN before budget reset")
		}
	}))
	defer upstream.Close()
	s := New(Config{WorkspaceChannels: 12, Subscriptions: 12, IRCURL: "ws" + strings.TrimPrefix(upstream.URL, "http")})
	defer s.Close()
	seed, err := s.budget.Acquire("public", 1)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 20; i++ {
		if err := s.budget.Wait(ctx, "public", chatlimits.Join, nil); err != nil {
			t.Fatal(err)
		}
	}
	seed.Release()
	host := httptest.NewServer(s.Handler())
	defer host.Close()
	browser, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(host.URL, "http")+"/api/chat?channels=a,b,c,d,e,f,g,h,i,j,k,l", nil)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		var e event
		if err := wsjson.Read(ctx, browser, &e); err != nil {
			t.Fatal(err)
		}
	}
	select {
	case <-pong:
	case <-ctx.Done():
		t.Fatal("no PONG while joins were queued")
	}
	if err := browser.CloseNow(); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for s.budget.Active() != 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if s.budget.Active() != 0 {
		t.Fatal("cancelled join queue leaked subscriptions")
	}
}

func TestTwelveChannelJoinSetIsBoundedAndReleased(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	joined := make(chan int, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer func() {
			if err := conn.CloseNow(); err != nil {
				t.Log(err)
			}
		}()
		seen := map[string]bool{}
		for i := 0; i < 15; i++ {
			_, raw, err := conn.Read(ctx)
			if err != nil {
				t.Error(err)
				return
			}
			text := strings.TrimSpace(string(raw))
			if strings.HasPrefix(text, "JOIN #") {
				seen[text] = true
			}
		}
		joined <- len(seen)
		if err := conn.Write(ctx, websocket.MessageText, []byte(":tmi.twitch.tv 001 justinfan :Welcome\r\n")); err != nil {
			t.Error(err)
		}
		if _, _, err := conn.Read(ctx); err == nil {
			t.Error("unexpected extra command")
		}
	}))
	defer upstream.Close()
	recent := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if _, err := fmt.Fprint(w, `{"messages":[]}`); err != nil {
			t.Log(err)
		}
	}))
	defer recent.Close()
	s := New(Config{WorkspaceChannels: 12, Subscriptions: 12, IRCURL: "ws" + strings.TrimPrefix(upstream.URL, "http"), RecentURL: recent.URL + "/"})
	defer s.Close()
	host := httptest.NewServer(s.Handler())
	defer host.Close()
	browser, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(host.URL, "http")+"/api/chat?channels=a,b,c,d,e,f,g,h,i,j,k,l", nil)
	if err != nil {
		t.Fatal(err)
	}
	var e event
	for i := 0; i < 2; i++ {
		if err := wsjson.Read(ctx, browser, &e); err != nil {
			t.Fatal(err)
		}
	}
	if n := <-joined; n != 12 {
		t.Fatal(n)
	}
	if s.budget.Active() != 12 {
		t.Fatal(s.budget.Active())
	}
	if err := browser.CloseNow(); err != nil {
		t.Fatal(err)
	}
	s.Close()
	if s.budget.Active() != 0 {
		t.Fatal("active subscriptions after shutdown")
	}
}

func TestWorkspaceCapacityConfiguration(t *testing.T) {
	s := New(Config{WorkspaceChannels: 12, Subscriptions: 24})
	defer s.Close()
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/public-config", nil))
	if !strings.Contains(w.Body.String(), `"workspaceChannels":12`) || !strings.Contains(w.Body.String(), `"paneChannels":6`) {
		t.Fatal(w.Body.String())
	}
	w = httptest.NewRecorder()
	s.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/chat?channels=a,b,c,d,e,f,g,h,i,j,k,l,m", nil))
	if w.Code != http.StatusBadRequest {
		t.Fatal(w.Code)
	}
}
func TestAdmissionRefusalIsReadableAndReclaimsAfterRelease(t *testing.T) {
	s := New(Config{WorkspaceChannels: 12, Subscriptions: 12})
	defer s.Close()
	lease, err := s.budget.Acquire("public", 12)
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/chat-admission?channels=one", nil))
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") != "5" || !strings.Contains(w.Body.String(), "capacity") {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
	lease.Release()
	w = httptest.NewRecorder()
	s.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/chat-admission?channels=one", nil))
	if w.Code != http.StatusOK {
		t.Fatal(w.Code)
	}
}
