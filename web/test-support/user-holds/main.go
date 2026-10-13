// Local QA: real OAuth/private EventSub handlers, synthetic loopback provider only.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"time"

	"git.subcult.tv/subculture-collective/chatty-cat/internal/auth"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type socket struct {
	conn          *websocket.Conn
	actor         string
	subscriptions map[string]string
}

func main() {
	var mu sync.Mutex
	sockets := map[string]*socket{}
	sequence, events, subscriptions, chatWrites := 0, 0, 0, 0
	encode := func(w http.ResponseWriter, value any) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(value)
	}
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			_ = r.ParseForm()
			code := r.Form.Get("code")
			id := strings.TrimSuffix(code, "-feedback")
			if id != "42" && id != "43" {
				http.Error(w, "fixture account", 400)
				return
			}
			encode(w, map[string]any{"access_token": "fixture:" + code, "refresh_token": "fixture-refresh", "expires_in": 3600, "token_type": "bearer"})
			return
		}
		if r.URL.Path == "/validate" {
			code := strings.TrimPrefix(r.Header.Get("Authorization"), "OAuth fixture:")
			id := strings.TrimSuffix(code, "-feedback")
			scopes := []string{"user:write:chat", "chat:read", "chat:edit", "user:read:emotes"}
			if strings.HasSuffix(code, "-feedback") {
				scopes = append(scopes, "user:read:chat")
			}
			login := "alice"
			if id == "43" {
				login = "bob"
			}
			encode(w, map[string]any{"client_id": "fixture", "user_id": id, "login": login, "scopes": scopes, "expires_in": 3600})
			return
		}
		if r.URL.Path == "/ws" {
			if r.Header.Get("Authorization") != "" {
				http.Error(w, "no socket credentials", 400)
				return
			}
			conn, err := websocket.Accept(w, r, nil)
			if err != nil {
				return
			}
			defer func() { _ = conn.CloseNow() }()
			mu.Lock()
			sequence++
			id := fmt.Sprintf("fixture-session-%d", sequence)
			sockets[id] = &socket{conn: conn, subscriptions: map[string]string{}}
			mu.Unlock()
			defer func() { mu.Lock(); delete(sockets, id); mu.Unlock() }()
			ctx := conn.CloseRead(r.Context())
			_ = wsjson.Write(ctx, conn, map[string]any{"metadata": map[string]string{"message_type": "session_welcome", "message_timestamp": time.Now().UTC().Format(time.RFC3339Nano)}, "payload": map[string]any{"session": map[string]any{"id": id, "keepalive_timeout_seconds": 10}}})
			tick := time.NewTicker(3 * time.Second)
			defer tick.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-tick.C:
					if wsjson.Write(ctx, conn, map[string]any{"metadata": map[string]string{"message_type": "session_keepalive"}}) != nil {
						return
					}
				}
			}
		}
		if r.URL.Path == "/helix/users" {
			encode(w, map[string]any{"data": []any{map[string]string{"id": "123", "login": "one"}}})
			return
		}
		mu.Lock()
		defer mu.Unlock()
		if r.URL.Path == "/helix/eventsub/subscriptions" {
			var body struct {
				Type      string            `json:"type"`
				Version   string            `json:"version"`
				Condition map[string]string `json:"condition"`
				Transport map[string]string `json:"transport"`
			}
			if json.NewDecoder(r.Body).Decode(&body) != nil {
				http.Error(w, "fixture body", 400)
				return
			}
			actor := strings.TrimSuffix(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer fixture:"), "-feedback")
			s := sockets[body.Transport["session_id"]]
			if s == nil || body.Condition["user_id"] != actor || body.Condition["moderator_user_id"] != "" || body.Condition["broadcaster_user_id"] != "123" || body.Version != "1" {
				http.Error(w, "fixture condition", http.StatusForbidden)
				return
			}
			s.actor = actor
			subscriptions++
			id := "sub-" + strings.ReplaceAll(body.Type, ".", "-") + "-" + body.Transport["session_id"]
			s.subscriptions[body.Type] = id
			w.WriteHeader(202)
			encode(w, map[string]any{"data": []any{map[string]any{"id": id, "type": body.Type, "version": body.Version, "condition": body.Condition, "transport": body.Transport, "status": "enabled"}}})
			return
		}
		if r.Method != "GET" {
			chatWrites++
		}
		http.Error(w, "unsupported fixture request", 404)
	}))
	defer provider.Close()
	service, err := auth.New(auth.Config{ClientID: "fixture", ClientSecret: "fixture", PublicURL: "http://127.0.0.1:5195", AuthorizeURL: "http://127.0.0.1:5195/fixture/consent", TokenURL: provider.URL + "/token", ValidateURL: provider.URL + "/validate", HelixURL: provider.URL + "/helix", EventSubURL: "ws" + strings.TrimPrefix(provider.URL, "http") + "/ws"})
	if err != nil {
		panic(err)
	}
	defer service.Close()
	mux := http.NewServeMux()
	service.Register(mux)
	mux.HandleFunc("GET /fixture/consent", func(w http.ResponseWriter, r *http.Request) {
		suffix := ""
		if strings.Contains(r.URL.Query().Get("scope"), "user:read:chat") {
			suffix = "-feedback"
		}
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprintf(w, `<h1>Local synthetic consent</h1><a href="/api/auth/callback?state=%s&code=42%s">Sign in fixture Alice</a><p><a href="/api/auth/callback?state=%s&code=43%s">Sign in fixture Bob</a>`, r.URL.Query().Get("state"), suffix, r.URL.Query().Get("state"), suffix)
	})
	mux.HandleFunc("GET /fixture/counts", func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		encode(w, map[string]int{"subscriptions": subscriptions, "chatOrModerationWrites": chatWrites, "sockets": len(sockets)})
	})
	mux.HandleFunc("POST /fixture/event", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		events++
		status := r.URL.Query().Get("status")
		kind := "channel.chat.user_message_hold"
		if status != "" {
			kind = "channel.chat.user_message_update"
		}
		for _, s := range sockets {
			subscription := s.subscriptions[kind]
			if subscription == "" {
				continue
			}
			frame := map[string]any{"metadata": map[string]string{"message_id": fmt.Sprintf("fixture-event-%d", events), "message_type": "notification", "message_timestamp": time.Now().UTC().Format(time.RFC3339Nano), "subscription_type": kind, "subscription_version": "1"}, "payload": map[string]any{"subscription": map[string]any{"id": subscription, "type": kind, "version": "1", "condition": map[string]string{"user_id": s.actor, "broadcaster_user_id": "123"}}, "event": map[string]any{"broadcaster_user_id": "123", "user_id": s.actor, "message_id": "fixture-held-one", "status": status, "message": map[string]string{"text": "fixture-private-own-" + s.actor + " <script>inert</script>"}, "access_token": "never-export"}}}
			ctx, cancel := context.WithTimeout(r.Context(), time.Second)
			_ = wsjson.Write(ctx, s.conn, frame)
			cancel()
		}
		w.WriteHeader(204)
	})
	mux.HandleFunc("GET /api/public-config", func(w http.ResponseWriter, _ *http.Request) {
		encode(w, map[string]int{"paneChannels": 6, "workspaceChannels": 24, "subscriptions": 96})
	})
	mux.HandleFunc("GET /api/channels/{channel}", func(w http.ResponseWriter, r *http.Request) {
		encode(w, map[string]any{"channel": r.PathValue("channel"), "emotes": map[string]any{}, "badges": map[string]any{}, "stream": map[string]string{"uptime": "offline", "viewers": "0", "title": "Synthetic fixture"}, "errors": []string{}})
	})
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.FileServer(http.Dir("web/dist")).ServeHTTP(w, r)
			return
		}
		data, err := os.ReadFile("web/dist/index.html")
		if err != nil {
			http.Error(w, "build web first", 500)
			return
		}
		extra := `<script>window.WebSocket=class{static OPEN=1;readyState=1;constructor(){setTimeout(()=>this.onmessage?.({data:JSON.stringify({type:'status',state:'connected',detail:'synthetic public fixture'})}),100);}close(){this.readyState=3;}};</script>`
		controls := `<div id="fixture-tools"><button onclick="fetch('/fixture/event',{method:'POST'})">Fixture: hold own message</button><button onclick="fetch('/fixture/event?status=approved',{method:'POST'})">Fixture: approve own message</button><button onclick="fetch('/fixture/counts').then(r=>r.json()).then(v=>document.getElementById('fixture-counts').textContent=JSON.stringify(v))">Fixture: show counts</button><pre id="fixture-counts"></pre></div><script>const move=()=>{const panel=document.querySelector("dialog[data-private-user-holds]"),tools=document.getElementById("fixture-tools");if(panel&&tools&&tools.parentElement!==panel)panel.append(tools);};new MutationObserver(move).observe(document.body,{childList:true,subtree:true});move();</script>`
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(strings.Replace(strings.Replace(string(data), "<head>", "<head>"+extra, 1), "</body>", controls+"</body>", 1)))
	})
	fmt.Println("Own-message feedback fixture: http://127.0.0.1:5195/?channel=one&video=off")
	if err := http.ListenAndServe("127.0.0.1:5195", mux); err != nil {
		panic(err)
	}
}
