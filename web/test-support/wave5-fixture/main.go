// Local synthetic traffic only. No credentials or upstream/provider transport.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

var sent atomic.Int64

func main() {
	seed, err := strconv.Atoi(os.Getenv("CHATTY_FIXTURE_SEED"))
	if os.Getenv("CHATTY_FIXTURE_SEED") != "" && (err != nil || seed < 0 || seed > 100000) {
		log.Fatal("CHATTY_FIXTURE_SEED must be between 0 and 100000")
	}

	assets, _ := filepath.Abs("web/dist")
	if len(os.Args) > 1 {
		assets = os.Args[1]
	}
	mux := http.NewServeMux()
	files := http.FileServer(http.Dir(assets))
	mux.HandleFunc("/fixture/state", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"messagesSent": sent.Load(), "providerWrites": 0})
	})
	mux.HandleFunc("/api/auth/session", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"enabled": false, "authenticated": false})
	})
	mux.HandleFunc("/api/public-config", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"workspaceChannels": 12, "paneChannels": 6, "subscriptions": 24})
	})
	mux.HandleFunc("/api/channels/", func(w http.ResponseWriter, r *http.Request) {
		channel := strings.TrimPrefix(r.URL.Path, "/api/channels/")
		if strings.Contains(channel, "/") {
			http.NotFound(w, r)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"channel": channel, "emotes": map[string]any{}, "badges": map[string]any{}, "stream": map[string]any{"live": false, "viewers": 0, "title": ""}, "errors": []string{}})
	})
	mux.HandleFunc("/api/chat", func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer c.CloseNow()
		ctx := c.CloseRead(context.Background())
		wsjson.Write(ctx, c, map[string]any{"type": "status", "state": "connected", "detail": "Synthetic local fixture"})
		channel := strings.Split(r.URL.Query().Get("channels"), ",")[0]
		if channel == "idle" {
			<-ctx.Done()
			return
		}
		for i := 0; i < seed; i++ {
			if err := wsjson.Write(ctx, c, map[string]any{"type": "message", "replay": true, "message": fixtureMessage(channel, time.Now())}); err != nil {
				return
			}
		}
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				for i := 0; i < 10; i++ {
					m := fixtureMessage(channel, now)
					if err := wsjson.Write(ctx, c, map[string]any{"type": "message", "replay": false, "message": m}); err != nil {
						return
					}
				}
			}
		}
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) })
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" && r.URL.Query().Has("overlay") && r.URL.Query().Get("overlay") != "0" {
			http.Redirect(w, r, "/overlay.html?"+r.URL.RawQuery, http.StatusTemporaryRedirect)
			return
		}
		files.ServeHTTP(w, r)
	})
	log.Print("Synthetic wave fixture on 127.0.0.1:5198")
	log.Fatal(http.ListenAndServe("127.0.0.1:5198", mux))
}

func fixtureMessage(channel string, now time.Time) map[string]any {
	id := sent.Add(1)
	return map[string]any{"id": fmt.Sprintf("wave5-%d", id), "command": "PRIVMSG", "channel": channel, "login": fmt.Sprintf("viewer%d", id%2000), "text": "Synthetic public glorp message example.com/a", "timestamp": now.UnixMilli(), "tags": map[string]string{"badges": "subscriber/12"}}
}
