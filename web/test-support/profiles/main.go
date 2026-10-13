// Local QA only: real OAuth/session handlers against a synthetic consent provider.
package main

import (
	"encoding/json"
	"fmt"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/auth"
	"net/http"
	"net/http/httptest"
	"strings"
)

func main() {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasPrefix(r.URL.Path, "/helix") {
			_, _ = w.Write([]byte(`{"data":[]}`))
			return
		}
		if r.URL.Path == "/token" {
			_ = r.ParseForm()
			code := r.Form.Get("code")
			if code != "42" && code != "43" {
				http.Error(w, "bad fixture code", 400)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "fixture:" + code, "refresh_token": "fixture-refresh", "expires_in": 3600, "token_type": "bearer"})
			return
		}
		id := strings.TrimPrefix(r.Header.Get("Authorization"), "OAuth fixture:")
		login := "alice"
		if id == "43" {
			login = "bob"
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"client_id": "fixture", "login": login, "user_id": id, "scopes": []string{"user:write:chat", "user:read:emotes"}, "expires_in": 3600})
	}))
	defer provider.Close()
	service, err := auth.New(auth.Config{ClientID: "fixture", ClientSecret: "fixture", PublicURL: "http://127.0.0.1:5196", AuthorizeURL: "http://127.0.0.1:5196/fixture/consent", TokenURL: provider.URL + "/token", ValidateURL: provider.URL + "/validate", HelixURL: provider.URL + "/helix"})
	if err != nil {
		panic(err)
	}
	defer service.Close()
	mux := http.NewServeMux()
	service.Register(mux)
	mux.HandleFunc("GET /fixture/consent", func(w http.ResponseWriter, r *http.Request) {
		state := r.URL.Query().Get("state")
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprintf(w, `<!doctype html><title>Fixture Twitch consent</title><h1>Fixture Twitch consent</h1><p>Local synthetic provider. No Twitch connection or write. Choose the selected account; choosing another must fail.</p><a href="/api/auth/callback?state=%s&amp;code=42">Consent as alice</a><br><a href="/api/auth/callback?state=%s&amp;code=43">Consent as bob</a><br><a href="/api/auth/callback?state=%s&amp;error=access_denied">Cancel consent</a>`, state, state, state)
	})
	mux.HandleFunc("GET /fixture/seed", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "web/test-support/profiles-seed.html")
	})
	mux.HandleFunc("GET /api/users/{login}", func(w http.ResponseWriter, r *http.Request) {
		login := r.PathValue("login")
		if login != "viewer" && login != "renamed" {
			http.Error(w, "Fixture profile missing", 404)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "100", "login": login, "name": login, "bio": "Public fixture profile", "image": "", "color": "", "created": "", "followers": nil, "partner": false, "affiliate": false})
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "Fixture public provider unavailable", 404)
	})
	mux.Handle("/", http.FileServer(http.Dir("web/dist")))
	fmt.Println("Account profile fixture: http://127.0.0.1:5196/fixture/seed")
	if err := http.ListenAndServe("127.0.0.1:5196", mux); err != nil {
		panic(err)
	}
}
