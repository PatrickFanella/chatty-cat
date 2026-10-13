// Local QA only: real auth/command handlers with a synthetic provider. No Twitch traffic.
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"

	"git.subcult.tv/subculture-collective/chatty-cat/internal/auth"
)

func main() {
	var mu sync.Mutex
	mode, writes, lookups := "confirmed", 0, 0
	shieldActive := false
	predictions := []any{}
	predictionCounter := 0
	scopes := []string{"user:write:chat", "user:read:moderated_channels", "moderator:manage:banned_users", "moderator:manage:chat_messages", "moderator:manage:chat_settings", "moderator:manage:warnings", "moderator:manage:shield_mode"}
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		encode := func(v any) { _ = json.NewEncoder(w).Encode(v) }
		if r.URL.Path == "/token" {
			_ = r.ParseForm()
			id := r.Form.Get("code")
			if strings.TrimSuffix(id, "-predictions") != "42" && strings.TrimSuffix(id, "-predictions") != "43" && strings.TrimSuffix(id, "-predictions") != "123" {
				http.Error(w, "Bad fixture code", http.StatusBadRequest)
				return
			}
			encode(map[string]any{"access_token": "fixture:" + id, "refresh_token": "fixture-refresh", "expires_in": 3600, "token_type": "bearer"})
			return
		}
		if r.URL.Path == "/validate" {
			id := strings.TrimPrefix(r.Header.Get("Authorization"), "OAuth fixture:")
			grants := append([]string{}, scopes...)
			if strings.HasSuffix(id, "-predictions") {
				grants = append(grants, "channel:manage:predictions")
			}
			id = strings.TrimSuffix(id, "-predictions")
			login := map[string]string{"42": "moderator", "43": "outsider", "123": "one"}[id]
			encode(map[string]any{"client_id": "fixture", "user_id": id, "login": login, "scopes": grants, "expires_in": 3600})
			return
		}
		mu.Lock()
		defer mu.Unlock()
		rawActor := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer fixture:")
		actor := strings.TrimSuffix(rawActor, "-predictions")
		if r.URL.Path == "/helix/predictions" {
			if actor != "123" || !strings.HasSuffix(rawActor, "-predictions") || mode == "revoked" {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			if r.Method == http.MethodGet {
				encode(map[string]any{"data": predictions})
				return
			}
			writes++
			if mode == "uncertain" {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			if mode == "rejected" {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			var input map[string]any
			if json.NewDecoder(r.Body).Decode(&input) != nil || input["broadcaster_id"] != actor {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			if r.Method == http.MethodPost {
				predictionCounter++
				outcomes := []map[string]any{}
				for i, raw := range input["outcomes"].([]any) {
					outcome := raw.(map[string]any)
					outcomes = append(outcomes, map[string]any{"id": fmt.Sprintf("outcome-%d-%d", predictionCounter, i), "title": outcome["title"], "users": 0, "channel_points": 0, "color": "BLUE"})
				}
				prediction := map[string]any{"id": fmt.Sprintf("fixture-prediction-%d", predictionCounter), "broadcaster_id": actor, "title": input["title"], "status": "ACTIVE", "prediction_window": input["prediction_window"], "winning_outcome_id": nil, "locked_at": nil, "created_at": time.Now().UTC().Format(time.RFC3339Nano), "ended_at": nil, "outcomes": outcomes}
				predictions = append([]any{prediction}, predictions...)
				encode(map[string]any{"data": []any{prediction}})
				return
			}
			for _, raw := range predictions {
				prediction := raw.(map[string]any)
				if prediction["id"] == input["id"] && (prediction["status"] == "ACTIVE" || prediction["status"] == "LOCKED") {
					prediction["status"] = input["status"]
					if input["status"] == "LOCKED" {
						prediction["locked_at"] = time.Now().UTC().Format(time.RFC3339Nano)
					} else {
						prediction["ended_at"] = time.Now().UTC().Format(time.RFC3339Nano)
					}
					if input["status"] == "RESOLVED" {
						prediction["winning_outcome_id"] = input["winning_outcome_id"]
					}
					encode(map[string]any{"data": []any{prediction}})
					return
				}
			}
			w.WriteHeader(http.StatusConflict)
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
	service, err := auth.New(auth.Config{ClientID: "fixture", ClientSecret: "fixture", PublicURL: "http://127.0.0.1:5201", AuthorizeURL: "http://127.0.0.1:5201/fixture/consent", TokenURL: provider.URL + "/token", ValidateURL: provider.URL + "/validate", HelixURL: provider.URL + "/helix"})
	if err != nil {
		panic(err)
	}
	defer service.Close()
	mux := http.NewServeMux()
	service.Register(mux)
	mux.HandleFunc("GET /fixture/consent", func(w http.ResponseWriter, r *http.Request) {
		state := r.URL.Query().Get("state")
		suffix := ""
		if strings.Contains(r.URL.Query().Get("scope"), "channel:manage:predictions") {
			suffix = "-predictions"
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
		_ = json.NewEncoder(w).Encode(map[string]any{"mode": mode, "writes": writes, "targetLookups": lookups, "predictions": len(predictions)})
	})
	mux.HandleFunc("GET /fixture/seed", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "web/test-support/moderation-seed.html")
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "Synthetic public provider unavailable", http.StatusNotFound)
	})
	mux.Handle("/", http.FileServer(http.Dir("web/dist")))
	fmt.Println("Moderation fixture: http://127.0.0.1:5201/fixture/seed")
	if err := http.ListenAndServe("127.0.0.1:5201", mux); err != nil {
		panic(err)
	}
}
