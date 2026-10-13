package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func pollFixture(status string) map[string]any {
	return map[string]any{"id": "poll-one", "broadcaster_id": "42", "title": "Question?", "status": status, "duration": 30, "channel_points_voting_enabled": false, "channel_points_per_vote": 0, "started_at": "2026-10-12T12:00:00Z", "choices": []map[string]any{{"id": "choice-one", "title": "One", "votes": 2, "channel_points_votes": 0}, {"id": "choice-two", "title": "Two", "votes": 1, "channel_points_votes": 0}}, "access_token": "never-export"}
}
func TestPollDefinitionAndProviderValidation(t *testing.T) {
	valid := pollInput{Account: "42", Channel: "one", Broadcaster: "42", RequestID: "request-123456789012345", Action: "CREATE", Title: "Question?", Choices: []string{"One", "Two"}, Duration: 30}
	if !validPollInput(valid) {
		t.Fatal("valid refused")
	}
	for _, change := range []func(*pollInput){func(p *pollInput) { p.Title = strings.Repeat("a", 61) }, func(p *pollInput) { p.Choices = []string{"One", "one"} }, func(p *pollInput) { p.Duration = 14 }, func(p *pollInput) { p.PointsEnabled = true; p.Points = 0 }, func(p *pollInput) { p.Action = "ARCHIVED"; p.ID = "poll-one" }} {
		v := valid
		change(&v)
		if validPollInput(v) {
			t.Fatal(v)
		}
	}
	fixture := pollFixture("ACTIVE")
	data, _ := json.Marshal(map[string]any{"data": []any{fixture}})
	values, err := decodePolls(data, "42", 20)
	if err != nil || len(values) != 1 {
		t.Fatal(err)
	}
	safe, _ := json.Marshal(values)
	if strings.Contains(string(safe), "never-export") {
		t.Fatal("extra provider field leaked")
	}
	fixture["broadcaster_id"] = "43"
	data, _ = json.Marshal(map[string]any{"data": []any{fixture}})
	if _, err := decodePolls(data, "42", 20); err == nil {
		t.Fatal("cross-account poll accepted")
	}
}
func TestPollLifecycleReadsBeforeWritesAndVerifiesAcknowledgements(t *testing.T) {
	f := setup(t)
	p := &session{tokens: tokens{Access: "fixture"}, user: identity{UserID: "42", Scopes: []string{pollScope}}}
	writes := 0
	current := []any{}
	bad := false
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/polls" {
			t.Error(r.URL)
			return
		}
		if r.Method == http.MethodGet {
			if r.URL.Query().Get("broadcaster_id") != "42" {
				t.Error(r.URL)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"data": current})
			return
		}
		writes++
		var input map[string]any
		_ = json.NewDecoder(r.Body).Decode(&input)
		if input["broadcaster_id"] != "42" {
			t.Error(input)
		}
		state := "ACTIVE"
		if r.Method == http.MethodPatch {
			state = input["status"].(string)
			if input["id"] != "poll-one" {
				t.Error(input)
			}
		}
		poll := pollFixture(state)
		if bad {
			poll["title"] = "wrong acknowledgement"
		}
		current = []any{poll}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": current})
	}))
	defer provider.Close()
	f.service.cfg.HelixURL = provider.URL
	create := pollInput{Account: "42", Channel: "one", Broadcaster: "42", RequestID: "request-123456789012345", Action: "CREATE", Title: "Question?", Choices: []string{"One", "Two"}, Duration: 30}
	result, code := f.service.performPoll(context.Background(), p, create)
	if code != 200 || !result.Sent || result.Poll == nil || writes != 1 {
		t.Fatal(result, code, writes)
	}
	result, code = f.service.performPoll(context.Background(), p, create)
	if code != 409 || result.Sent || writes != 1 {
		t.Fatal("duplicate active create", result)
	}
	end := pollInput{Action: "TERMINATED", ID: "other-poll"}
	result, code = f.service.performPoll(context.Background(), p, end)
	if code != 409 || writes != 1 {
		t.Fatal("stale poll ended")
	}
	end.ID = "poll-one"
	result, code = f.service.performPoll(context.Background(), p, end)
	if code != 200 || !result.Sent || writes != 2 {
		t.Fatal(result, code, writes)
	}
	current = []any{}
	bad = true
	result, code = f.service.performPoll(context.Background(), p, create)
	if code != 502 || !result.Uncertain || result.Sent || writes != 3 {
		t.Fatal("malformed acknowledgement", result, code, writes)
	}
}
func TestPollEndpointRejectsWrongActorCSRFAndReplaysReceiptOnce(t *testing.T) {
	f := setupSend(t)
	var p *session
	for _, value := range f.service.sessions {
		p = value
	}
	p.user.Scopes = append(p.user.Scopes, pollScope)
	writes := 0
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/users" {
			id := "42"
			if r.URL.Query().Get("login") == "other" {
				id = "123"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"id": id, "login": r.URL.Query().Get("login")}}})
			return
		}
		if r.Method == http.MethodGet {
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{}})
			return
		}
		writes++
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{pollFixture("ACTIVE")}})
	}))
	defer provider.Close()
	f.service.cfg.HelixURL = provider.URL
	input := pollInput{Account: "42", Channel: "one", Broadcaster: "42", RequestID: "poll-request-1234567890", Action: "CREATE", Title: "Question?", Choices: []string{"One", "Two"}, Duration: 30}
	post := func(value pollInput, csrf string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(value)
		r := httptest.NewRequest("POST", "https://chat.subcult.tv/api/auth/polls", strings.NewReader(string(body)))
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
	if w := post(input, "wrong"); w.Code != 403 || writes != 0 {
		t.Fatal(w.Code, writes)
	}
	wrong := input
	wrong.Channel = "other"
	if w := post(wrong, f.csrf); w.Code != 403 || writes != 0 {
		t.Fatal(w.Code, writes)
	}
	for i := 0; i < 2; i++ {
		if w := post(input, f.csrf); w.Code != 200 || !strings.Contains(w.Body.String(), `"sent":true`) {
			t.Fatal(w.Code, w.Body)
		}
	}
	if writes != 1 {
		t.Fatal("receipt replay wrote again", writes)
	}
	wrong = input
	wrong.Title = "Different"
	if w := post(wrong, f.csrf); w.Code != 409 || writes != 1 {
		t.Fatal("receipt reused", w.Code, writes)
	}
}
