// Local QA only: real auth/command handlers with a synthetic provider. No Twitch traffic.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"

	"git.subcult.tv/subculture-collective/chatty-cat/internal/auth"
)

type fixtureSocket struct {
	conn          *websocket.Conn
	actor         string
	subscriptions map[string]string
	last          []byte
}

func main() {
	var mu sync.Mutex
	sockets := map[string]*fixtureSocket{}
	socketCounter, eventCounter := 0, 0
	privateWrites := 0
	mode, writes, lookups := "confirmed", 0, 0
	shieldActive := false
	scopes := []string{"user:write:chat", "user:read:moderated_channels", "moderator:manage:banned_users", "moderator:manage:chat_messages", "moderator:manage:chat_settings", "moderator:manage:warnings", "moderator:manage:shield_mode"}
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		encode := func(v any) { _ = json.NewEncoder(w).Encode(v) }
		if r.URL.Path == "/token" {
			_ = r.ParseForm()
			id := r.Form.Get("code")
			if strings.TrimSuffix(id, "-automod") != "42" && strings.TrimSuffix(id, "-automod") != "43" && strings.TrimSuffix(id, "-automod") != "123" {
				http.Error(w, "Bad fixture code", http.StatusBadRequest)
				return
			}
			encode(map[string]any{"access_token": "fixture:" + id, "refresh_token": "fixture-refresh", "expires_in": 3600, "token_type": "bearer"})
			return
		}
		if r.URL.Path == "/validate" {
			id := strings.TrimPrefix(r.Header.Get("Authorization"), "OAuth fixture:")
			managed := strings.HasSuffix(id, "-automod")
			id = strings.TrimSuffix(id, "-automod")
			grants := append([]string{}, scopes...)
			if managed {
				grants = append(grants, "moderator:read:suspicious_users", "moderator:manage:suspicious_users")
			}
			login := map[string]string{"42": "moderator", "43": "outsider", "123": "one"}[id]
			encode(map[string]any{"client_id": "fixture", "user_id": id, "login": login, "scopes": grants, "expires_in": 3600})
			return
		}
		if r.URL.Path == "/eventsub/ws" {
			conn, err := websocket.Accept(w, r, nil)
			if err != nil {
				return
			}
			defer func() { _ = conn.CloseNow() }()
			mu.Lock()
			socketCounter++
			id := fmt.Sprintf("fixture-session-%d", socketCounter)
			socket := &fixtureSocket{conn: conn, subscriptions: map[string]string{}}
			if old := sockets[r.URL.Query().Get("reconnect")]; old != nil {
				socket.actor = old.actor
				for k, v := range old.subscriptions {
					socket.subscriptions[k] = v
				}
			}
			sockets[id] = socket
			mu.Unlock()
			defer func() { mu.Lock(); delete(sockets, id); mu.Unlock() }()
			ctx := conn.CloseRead(r.Context())
			if wsjson.Write(ctx, conn, map[string]any{"metadata": map[string]string{"message_type": "session_welcome", "message_timestamp": time.Now().UTC().Format(time.RFC3339Nano)}, "payload": map[string]any{"session": map[string]any{"id": id, "keepalive_timeout_seconds": 10}}}) != nil {
				return
			}
			tick := time.NewTicker(3 * time.Second)
			defer tick.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-tick.C:
					if wsjson.Write(ctx, conn, map[string]any{"metadata": map[string]string{"message_type": "session_keepalive", "message_timestamp": time.Now().UTC().Format(time.RFC3339Nano)}}) != nil {
						return
					}
				}
			}
		}
		mu.Lock()
		defer mu.Unlock()
		actor := strings.TrimSuffix(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer fixture:"), "-automod")
		if r.URL.Path == "/helix/eventsub/subscriptions" {
			if r.Method == "DELETE" {
				w.WriteHeader(204)
				return
			}
			var body map[string]any
			if json.NewDecoder(r.Body).Decode(&body) != nil {
				http.Error(w, "Bad subscription", http.StatusBadRequest)
				return
			}
			transport, _ := body["transport"].(map[string]any)
			sessionID, _ := transport["session_id"].(string)
			socket := sockets[sessionID]
			condition, _ := body["condition"].(map[string]any)
			if socket == nil || actor != "42" && actor != "123" || condition["moderator_user_id"] != actor || condition["broadcaster_user_id"] != "123" || !strings.HasSuffix(r.Header.Get("Authorization"), "-automod") {
				http.Error(w, "Fixture AutoMod permission refused", http.StatusForbidden)
				return
			}
			kind, _ := body["type"].(string)
			id := "sub-" + strings.ReplaceAll(kind, ".", "-") + "-" + sessionID
			socket.actor = actor
			socket.subscriptions[kind] = id
			body["id"] = id
			body["status"] = "enabled"
			w.WriteHeader(202)
			encode(map[string]any{"data": []any{body}})
			return
		}
		if r.URL.Path == "/helix/moderation/suspicious_users" {
			privateWrites++
			if mode == "uncertain" {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			if mode == "rejected" {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			var body map[string]string
			status := "NO_TREATMENT"
			subject := r.URL.Query().Get("user_id")
			if r.Method == http.MethodPost {
				_ = json.NewDecoder(r.Body).Decode(&body)
				status = body["status"]
				subject = body["user_id"]
			}
			if actor != "42" && actor != "123" || !strings.HasSuffix(r.Header.Get("Authorization"), "-automod") || subject != "456" || r.URL.Query().Get("broadcaster_id") != "123" || r.URL.Query().Get("moderator_id") != actor {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			encode(map[string]any{"data": []map[string]string{{"broadcaster_id": "123", "moderator_id": actor, "user_id": subject, "status": status, "updated_at": time.Now().UTC().Format(time.RFC3339Nano)}}})
			return
		}
		if r.URL.Path == "/helix/moderation/automod/message" {
			privateWrites++
			if mode == "uncertain" {
				http.Error(w, "Fixture unknown private decision", http.StatusInternalServerError)
				return
			}
			if mode == "rejected" {
				http.Error(w, "Fixture decision refused", http.StatusForbidden)
				return
			}
			w.WriteHeader(204)
			return
		}
		if r.Method != "GET" {
			writes++
			if actor != "42" && actor != "123" || mode == "rejected" || mode == "revoked" {
				http.Error(w, "Fixture permission refused", http.StatusForbidden)
				return
			}
			if mode == "uncertain" {
				http.Error(w, "Fixture unavailable", http.StatusInternalServerError)
				return
			}
			if r.Method == "DELETE" {
				w.WriteHeader(204)
				return
			}
			if r.URL.Path == "/helix/moderation/shield_mode" {
				var body struct {
					Active bool `json:"is_active"`
				}
				_ = json.NewDecoder(r.Body).Decode(&body)
				shieldActive = body.Active
				encode(map[string]any{"data": []any{map[string]any{"is_active": shieldActive}}})
				return
			}
			if r.URL.Path == "/helix/moderation/warnings" || r.URL.Path == "/helix/moderation/bans" {
				var body struct {
					Data map[string]any `json:"data"`
				}
				_ = json.NewDecoder(r.Body).Decode(&body)
				body.Data["broadcaster_id"] = r.URL.Query().Get("broadcaster_id")
				body.Data["moderator_id"] = actor
				encode(map[string]any{"data": []any{body.Data}})
				return
			}
			encode(map[string]any{"data": []any{map[string]any{}}})
			return
		}
		switch r.URL.Path {
		case "/helix/users":
			login := r.URL.Query().Get("login")
			id := map[string]string{"one": "123", "viewer": "456", "moderator": "42", "outsider": "43"}[login]
			if login == "viewer" && mode == "identity-race" {
				lookups++
				if lookups > 1 {
					id = "999"
				}
			}
			if id == "" {
				encode(map[string]any{"data": []any{}})
				return
			}
			encode(map[string]any{"data": []any{map[string]any{"id": id, "login": login}}})
		case "/helix/moderation/channels":
			data := []any{}
			if actor == "42" && mode != "revoked" {
				data = append(data, map[string]any{"broadcaster_id": "123"})
			}
			encode(map[string]any{"data": data, "pagination": map[string]any{}})
		case "/helix/moderation/shield_mode":
			encode(map[string]any{"data": []any{map[string]any{"is_active": shieldActive}}})
		case "/helix/chat/settings":
			encode(map[string]any{"data": []any{map[string]any{"broadcaster_id": "123", "slow_mode": false, "subscriber_mode": false, "follower_mode": false, "emote_mode": false, "unique_chat_mode": false}}})
		case "/helix/moderation/banned":
			encode(map[string]any{"data": []any{}})
		default:
			encode(map[string]any{"data": []any{}})
		}
	}))
	defer provider.Close()
	service, err := auth.New(auth.Config{ClientID: "fixture", ClientSecret: "fixture", PublicURL: "http://127.0.0.1:5199", AuthorizeURL: "http://127.0.0.1:5199/fixture/consent", TokenURL: provider.URL + "/token", ValidateURL: provider.URL + "/validate", HelixURL: provider.URL + "/helix", EventSubURL: "ws" + strings.TrimPrefix(provider.URL, "http") + "/eventsub/ws"})
	if err != nil {
		panic(err)
	}
	defer service.Close()
	mux := http.NewServeMux()
	service.Register(mux)
	mux.HandleFunc("GET /fixture/consent", func(w http.ResponseWriter, r *http.Request) {
		state := r.URL.Query().Get("state")
		suffix := ""
		if strings.Contains(r.URL.Query().Get("scope"), "moderator:read:suspicious_users") {
			suffix = "-automod"
		}
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprintf(w, `<!doctype html><title>Moderation fixture consent</title><h1>Local synthetic consent</h1><p>No Twitch connection or writes.</p><a href="/api/auth/callback?state=%s&amp;code=42%s">Consent as moderator</a><br><a href="/api/auth/callback?state=%s&amp;code=43%s">Consent as outsider</a><br><a href="/api/auth/callback?state=%s&amp;code=123%s">Consent as broadcaster one</a>`, state, suffix, state, suffix, state, suffix)
	})
	mux.HandleFunc("GET /fixture/mode", func(w http.ResponseWriter, r *http.Request) {
		value := r.URL.Query().Get("value")
		if value != "confirmed" && value != "rejected" && value != "uncertain" && value != "revoked" && value != "identity-race" {
			http.Error(w, "Bad mode", http.StatusBadRequest)
			return
		}
		mu.Lock()
		mode = value
		lookups = 0
		mu.Unlock()
		_, _ = w.Write([]byte("Mode set"))
	})
	mux.HandleFunc("GET /fixture/stats", func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"mode": mode, "writes": writes, "targetLookups": lookups, "privateWrites": privateWrites, "sockets": len(sockets)})
	})
	mux.HandleFunc("GET /fixture/event", func(w http.ResponseWriter, r *http.Request) {
		kind := r.URL.Query().Get("kind")
		mu.Lock()
		var id string
		var socket *fixtureSocket
		for key, value := range sockets {
			if len(value.subscriptions) == 2 {
				id = key
				socket = value
				break
			}
		}
		if socket == nil {
			mu.Unlock()
			http.Error(w, "Connect a private queue first", http.StatusConflict)
			return
		}
		eventCounter++
		counter := eventCounter
		data := socket.last
		subtype := "channel.suspicious_user.message"
		if kind == "resolve" {
			subtype = "channel.suspicious_user.update"
		}
		if kind != "duplicate" {
			metadata := map[string]string{"message_id": fmt.Sprintf("fixture-private-event-%d", counter), "message_type": "notification", "message_timestamp": time.Now().UTC().Format(time.RFC3339Nano), "subscription_type": subtype, "subscription_version": "1"}
			payload := map[string]any{"subscription": map[string]any{"id": socket.subscriptions[subtype], "type": subtype, "version": "1", "condition": map[string]string{"broadcaster_user_id": "123", "moderator_user_id": socket.actor}}, "event": map[string]any{"broadcaster_user_id": "123", "user_id": "456", "user_login": "viewer", "low_trust_status": "restricted", "types": []string{"ban_evader"}, "shared_ban_channel_ids": []string{"99"}, "ban_evasion_evaluation": "possible", "message": map[string]string{"message_id": "fixture-private-message-1", "text": "private_suspicious_sentinel <script>inert</script>"}, "reason": "automod", "automod": map[string]any{"category": "aggression", "level": 2}, "status": "approved", "access_token": "private-provider-extra"}}
			if kind == "resolve" {
				payload["event"].(map[string]any)["low_trust_status"] = "no_treatment"
			}
			if kind == "reconnect" {
				metadata["message_type"] = "session_reconnect"
				payload = map[string]any{"session": map[string]string{"reconnect_url": "ws" + strings.TrimPrefix(provider.URL, "http") + "/eventsub/ws?reconnect=" + id}}
			}
			if kind == "revoke" {
				metadata["message_type"] = "revocation"
			}
			var err error
			data, err = json.Marshal(map[string]any{"metadata": metadata, "payload": payload})
			if err != nil {
				mu.Unlock()
				http.Error(w, "Fixture encode failed", http.StatusInternalServerError)
				return
			}
			if kind == "hold" {
				socket.last = data
			}
		}
		conn := socket.conn
		mu.Unlock()
		if kind == "disconnect" {
			_ = conn.CloseNow()
			_, _ = w.Write([]byte("Fixture disconnected"))
			return
		}
		ctx, end := context.WithTimeout(r.Context(), 5*time.Second)
		defer end()
		if err := conn.Write(ctx, websocket.MessageText, data); err != nil {
			http.Error(w, "Fixture write failed", http.StatusInternalServerError)
			return
		}
		_, _ = w.Write([]byte("Fixture event sent"))
	})
	mux.HandleFunc("GET /fixture/seed", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "web/test-support/moderation-seed.html")
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "Synthetic public provider unavailable", http.StatusNotFound)
	})
	mux.Handle("/", http.FileServer(http.Dir("web/dist")))
	fmt.Println("AutoMod fixture: http://127.0.0.1:5199/fixture/seed")
	if err := http.ListenAndServe("127.0.0.1:5199", mux); err != nil {
		panic(err)
	}
}
