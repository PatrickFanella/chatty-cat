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

func predictionFixture(status, winner string) map[string]any {
	v := map[string]any{"id": "prediction-one", "broadcaster_id": "42", "title": "Question?", "status": status, "prediction_window": 30, "created_at": "2026-10-12T12:00:00Z", "ended_at": nil, "locked_at": nil, "winning_outcome_id": nil, "outcomes": []map[string]any{{"id": "outcome-one", "title": "One", "users": 2, "channel_points": 10, "color": "BLUE"}, {"id": "outcome-two", "title": "Two", "users": 1, "channel_points": 20, "color": "PINK"}}, "top_predictors": "never-export"}
	if status == "LOCKED" {
		v["locked_at"] = "2026-10-12T12:00:30Z"
	}
	if status == "RESOLVED" || status == "CANCELED" {
		v["ended_at"] = "2026-10-12T12:01:00Z"
	}
	if winner != "" {
		v["winning_outcome_id"] = winner
	}
	return v
}
func TestPredictionValidationRequiresOwnedWinnerAndNoInferredCounts(t *testing.T) {
	valid := predictionInput{Account: "42", Channel: "one", Broadcaster: "42", RequestID: "request-123456789012345", Action: "CREATE", Title: "Question?", Outcomes: []string{"One", "Two"}, Window: 30}
	if !validPredictionInput(valid) {
		t.Fatal("valid")
	}
	for _, change := range []func(*predictionInput){func(p *predictionInput) { p.Title = strings.Repeat("a", 46) }, func(p *predictionInput) { p.Window = 29 }, func(p *predictionInput) { p.Outcomes = []string{"One", "one"} }, func(p *predictionInput) { p.Winner = "outcome-one" }} {
		v := valid
		change(&v)
		if validPredictionInput(v) {
			t.Fatal(v)
		}
	}
	v := predictionInput{Account: "42", Channel: "one", Broadcaster: "42", RequestID: "request-123456789012345", Action: "RESOLVED", ID: "prediction-one"}
	if validPredictionInput(v) {
		t.Fatal("missing winner")
	}
	v.Winner = "other"
	if validPredictionTransition(providerPrediction{Status: "LOCKED", Outcomes: []predictionOutcome{{ID: "outcome-one"}}}, v) {
		t.Fatal("foreign winner")
	}
	raw := predictionFixture("RESOLVED", "outcome-one")
	data, _ := json.Marshal(map[string]any{"data": []any{raw}})
	values, err := decodePredictions(data, "42", 20)
	if err != nil {
		t.Fatal(err)
	}
	safe, _ := json.Marshal(values)
	if strings.Contains(string(safe), "never-export") {
		t.Fatal("provider extras leaked")
	}
	raw["winning_outcome_id"] = "foreign"
	data, _ = json.Marshal(map[string]any{"data": []any{raw}})
	if _, err := decodePredictions(data, "42", 20); err == nil {
		t.Fatal("foreign winner response")
	}
}
func TestPredictionLifecycleAndWrongWinnerAcknowledgement(t *testing.T) {
	f := setup(t)
	p := &session{tokens: tokens{Access: "fixture"}, user: identity{UserID: "42", Scopes: []string{predictionScope}}}
	current := []any{}
	writes := 0
	bad := false
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/predictions" {
			t.Error(r.URL)
			return
		}
		if r.Method == http.MethodGet {
			_ = json.NewEncoder(w).Encode(map[string]any{"data": current})
			return
		}
		writes++
		var input map[string]any
		_ = json.NewDecoder(r.Body).Decode(&input)
		if input["broadcaster_id"] != "42" {
			t.Error(input)
		}
		state, winner := "ACTIVE", ""
		if r.Method == http.MethodPatch {
			state = input["status"].(string)
			winner, _ = input["winning_outcome_id"].(string)
		}
		if bad {
			winner = "outcome-two"
		}
		value := predictionFixture(state, winner)
		current = []any{value}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": current})
	}))
	defer provider.Close()
	f.service.cfg.HelixURL = provider.URL
	create := predictionInput{Action: "CREATE", Title: "Question?", Outcomes: []string{"One", "Two"}, Window: 30}
	v, code := f.service.performPrediction(context.Background(), p, create)
	if code != 200 || !v.Sent || writes != 1 {
		t.Fatal(v, code, writes)
	}
	v, code = f.service.performPrediction(context.Background(), p, create)
	if code != 409 || writes != 1 {
		t.Fatal("duplicate create", v)
	}
	lock := predictionInput{Action: "LOCKED", ID: "prediction-one"}
	v, code = f.service.performPrediction(context.Background(), p, lock)
	if code != 200 || !v.Sent || writes != 2 {
		t.Fatal(v, code, writes)
	}
	v, code = f.service.performPrediction(context.Background(), p, lock)
	if code != 409 || writes != 2 {
		t.Fatal("lock replay", v)
	}
	resolve := predictionInput{Action: "RESOLVED", ID: "prediction-one", Winner: "foreign"}
	v, code = f.service.performPrediction(context.Background(), p, resolve)
	if code != 409 || writes != 2 {
		t.Fatal("foreign winner", v)
	}
	resolve.Winner = "outcome-one"
	bad = true
	v, code = f.service.performPrediction(context.Background(), p, resolve)
	if code != 502 || !v.Uncertain || v.Sent || writes != 3 {
		t.Fatal("wrong winner acknowledgement", v, code, writes)
	}
	current = []any{predictionFixture("LOCKED", "")}
	bad = false
	v, code = f.service.performPrediction(context.Background(), p, resolve)
	if code != 200 || !v.Sent || writes != 4 {
		t.Fatal(v, code, writes)
	}
	current = []any{predictionFixture("ACTIVE", "")}
	v, code = f.service.performPrediction(context.Background(), p, predictionInput{Action: "CANCELED", ID: "prediction-one"})
	if code != 200 || !v.Sent || writes != 5 {
		t.Fatal(v, code, writes)
	}
}
func TestPredictionEndpointIdentityCSRFAndReceiptReplay(t *testing.T) {
	f := setupSend(t)
	var p *session
	for _, value := range f.service.sessions {
		p = value
	}
	p.user.Scopes = append(p.user.Scopes, predictionScope)
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
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{predictionFixture("ACTIVE", "")}})
	}))
	defer provider.Close()
	f.service.cfg.HelixURL = provider.URL
	input := predictionInput{Account: "42", Channel: "one", Broadcaster: "42", RequestID: "prediction-request-123456", Action: "CREATE", Title: "Question?", Outcomes: []string{"One", "Two"}, Window: 30}
	post := func(value predictionInput, csrf string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(value)
		r := httptest.NewRequest("POST", "https://chat.subcult.tv/api/auth/predictions", strings.NewReader(string(body)))
		r.Header.Set("Origin", f.service.origin)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Token", csrf)
		for _, cookie := range f.cookies {
			r.AddCookie(cookie)
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
		t.Fatal("receipt replay", writes)
	}
	p.lastSend = time.Time{}
	p.user.Scopes = nil
	input.RequestID = "no-scope-request-123456"
	if w := post(input, f.csrf); w.Code != 403 || writes != 1 {
		t.Fatal(w.Code, writes)
	}
}
