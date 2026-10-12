package server

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

func TestOptInMembershipWithoutBackfill(t *testing.T) {
	for _, membership := range []string{"0", "1"} {
		t.Run(membership, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			caps := make(chan string, 1)
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				socket, err := websocket.Accept(w, r, nil)
				if err != nil {
					return
				}
				defer socket.CloseNow() //nolint:errcheck
				for i := 0; i < 4; i++ {
					_, raw, err := socket.Read(ctx)
					if err != nil {
						return
					}
					if i == 0 {
						caps <- string(raw)
					}
				}
				lines := ":tmi.twitch.tv 001 justinfan :Welcome\r\n:alice!alice@alice JOIN #room\r\n:bob!bob@bob PART #room\r\n:other!other@other JOIN #other\r\n@id=done;tmi-sent-ts=200 :alice!alice@alice PRIVMSG #room :hello\r\n"
				if err := socket.Write(ctx, websocket.MessageText, []byte(lines)); err != nil {
					t.Error(err)
					return
				}
				_, _, _ = socket.Read(ctx)
			}))
			defer upstream.Close()
			var calls atomic.Int32
			recent := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); _, _ = w.Write([]byte(`{"messages":[]}`)) }))
			defer recent.Close()
			service := New(Config{IRCURL: "ws" + strings.TrimPrefix(upstream.URL, "http"), RecentURL: recent.URL + "/"})
			defer service.Close()
			host := httptest.NewServer(service.Handler())
			defer host.Close()
			socket, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(host.URL, "http")+"/api/chat?channels=room&history=0&membership="+membership, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer socket.CloseNow() //nolint:errcheck
			count := 0
			for {
				var got event
				if err := wsjson.Read(ctx, socket, &got); err != nil {
					t.Fatal(err)
				}
				if got.Message == nil {
					continue
				}
				if got.Message.Channel != "room" {
					t.Fatal("foreign channel")
				}
				if got.Message.Command == "JOIN" || got.Message.Command == "PART" {
					count++
				}
				if got.Message.ID == "done" {
					break
				}
			}
			command := <-caps
			if strings.Contains(command, "twitch.tv/membership") != (membership == "1") {
				t.Fatalf("caps: %s", command)
			}
			expected := 0
			if membership == "1" {
				expected = 2
			}
			if count != expected {
				t.Fatalf("membership messages: %d", count)
			}
			if calls.Load() != 0 {
				t.Fatal("disabled history requested provider")
			}
		})
	}
}

func TestConfiguredBackfillLimit(t *testing.T) {
	host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("limit") != "2" {
			t.Errorf("limit: %s", r.URL)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"messages": []string{":a!a@a PRIVMSG #room :one", ":b!b@b PRIVMSG #room :two", ":c!c@c PRIVMSG #room :three"}})
	}))
	defer host.Close()
	service := New(Config{RecentURL: host.URL + "/"})
	defer service.Close()
	count := 0
	var texts []string
	if err := service.backfill(context.Background(), "room", 2, func(got event) error {
		count++
		texts = append(texts, got.Message.Text)
		if !got.Replay {
			t.Error("backfill not replay")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if count != 2 || strings.Join(texts, ",") != "two,three" {
		t.Fatalf("provider overrun did not retain newest bounded rows: %d %v", count, texts)
	}
}
