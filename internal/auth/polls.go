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
	"unicode"
	"unicode/utf8"
)

const pollScope = "channel:manage:polls"

type pollChoice struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Votes       *int64 `json:"votes"`
	PointsVotes *int64 `json:"channel_points_votes"`
}
type providerPoll struct {
	ID            string       `json:"id"`
	Broadcaster   string       `json:"broadcaster_id"`
	Title         string       `json:"title"`
	Status        string       `json:"status"`
	Choices       []pollChoice `json:"choices"`
	Duration      int          `json:"duration"`
	PointsEnabled *bool        `json:"channel_points_voting_enabled"`
	Points        int          `json:"channel_points_per_vote"`
	Started       string       `json:"started_at"`
	Ended         *string      `json:"ended_at"`
}
type pollInput struct {
	Account       string   `json:"account"`
	Channel       string   `json:"channel"`
	Broadcaster   string   `json:"broadcasterID"`
	RequestID     string   `json:"requestID"`
	Action        string   `json:"action"`
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Choices       []string `json:"choices"`
	Duration      int      `json:"duration"`
	PointsEnabled bool     `json:"pointsEnabled"`
	Points        int      `json:"points"`
}
type pollResult struct {
	Sent      bool          `json:"sent"`
	Uncertain bool          `json:"uncertain,omitempty"`
	Error     string        `json:"error,omitempty"`
	Poll      *providerPoll `json:"poll,omitempty"`
}
type pollReceipt struct {
	Input  pollInput
	Result pollResult
	Status int
}

func pollText(s string, max int) bool {
	if s == "" || strings.TrimSpace(s) != s || !utf8.ValidString(s) || utf8.RuneCountInString(s) > max {
		return false
	}
	for _, r := range s {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}
func validPollInput(v pollInput) bool {
	if !numericID(v.Account) || !numericID(v.Broadcaster) || !channelPattern.MatchString(v.Channel) || !requestPattern.MatchString(v.RequestID) {
		return false
	}
	if v.Action == "CREATE" {
		if v.ID != "" || !pollText(v.Title, 60) || len(v.Choices) < 2 || len(v.Choices) > 5 || v.Duration < 15 || v.Duration > 1800 || v.PointsEnabled && (v.Points < 1 || v.Points > 1000000) || !v.PointsEnabled && v.Points != 0 {
			return false
		}
		seen := map[string]bool{}
		for _, choice := range v.Choices {
			key := strings.ToLower(choice)
			if !pollText(choice, 25) || seen[key] {
				return false
			}
			seen[key] = true
		}
		return true
	}
	return slices.Contains([]string{"TERMINATED", "ARCHIVED"}, v.Action) && messageIDPattern.MatchString(v.ID) && v.Title == "" && len(v.Choices) == 0 && v.Duration == 0 && !v.PointsEnabled && v.Points == 0
}
func decodePolls(data []byte, account string, max int) ([]providerPoll, error) {
	var response struct{ Data []providerPoll }
	if json.Unmarshal(data, &response) != nil || response.Data == nil || len(response.Data) > max {
		return nil, errors.New("poll response unavailable")
	}
	seen := map[string]bool{}
	for _, p := range response.Data {
		if !messageIDPattern.MatchString(p.ID) || seen[p.ID] || p.Broadcaster != account || !pollText(p.Title, 60) || !slices.Contains([]string{"ACTIVE", "COMPLETED", "TERMINATED", "ARCHIVED", "MODERATED", "INVALID"}, p.Status) || len(p.Choices) < 2 || len(p.Choices) > 5 || p.Duration < 15 || p.Duration > 1800 || p.PointsEnabled == nil || *p.PointsEnabled && (p.Points < 1 || p.Points > 1000000) || !*p.PointsEnabled && p.Points != 0 {
			return nil, errors.New("poll identity/state unavailable")
		}
		seen[p.ID] = true
		if _, err := time.Parse(time.RFC3339Nano, p.Started); err != nil {
			return nil, errors.New("poll start unavailable")
		}
		if p.Ended != nil {
			if _, err := time.Parse(time.RFC3339Nano, *p.Ended); err != nil {
				return nil, errors.New("poll end unavailable")
			}
		}
		choices := map[string]bool{}
		for _, c := range p.Choices {
			if !messageIDPattern.MatchString(c.ID) || choices[c.ID] || !pollText(c.Title, 25) || c.Votes == nil || c.PointsVotes == nil || *c.Votes < 0 || *c.Votes > 9007199254740991 || *c.PointsVotes < 0 || *c.PointsVotes > *c.Votes {
				return nil, errors.New("poll counts unavailable")
			}
			choices[c.ID] = true
		}
	}
	return response.Data, nil
}
func writePoll(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		return
	}
}
func (s *Service) readPolls(ctx context.Context, p *session) ([]providerPoll, int) {
	data, status, ok := s.helix(ctx, p, http.MethodGet, "/polls?"+url.Values{"broadcaster_id": {p.user.UserID}, "first": {"20"}}.Encode(), nil)
	if !ok || status != http.StatusOK {
		return nil, status
	}
	polls, err := decodePolls(data, p.user.UserID, 20)
	if err != nil {
		return nil, http.StatusBadGateway
	}
	return polls, http.StatusOK
}
func (s *Service) broadcasterContext(ctx context.Context, p *session, r *http.Request, channel, expected, scope string, write bool) int {
	if s.lookup(r) != p || !s.check(ctx, p, time.Now()) {
		return http.StatusUnauthorized
	}
	allowed := slices.Contains(p.user.Scopes, scope) || !write && slices.Contains(p.user.Scopes, strings.Replace(scope, "channel:manage:", "channel:read:", 1))
	if !allowed {
		return http.StatusForbidden
	}
	broadcaster, found := s.resolveUser(ctx, p, channel)
	if !found {
		return http.StatusBadGateway
	}
	if broadcaster != p.user.UserID || expected != "" && expected != broadcaster {
		return http.StatusForbidden
	}
	return http.StatusOK
}
func (s *Service) polls(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	channel := q.Get("channel")
	if !s.sameHost(r) || len(q) != 1 || len(q["channel"]) != 1 || !channelPattern.MatchString(channel) {
		writePoll(w, 400, pollResult{Error: "Choose a same-origin channel"})
		return
	}
	p := s.lookup(r)
	if p == nil {
		writePoll(w, 401, pollResult{Error: "Log in as broadcaster"})
		return
	}
	ctx, end := context.WithTimeout(r.Context(), 20*time.Second)
	defer end()
	p.mu.Lock()
	defer p.mu.Unlock()
	if code := s.broadcasterContext(ctx, p, r, channel, "", pollScope, false); code != 200 {
		writePoll(w, code, pollResult{Error: "Poll read unavailable; select your own broadcaster channel and grant poll consent"})
		return
	}
	polls, code := s.readPolls(ctx, p)
	if code != 200 {
		if code < 400 || code > 599 {
			code = 502
		}
		writePoll(w, code, pollResult{Error: "Twitch poll read unavailable; refresh after checking scope/channel"})
		return
	}
	writePoll(w, 200, map[string]any{"account": p.user.UserID, "channel": channel, "broadcasterID": p.user.UserID, "at": time.Now().UnixMilli(), "polls": polls})
}
func (s *Service) pollAction(w http.ResponseWriter, r *http.Request) {
	if !s.sameHost(r) || !equal(r.Header.Get("Origin"), s.origin) {
		writePoll(w, 403, pollResult{Error: "Invalid request origin"})
		return
	}
	p := s.lookup(r)
	if p == nil {
		writePoll(w, 401, pollResult{Error: "Log in as broadcaster"})
		return
	}
	kind, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || kind != "application/json" {
		writePoll(w, 415, pollResult{Error: "Expected JSON"})
		return
	}
	var input pollInput
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	d.DisallowUnknownFields()
	if d.Decode(&input) != nil || d.Decode(new(any)) != io.EOF || !validPollInput(input) {
		writePoll(w, 400, pollResult{Error: "Invalid poll title, choices, duration, points or identifiers"})
		return
	}
	ctx, end := context.WithTimeout(r.Context(), 25*time.Second)
	defer end()
	p.mu.Lock()
	defer p.mu.Unlock()
	if !equal(r.Header.Get("X-CSRF-Token"), p.csrf) {
		writePoll(w, 403, pollResult{Error: "Session request rejected"})
		return
	}
	if input.Account != p.user.UserID {
		writePoll(w, 401, pollResult{Error: "Account changed"})
		return
	}
	if code := s.broadcasterContext(ctx, p, r, input.Channel, input.Broadcaster, pollScope, true); code != 200 {
		writePoll(w, code, pollResult{Error: "Broadcaster identity or poll consent unavailable"})
		return
	}
	if receipt, ok := p.pollReceipts[input.RequestID]; ok {
		if !reflect.DeepEqual(receipt.Input, input) {
			writePoll(w, 409, pollResult{Error: "Action identifier was already used"})
			return
		}
		writePoll(w, receipt.Status, receipt.Result)
		return
	}
	if time.Since(p.lastSend) < time.Second {
		writePoll(w, 429, pollResult{Error: "Wait a moment before another action"})
		return
	}
	result, code := s.performPoll(ctx, p, input)
	if p.pollReceipts == nil {
		p.pollReceipts = map[string]pollReceipt{}
	}
	p.pollReceipts[input.RequestID] = pollReceipt{input, result, code}
	p.pollReceiptOrder = append(p.pollReceiptOrder, input.RequestID)
	if len(p.pollReceiptOrder) > 32 {
		delete(p.pollReceipts, p.pollReceiptOrder[0])
		p.pollReceiptOrder = p.pollReceiptOrder[1:]
	}
	writePoll(w, code, result)
}
func (s *Service) performPoll(ctx context.Context, p *session, input pollInput) (pollResult, int) {
	polls, code := s.readPolls(ctx, p)
	if code != 200 {
		return pollResult{Error: "Could not verify current polls; no write was sent"}, http.StatusBadGateway
	}
	active := false
	for _, poll := range polls {
		if poll.Status == "ACTIVE" {
			active = true
		}
	}
	if input.Action == "CREATE" && active {
		return pollResult{Error: "An active poll already exists; refresh before creating"}, http.StatusConflict
	}
	payload := map[string]any{"broadcaster_id": p.user.UserID}
	method := http.MethodPost
	if input.Action == "CREATE" {
		choices := []map[string]string{}
		for _, choice := range input.Choices {
			choices = append(choices, map[string]string{"title": choice})
		}
		payload["title"] = input.Title
		payload["choices"] = choices
		payload["duration"] = input.Duration
		payload["channel_points_voting_enabled"] = input.PointsEnabled
		if input.PointsEnabled {
			payload["channel_points_per_vote"] = input.Points
		}
	} else {
		found := false
		for _, poll := range polls {
			if poll.ID == input.ID && poll.Status == "ACTIVE" {
				found = true
			}
		}
		if !found {
			return pollResult{Error: "Reviewed active poll changed; refresh and preview again"}, http.StatusConflict
		}
		method = http.MethodPatch
		payload["id"] = input.ID
		payload["status"] = input.Action
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return pollResult{Error: "Could not prepare poll"}, 500
	}
	p.lastSend = time.Now()
	data, status, ok := s.helix(ctx, p, method, "/polls", body)
	if ok && slices.Contains([]int{400, 401, 403, 404, 409, 429}, status) {
		return pollResult{Error: "Twitch rejected this poll action; check eligibility, scope or current state"}, status
	}
	uncertain := pollResult{Uncertain: true, Error: "Poll action outcome uncertain; refresh Twitch state before another action. No automatic retry"}
	if !ok || status != 200 {
		return uncertain, 502
	}
	values, err := decodePolls(data, p.user.UserID, 1)
	if err != nil || len(values) != 1 {
		return uncertain, 502
	}
	value := values[0]
	if input.Action == "CREATE" {
		if value.Status != "ACTIVE" || value.Title != input.Title || value.Duration != input.Duration || *value.PointsEnabled != input.PointsEnabled || value.Points != input.Points || len(value.Choices) != len(input.Choices) {
			return uncertain, 502
		}
		for i, c := range value.Choices {
			if c.Title != input.Choices[i] {
				return uncertain, 502
			}
		}
	} else if value.ID != input.ID || value.Status != input.Action {
		return uncertain, 502
	}
	return pollResult{Sent: true, Poll: &value}, 200
}
