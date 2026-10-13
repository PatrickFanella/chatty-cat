package auth

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"reflect"
	"slices"
	"strings"
	"time"
)

const predictionScope = "channel:manage:predictions"

type predictionOutcome struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Users  *int64 `json:"users"`
	Points *int64 `json:"channel_points"`
	Color  string `json:"color"`
}
type providerPrediction struct {
	ID          string              `json:"id"`
	Broadcaster string              `json:"broadcaster_id"`
	Title       string              `json:"title"`
	Status      string              `json:"status"`
	Outcomes    []predictionOutcome `json:"outcomes"`
	Window      int                 `json:"prediction_window"`
	Winner      *string             `json:"winning_outcome_id"`
	Created     string              `json:"created_at"`
	Ended       *string             `json:"ended_at"`
	Locked      *string             `json:"locked_at"`
}
type predictionInput struct {
	Account     string   `json:"account"`
	Channel     string   `json:"channel"`
	Broadcaster string   `json:"broadcasterID"`
	RequestID   string   `json:"requestID"`
	Action      string   `json:"action"`
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Outcomes    []string `json:"outcomes"`
	Window      int      `json:"window"`
	Winner      string   `json:"winnerID"`
}
type predictionResult struct {
	Sent       bool                `json:"sent"`
	Uncertain  bool                `json:"uncertain,omitempty"`
	Error      string              `json:"error,omitempty"`
	Prediction *providerPrediction `json:"prediction,omitempty"`
}
type predictionReceipt struct {
	Input  predictionInput
	Result predictionResult
	Status int
}

func validPredictionInput(v predictionInput) bool {
	if !numericID(v.Account) || !numericID(v.Broadcaster) || !channelPattern.MatchString(v.Channel) || !requestPattern.MatchString(v.RequestID) {
		return false
	}
	if v.Action == "CREATE" {
		if v.ID != "" || v.Winner != "" || !pollText(v.Title, 45) || len(v.Outcomes) < 2 || len(v.Outcomes) > 10 || v.Window < 30 || v.Window > 1800 {
			return false
		}
		seen := map[string]bool{}
		for _, o := range v.Outcomes {
			key := strings.ToLower(o)
			if !pollText(o, 25) || seen[key] {
				return false
			}
			seen[key] = true
		}
		return true
	}
	return slices.Contains([]string{"LOCKED", "CANCELED", "RESOLVED"}, v.Action) && messageIDPattern.MatchString(v.ID) && v.Title == "" && len(v.Outcomes) == 0 && v.Window == 0 && (v.Action == "RESOLVED" && messageIDPattern.MatchString(v.Winner) || v.Action != "RESOLVED" && v.Winner == "")
}
func decodePredictions(data []byte, account string, max int) ([]providerPrediction, error) {
	var response struct{ Data []providerPrediction }
	if json.Unmarshal(data, &response) != nil || response.Data == nil || len(response.Data) > max {
		return nil, errors.New("prediction response unavailable")
	}
	seen := map[string]bool{}
	open := 0
	for _, p := range response.Data {
		if !messageIDPattern.MatchString(p.ID) || seen[p.ID] || p.Broadcaster != account || !pollText(p.Title, 45) || !slices.Contains([]string{"ACTIVE", "LOCKED", "CANCELED", "RESOLVED"}, p.Status) || len(p.Outcomes) < 2 || len(p.Outcomes) > 10 || p.Window < 30 || p.Window > 1800 {
			return nil, errors.New("prediction identity/state unavailable")
		}
		seen[p.ID] = true
		if p.Status == "ACTIVE" || p.Status == "LOCKED" {
			open++
		}
		if open > 1 {
			return nil, errors.New("multiple open predictions unavailable")
		}
		if _, err := time.Parse(time.RFC3339Nano, p.Created); err != nil {
			return nil, errors.New("prediction creation timestamp unavailable")
		}
		for _, stamp := range []*string{p.Ended, p.Locked} {
			if stamp != nil {
				if _, err := time.Parse(time.RFC3339Nano, *stamp); err != nil {
					return nil, errors.New("prediction timestamp unavailable")
				}
			}
		}
		if p.Status == "LOCKED" && p.Locked == nil || (p.Status == "RESOLVED" || p.Status == "CANCELED") && p.Ended == nil {
			return nil, errors.New("prediction terminal timestamp unavailable")
		}
		outcomes := map[string]bool{}
		for _, o := range p.Outcomes {
			if !messageIDPattern.MatchString(o.ID) || outcomes[o.ID] || !pollText(o.Title, 25) || o.Users == nil || o.Points == nil || *o.Users < 0 || *o.Users > 9007199254740991 || *o.Points < 0 || *o.Points > 9007199254740991 || !slices.Contains([]string{"BLUE", "PINK"}, o.Color) {
				return nil, errors.New("prediction counts/outcomes unavailable")
			}
			outcomes[o.ID] = true
		}
		if p.Status == "RESOLVED" && (p.Winner == nil || !outcomes[*p.Winner]) || p.Status != "RESOLVED" && p.Winner != nil {
			return nil, errors.New("prediction winner unavailable")
		}
	}
	return response.Data, nil
}
func (s *Service) readPredictions(ctx context.Context, p *session) ([]providerPrediction, int) {
	data, status, ok := s.helix(ctx, p, http.MethodGet, "/predictions?"+url.Values{"broadcaster_id": {p.user.UserID}, "first": {"20"}}.Encode(), nil)
	if !ok || status != 200 {
		return nil, status
	}
	values, err := decodePredictions(data, p.user.UserID, 20)
	if err != nil {
		return nil, 502
	}
	return values, 200
}
func (s *Service) predictions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	channel := q.Get("channel")
	if !s.sameHost(r) || len(q) != 1 || len(q["channel"]) != 1 || !channelPattern.MatchString(channel) {
		writePoll(w, 400, predictionResult{Error: "Choose a same-origin channel"})
		return
	}
	p := s.lookup(r)
	if p == nil {
		writePoll(w, 401, predictionResult{Error: "Log in as broadcaster"})
		return
	}
	ctx, end := context.WithTimeout(r.Context(), 20*time.Second)
	defer end()
	p.mu.Lock()
	defer p.mu.Unlock()
	if code := s.broadcasterContext(ctx, p, r, channel, "", predictionScope, false); code != 200 {
		writePoll(w, code, predictionResult{Error: "Prediction read unavailable; select your own broadcaster channel and grant prediction consent"})
		return
	}
	values, code := s.readPredictions(ctx, p)
	if code != 200 {
		if code < 400 || code > 599 {
			code = 502
		}
		writePoll(w, code, predictionResult{Error: "Twitch prediction read unavailable; refresh after checking channel/scope"})
		return
	}
	writePoll(w, 200, map[string]any{"account": p.user.UserID, "channel": channel, "broadcasterID": p.user.UserID, "at": time.Now().UnixMilli(), "predictions": values})
}
func (s *Service) predictionAction(w http.ResponseWriter, r *http.Request) {
	if !s.sameHost(r) || !equal(r.Header.Get("Origin"), s.origin) {
		writePoll(w, 403, predictionResult{Error: "Invalid request origin"})
		return
	}
	p := s.lookup(r)
	if p == nil {
		writePoll(w, 401, predictionResult{Error: "Log in as broadcaster"})
		return
	}
	kind, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || kind != "application/json" {
		writePoll(w, 415, predictionResult{Error: "Expected JSON"})
		return
	}
	var input predictionInput
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	d.DisallowUnknownFields()
	if d.Decode(&input) != nil || d.Decode(new(any)) != io.EOF || !validPredictionInput(input) {
		writePoll(w, 400, predictionResult{Error: "Invalid prediction outcomes, window, action or identifiers"})
		return
	}
	ctx, end := context.WithTimeout(r.Context(), 25*time.Second)
	defer end()
	p.mu.Lock()
	defer p.mu.Unlock()
	if !equal(r.Header.Get("X-CSRF-Token"), p.csrf) {
		writePoll(w, 403, predictionResult{Error: "Session request rejected"})
		return
	}
	if input.Account != p.user.UserID {
		writePoll(w, 401, predictionResult{Error: "Account changed"})
		return
	}
	if code := s.broadcasterContext(ctx, p, r, input.Channel, input.Broadcaster, predictionScope, true); code != 200 {
		writePoll(w, code, predictionResult{Error: "Broadcaster identity or prediction consent unavailable"})
		return
	}
	if receipt, ok := p.predictionReceipts[input.RequestID]; ok {
		if !reflect.DeepEqual(receipt.Input, input) {
			writePoll(w, 409, predictionResult{Error: "Action identifier was already used"})
			return
		}
		writePoll(w, receipt.Status, receipt.Result)
		return
	}
	if time.Since(p.lastSend) < time.Second {
		writePoll(w, 429, predictionResult{Error: "Wait a moment before another action"})
		return
	}
	result, code := s.performPrediction(ctx, p, input)
	if p.predictionReceipts == nil {
		p.predictionReceipts = map[string]predictionReceipt{}
	}
	p.predictionReceipts[input.RequestID] = predictionReceipt{input, result, code}
	p.predictionReceiptOrder = append(p.predictionReceiptOrder, input.RequestID)
	if len(p.predictionReceiptOrder) > 32 {
		delete(p.predictionReceipts, p.predictionReceiptOrder[0])
		p.predictionReceiptOrder = p.predictionReceiptOrder[1:]
	}
	writePoll(w, code, result)
}
func validPredictionTransition(p providerPrediction, input predictionInput) bool {
	if input.Action == "LOCKED" {
		return p.Status == "ACTIVE"
	}
	if p.Status != "ACTIVE" && p.Status != "LOCKED" {
		return false
	}
	if input.Action == "CANCELED" {
		return true
	}
	if input.Action == "RESOLVED" {
		for _, o := range p.Outcomes {
			if o.ID == input.Winner {
				return true
			}
		}
	}
	return false
}
func (s *Service) performPrediction(ctx context.Context, p *session, input predictionInput) (predictionResult, int) {
	values, code := s.readPredictions(ctx, p)
	if code != 200 {
		return predictionResult{Error: "Could not verify predictions; no write was sent"}, 502
	}
	payload := map[string]any{"broadcaster_id": p.user.UserID}
	method := http.MethodPost
	if input.Action == "CREATE" {
		for _, value := range values {
			if value.Status == "ACTIVE" || value.Status == "LOCKED" {
				return predictionResult{Error: "An active or locked prediction exists; refresh before creating"}, 409
			}
		}
		outcomes := []map[string]string{}
		for _, o := range input.Outcomes {
			outcomes = append(outcomes, map[string]string{"title": o})
		}
		payload["title"] = input.Title
		payload["outcomes"] = outcomes
		payload["prediction_window"] = input.Window
	} else {
		found := false
		for _, value := range values {
			if value.ID == input.ID && validPredictionTransition(value, input) {
				found = true
			}
		}
		if !found {
			return predictionResult{Error: "Reviewed prediction state or winning outcome changed; refresh and preview again"}, 409
		}
		method = http.MethodPatch
		payload["id"] = input.ID
		payload["status"] = input.Action
		if input.Action == "RESOLVED" {
			payload["winning_outcome_id"] = input.Winner
		}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return predictionResult{Error: "Could not prepare prediction"}, 500
	}
	p.lastSend = time.Now()
	data, status, ok := s.helix(ctx, p, method, "/predictions", body)
	if ok && slices.Contains([]int{400, 401, 403, 404, 409, 429}, status) {
		return predictionResult{Error: "Twitch rejected this prediction action; check eligibility, scope or current state"}, status
	}
	uncertain := predictionResult{Uncertain: true, Error: "Prediction outcome uncertain; refresh provider state before another action. No automatic retry"}
	if !ok || status != 200 {
		return uncertain, 502
	}
	ack, err := decodePredictions(data, p.user.UserID, 1)
	if err != nil || len(ack) != 1 {
		return uncertain, 502
	}
	value := ack[0]
	if input.Action == "CREATE" {
		if value.Status != "ACTIVE" || value.Title != input.Title || value.Window != input.Window || len(value.Outcomes) != len(input.Outcomes) {
			return uncertain, 502
		}
		for i, o := range value.Outcomes {
			if o.Title != input.Outcomes[i] {
				return uncertain, 502
			}
		}
	} else if value.ID != input.ID || value.Status != input.Action || input.Action == "RESOLVED" && (value.Winner == nil || *value.Winner != input.Winner) {
		return uncertain, 502
	}
	return predictionResult{Sent: true, Prediction: &value}, 200
}
