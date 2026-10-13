package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBroadcastCommandValidation(t *testing.T) {
	for _, text := range []string{"/clip extra", "/commercial 31", "/commercial 181", "/settitle", "/setgame", "/marker " + strings.Repeat("x", 141)} {
		if _, err := parseCommand(text); err == nil {
			t.Fatal(text)
		}
	}
	for _, text := range []string{"/clip", "/marker", "/marker hello", "/settitle New title", "/setgame id:123", "/commercial 30"} {
		if _, err := parseCommand(text); err != nil {
			t.Fatal(text, err)
		}
	}
	if clipEditURL("https://evil.example/FixtureClip/edit", "FixtureClip") != "" || clipEditURL("https://clips.twitch.tv/FixtureClip/edit", "FixtureClip") == "" {
		t.Fatal("edit URL policy")
	}
}
func TestBroadcastActionsConfirmOnlyExactProviderResultsAndRejectStaleContext(t *testing.T) {
	f := setup(t)
	p := &session{tokens: tokens{Access: "fixture"}, user: identity{UserID: "42", Scopes: []string{broadcastScope, clipScope, commercialScope}}}
	title, game := "Original title", "100"
	offline, ambiguous, badMarker, missingClip := false, false, false, false
	writes := 0
	var cancelCapture context.CancelFunc
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		encode := func(v any) { _ = json.NewEncoder(w).Encode(v) }
		switch r.URL.Path {
		case "/users":
			encode(map[string]any{"data": []map[string]string{{"id": "42", "login": r.URL.Query().Get("login"), "broadcaster_type": "affiliate"}}})
		case "/streams":
			data := []any{}
			if !offline {
				data = append(data, map[string]string{"id": "stream-one", "user_id": "42", "type": "live", "started_at": "2026-10-13T00:00:00Z"})
			}
			encode(map[string]any{"data": data})
		case "/channels":
			if r.Method == http.MethodPatch {
				writes++
				var body map[string]string
				_ = json.NewDecoder(r.Body).Decode(&body)
				if v, ok := body["title"]; ok {
					title = v
				}
				if v, ok := body["game_id"]; ok {
					game = v
				}
				w.WriteHeader(204)
				return
			}
			encode(map[string]any{"data": []map[string]string{{"broadcaster_id": "42", "title": title, "game_id": game, "game_name": "Fixture game"}}})
		case "/games":
			encode(map[string]any{"data": []categoryOption{{ID: r.URL.Query().Get("id"), Name: "Fixture game"}}})
		case "/search/categories":
			data := []categoryOption{{ID: "101", Name: "Fixture game"}}
			if ambiguous {
				data = append(data, categoryOption{ID: "102", Name: "Fixture game"})
			}
			encode(map[string]any{"data": data})
		case "/streams/markers":
			writes++
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["user_id"] != "42" {
				t.Error(body)
			}
			description := body["description"]
			if badMarker {
				description = "wrong"
			}
			encode(map[string]any{"data": []map[string]any{{"id": "marker-one", "created_at": "2026-10-13T00:00:00Z", "position_seconds": 12, "description": description}}})
		case "/channels/commercial":
			writes++
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			encode(map[string]any{"data": []map[string]any{{"length": body["length"], "retry_after": 480, "message": ""}}})
		case "/clips":
			if r.Method == http.MethodPost {
				writes++
				w.WriteHeader(202)
				encode(map[string]any{"data": []map[string]string{{"id": "FixtureClip", "edit_url": "https://clips.twitch.tv/FixtureClip/edit"}}})
				return
			}
			data := []any{}
			if missingClip && cancelCapture != nil {
				cancelCapture()
			}
			if !missingClip {
				data = append(data, map[string]string{"id": "FixtureClip", "broadcaster_id": "42", "creator_id": "42"})
			}
			encode(map[string]any{"data": data})
		default:
			t.Error(r.URL)
			w.WriteHeader(404)
		}
	}))
	defer provider.Close()
	f.service.cfg.HelixURL = provider.URL
	run := func(text string) (sendResult, int) {
		v, err := f.service.broadcastContextRead(context.Background(), p, "one")
		if err != nil {
			t.Fatal(err)
		}
		return f.service.command(context.Background(), p, sendInput{Channel: "one", Message: text, ExpectedBroadcasterID: v.Broadcaster, ExpectedStreamID: v.StreamID, ExpectedBroadcastRevision: v.Revision})
	}
	for _, text := range []string{"/settitle New title", "/setgame id:101", "/marker hello", "/clip", "/commercial 30"} {
		v, code := run(text)
		if code != 200 || !v.Sent || !v.Command {
			t.Fatal(text, v, code)
		}
		if text == "/clip" && (v.URL != "https://clips.twitch.tv/FixtureClip" || v.EditURL == "") {
			t.Fatal(v)
		}
	}
	before := writes
	v, code := run("/commercial 30")
	if code != 429 || writes != before {
		t.Fatal("cooldown", v, code, writes)
	}
	ambiguous = true
	v, code = run("/setgame Fixture game")
	if code != 409 || writes != before {
		t.Fatal("ambiguous category", v, code, writes)
	}
	v, code = f.service.command(context.Background(), p, sendInput{Channel: "one", Message: "/settitle Stale", ExpectedBroadcasterID: "42", ExpectedBroadcastRevision: "stale-revision-123456"})
	if code != 409 || writes != before {
		t.Fatal("metadata guard", v, code, writes)
	}
	offline = true
	for _, text := range []string{"/clip", "/marker", "/commercial 30"} {
		v, code = run(text)
		if code != 409 || writes != before {
			t.Fatal("offline", text, v, code, writes)
		}
	}
	v, code = run("/settitle Offline title")
	if code != 200 || !v.Sent || writes != before+1 {
		t.Fatal("offline metadata update", v, code, writes)
	}
	offline = false
	badMarker = true
	v, code = run("/marker hello")
	if code != 502 || !v.Uncertain || v.Sent {
		t.Fatal("wrong marker acknowledgement", v, code)
	}
	missingClip = true
	value, err := f.service.broadcastContextRead(context.Background(), p, "one")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cancelCapture = cancel
	before = writes
	v, code = f.service.command(ctx, p, sendInput{Channel: "one", Message: "/clip", ExpectedBroadcasterID: "42", ExpectedStreamID: value.StreamID})
	if code != 502 || !v.Uncertain || v.Sent || writes != before+1 || v.URL != "" || v.EditURL != "" {
		t.Fatal("unpublished clip retried/exposed", v, code, writes)
	}
}
func TestBroadcasterIdentityAndScopeRefusedBeforeWrites(t *testing.T) {
	f := setup(t)
	p := &session{tokens: tokens{Access: "fixture"}, user: identity{UserID: "43", Scopes: []string{broadcastScope}}}
	writes := 0
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			writes++
			return
		}
		switch r.URL.Path {
		case "/users":
			_, _ = w.Write([]byte(`{"data":[{"id":"42","login":"one","broadcaster_type":"affiliate"}]}`))
		case "/streams":
			_, _ = w.Write([]byte(`{"data":[]}`))
		case "/channels":
			_, _ = w.Write([]byte(`{"data":[{"broadcaster_id":"42","title":"Original","game_id":"100","game_name":"Fixture"}]}`))
		}
	}))
	defer provider.Close()
	f.service.cfg.HelixURL = provider.URL
	v, code := f.service.command(context.Background(), p, sendInput{Channel: "one", Message: "/settitle New", ExpectedBroadcasterID: "42"})
	if code != 403 || writes != 0 || v.Sent {
		t.Fatal(v, code, writes)
	}
	p.user.Scopes = nil
	v, code = f.service.command(context.Background(), p, sendInput{Channel: "one", Message: "/marker", ExpectedBroadcasterID: "42"})
	if code != 403 || writes != 0 {
		t.Fatal(v, code, writes)
	}
}
