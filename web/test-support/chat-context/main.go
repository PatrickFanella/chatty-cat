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
			id := strings.TrimSuffix(code, "-context")
			if id != "42" && id != "43" {
				http.Error(w, "fixture account", 400)
				return
			}
			encode(w, map[string]any{"access_token": "fixture:" + code, "refresh_token": "fixture-refresh", "expires_in": 3600, "token_type": "bearer"})
			return
		}
		if r.URL.Path == "/validate" {
			code := strings.TrimPrefix(r.Header.Get("Authorization"), "OAuth fixture:")
			id := strings.TrimSuffix(code, "-context")
			scopes := []string{"user:write:chat", "chat:read", "chat:edit", "user:read:emotes"}
			if strings.HasSuffix(code, "-context") {
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
			actor := strings.TrimSuffix(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer fixture:"), "-context")
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
	service, err := auth.New(auth.Config{ClientID: "fixture", ClientSecret: "fixture", PublicURL: "http://127.0.0.1:5197", AuthorizeURL: "http://127.0.0.1:5197/fixture/consent", TokenURL: provider.URL + "/token", ValidateURL: provider.URL + "/validate", HelixURL: provider.URL + "/helix", EventSubURL: "ws" + strings.TrimPrefix(provider.URL, "http") + "/ws"})
	if err != nil {
		panic(err)
	}
	defer service.Close()
	mux := http.NewServeMux()
	service.Register(mux)
	mux.HandleFunc("GET /fixture/consent", func(w http.ResponseWriter, r *http.Request) {
		suffix := ""
		if strings.Contains(r.URL.Query().Get("scope"), "user:read:chat") {
			suffix = "-context"
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
		choice := r.URL.Query().Get("kind")
		kind := "channel.chat.message"
		id := "11111111-1111-4111-8111-111111111111"
		event := map[string]any{"broadcaster_user_id": "123", "chatter_user_id": "99", "message_id": id, "message_type": "power_ups_message_effect", "source_broadcaster_user_id": "456", "source_broadcaster_user_login": "origin", "source_message_id": "22222222-2222-4222-8222-222222222222", "source_badges": []any{map[string]string{"set_id": "subscriber", "id": "3"}}, "channel_points_custom_reward_id": "reward-one", "message": map[string]string{"text": "never-forward-event-body"}, "access_token": "never-export"}
		if choice == "streak" {
			kind = "channel.chat.notification"
			event["message_id"] = "33333333-3333-4333-8333-333333333333"
			event["source_message_id"] = "66666666-6666-4666-8666-666666666666"
			delete(event, "message_type")
			event["notice_type"] = "watch_streak"
			event["watch_streak"] = map[string]int{"streak_count": 10, "channel_points_awarded": 0}
		}
		if choice == "unmatched" {
			event["message_id"] = "44444444-4444-4444-8444-444444444444"
			event["source_message_id"] = "77777777-7777-4777-8777-777777777777"
		}
		for _, s := range sockets {
			subscription := s.subscriptions[kind]
			if choice == "private" {
				subscription = s.subscriptions["channel.chat.message"]
			}
			if subscription == "" {
				continue
			}
			sentKind := kind
			if choice == "private" {
				sentKind = "channel.chat.user_message_hold"
				event = map[string]any{"broadcaster_user_id": "123", "user_id": s.actor, "message_id": "55555555-5555-4555-8555-555555555555", "message": map[string]string{"text": "private-held-do-not-publish"}}
			}
			frame := map[string]any{"metadata": map[string]string{"message_id": fmt.Sprintf("fixture-event-%d", events), "message_type": "notification", "message_timestamp": time.Now().UTC().Format(time.RFC3339Nano), "subscription_type": sentKind, "subscription_version": "1"}, "payload": map[string]any{"subscription": map[string]any{"id": subscription, "type": sentKind, "version": "1", "condition": map[string]string{"user_id": s.actor, "broadcaster_user_id": "123"}}, "event": event}}

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
		encode(w, map[string]any{"broadcasterID": "123", "channel": r.PathValue("channel"), "emotes": map[string]any{}, "badges": map[string]any{}, "stream": map[string]string{"uptime": "offline", "viewers": "0", "title": "Synthetic fixture"}, "errors": []string{}})
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
		extra := `<script>window.fixtureSockets=[];window.fixturePublic=(id,command,text)=>{for(const s of window.fixtureSockets)s.onmessage?.({data:JSON.stringify({type:'message',replay:false,message:{id,command,channel:'one',login:'publicuser',text,timestamp:Date.now(),tags:{'room-id':'123','user-id':'99'}}})});};window.WebSocket=class{static OPEN=1;readyState=1;constructor(url){const publicChat=new URL(url).pathname==='/api/chat';if(publicChat)window.fixtureSockets.push(this);setTimeout(()=>{this.onmessage?.({data:JSON.stringify({type:'status',state:'connected',detail:'synthetic public fixture'})});if(publicChat){window.fixturePublic('11111111-1111-4111-8111-111111111111','PRIVMSG','actual public fixture body');window.fixturePublic('33333333-3333-4333-8333-333333333333','USERNOTICE','public streak notice');}},200);}close(){this.readyState=3;window.fixtureSockets=window.fixtureSockets.filter(s=>s!==this);}};</script>`
		controls := `<div id="fixture-tools"><button onclick="fetch('/fixture/event',{method:'POST'})">Fixture: public context</button><button onclick="fetch('/fixture/event?kind=streak',{method:'POST'})">Fixture: watch streak</button><button onclick="fetch('/fixture/event?kind=unmatched',{method:'POST'})">Fixture: unmatched context</button><button onclick="window.fixturePublic('44444444-4444-4444-8444-444444444444','PRIVMSG','later actual public message')">Fixture: deliver later public message</button><button onclick="fetch('/fixture/event?kind=private',{method:'POST'})">Fixture: private held frame</button><button onclick="fetch('/fixture/counts').then(r=>r.json()).then(v=>document.getElementById('fixture-counts').textContent=JSON.stringify(v))">Fixture: show counts</button><pre id="fixture-counts"></pre></div><script>const move=()=>{const panel=document.querySelector('dialog[aria-label="Public message context"]'),tools=document.getElementById('fixture-tools');if(panel&&tools&&tools.parentElement!==panel)panel.append(tools);};new MutationObserver(move).observe(document.body,{childList:true,subtree:true});move();</script>`

		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(strings.Replace(strings.Replace(string(data), "<head>", "<head>"+extra, 1), "</body>", controls+"</body>", 1)))
	})
	fmt.Println("Public message context fixture: http://127.0.0.1:5197/?channel=one&video=off")
	if err := http.ListenAndServe("127.0.0.1:5197", mux); err != nil {
		panic(err)
	}
}
