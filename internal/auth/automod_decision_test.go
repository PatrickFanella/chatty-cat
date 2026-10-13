package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAutoModDecisionRefusalReplayAndUncertainty(t *testing.T) {
	for _, status := range []int{204, 403, 500} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			f := setupSend(t)
			var p *session
			for _, candidate := range f.service.sessions {
				p = candidate
			}
			p.user.Scopes = append(p.user.Scopes, autoModScope)
			ctx, cancel := context.WithCancel(f.service.ctx)
			defer cancel()
			q := newAutoModState("42", "hasanabi", "123")
			q.active = true
			q.subscriptions["subscription-automod.message.hold"] = "automod.message.hold"
			q.observe(automodFixture("event-decision", "automod.message.hold", "message-decision", ""))
			hub := &autoModHub{state: q, session: p, service: f.service, ctx: ctx, cancel: cancel, peers: map[chan struct{}]bool{}}
			f.service.autoModHubs = map[string]*autoModHub{"42": hub}
			writes := 0
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/users" {
					_, _ = w.Write([]byte(`{"data":[{"id":"123","login":"hasanabi"}]}`))
					return
				}
				writes++
				if r.URL.Path != "/moderation/automod/message" || r.Method != "POST" {
					t.Error(r.URL)
				}
				var body map[string]string
				if json.NewDecoder(r.Body).Decode(&body) != nil || body["user_id"] != "42" || body["msg_id"] != "message-decision" || body["action"] != "ALLOW" {
					t.Error(body)
				}
				w.WriteHeader(status)
			}))
			defer provider.Close()
			f.service.cfg.HelixURL = provider.URL
			input := autoModInput{Account: "42", Channel: "hasanabi", BroadcasterID: "123", UserID: "456", MessageID: "message-decision", EventID: "event-decision", Epoch: q.epoch, Action: "ALLOW", RequestID: "decision-request-123456"}
			post := func(value autoModInput, csrf string) *httptest.ResponseRecorder {
				body, err := json.Marshal(value)
				if err != nil {
					t.Fatal(err)
				}
				r := httptest.NewRequest("POST", "https://chat.subcult.tv/api/auth/automod/decision", strings.NewReader(string(body)))
				r.Header.Set("Origin", f.service.origin)
				r.Header.Set("Content-Type", "application/json")
				r.Header.Set("X-CSRF-Token", csrf)
				for _, c := range f.cookies {
					r.AddCookie(c)
				}
				w := httptest.NewRecorder()
				f.handler.ServeHTTP(w, r)
				return w
			}
			if r := post(input, "wrong"); r.Code != 403 || writes != 0 {
				t.Fatal(r.Code, writes)
			}
			wrong := input
			wrong.UserID = "999"
			wrong.RequestID = "refused-request-123456"
			if r := post(wrong, f.csrf); r.Code != 409 || writes != 0 {
				t.Fatal(r.Code, r.Body, writes)
			}
			p.lastSend = time.Time{}
			for i := 0; i < 2; i++ {
				r := post(input, f.csrf)
				if status == 204 && !strings.Contains(r.Body.String(), `"sent":true`) {
					t.Fatal(r.Code, r.Body)
				}
				if status == 500 && !strings.Contains(r.Body.String(), `"uncertain":true`) {
					t.Fatal(r.Code, r.Body)
				}
			}
			if writes != 1 {
				t.Fatal("decision replayed", writes)
			}
			if status == 500 {
				p.lastSend = time.Time{}
				input.RequestID = "other-decision-123456"
				if r := post(input, f.csrf); r.Code != 409 || writes != 1 {
					t.Fatal("uncertain retry admitted", r.Code, writes)
				}
			}
		})
	}
}
