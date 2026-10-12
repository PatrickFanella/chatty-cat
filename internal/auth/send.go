package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

var channelPattern = regexp.MustCompile(`^[a-z0-9_]{1,25}$`)
var requestPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)
var messageIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

type sendInput struct {
	Channel   string `json:"channel"`
	Message   string `json:"message"`
	ReplyID   string `json:"replyID,omitempty"`
	RequestID string `json:"requestID"`
}
type sendResult struct {
	Whisper   bool   `json:"whisper,omitempty"`
	Recipient string `json:"recipient,omitempty"`
	Action    bool   `json:"action,omitempty"`
	Command   bool   `json:"command,omitempty"`
	Sent      bool   `json:"sent"`
	MessageID string `json:"messageID,omitempty"`
	Error     string `json:"error,omitempty"`
	Uncertain bool   `json:"uncertain,omitempty"`
}
type receipt struct {
	input  sendInput
	result sendResult
	status int
}

func writeSend(w http.ResponseWriter, status int, result sendResult) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(result); err != nil {
		return
	}
}
func (s *Service) send(w http.ResponseWriter, r *http.Request) {
	if !s.sameHost(r) || !equal(r.Header.Get("Origin"), s.origin) {
		writeSend(w, 403, sendResult{Error: "Invalid request origin"})
		return
	}
	p := s.lookup(r)
	if p == nil {
		writeSend(w, 401, sendResult{Error: "Log in with Twitch to send messages"})
		return
	}
	mediaType, _, mediaErr := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaErr != nil || mediaType != "application/json" {
		writeSend(w, 415, sendResult{Error: "Expected a JSON message"})
		return
	}
	var input sendInput
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF {
		writeSend(w, 400, sendResult{Error: "Invalid message request"})
		return
	}
	if !channelPattern.MatchString(input.Channel) || !requestPattern.MatchString(input.RequestID) || (input.ReplyID != "" && !messageIDPattern.MatchString(input.ReplyID)) {
		writeSend(w, 400, sendResult{Error: "Invalid channel or message identifier"})
		return
	}
	if !utf8.ValidString(input.Message) || strings.TrimSpace(input.Message) == "" || utf8.RuneCountInString(input.Message) > 500 || strings.IndexFunc(input.Message, unicode.IsControl) >= 0 {
		writeSend(w, 400, sendResult{Error: "Use 1–500 characters without line breaks or control characters"})
		return
	}
	if strings.HasPrefix(strings.TrimSpace(input.Message), "/") || strings.EqualFold(strings.Fields(input.Message)[0], ".w") {
		if _, err := parseCommand(strings.TrimSpace(input.Message)); err != nil {
			writeSend(w, 400, sendResult{Error: err.Error()})
			return
		}
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if !equal(r.Header.Get("X-CSRF-Token"), p.csrf) {
		writeSend(w, 403, sendResult{Error: "Session request rejected; reload and try again"})
		return
	}
	if !s.check(r.Context(), p, time.Now()) {
		s.cookie(w, "chatthing_session", "", -1)
		writeSend(w, 401, sendResult{Error: "Session expired; log in again"})
		return
	}
	if previous, ok := p.receipts[input.RequestID]; ok {
		if previous.input != input {
			writeSend(w, 409, sendResult{Error: "Request identifier was already used for another message"})
			return
		}
		writeSend(w, previous.status, previous.result)
		return
	}
	if time.Since(p.lastSend) < time.Second {
		w.Header().Set("Retry-After", "1")
		writeSend(w, 429, sendResult{Error: "Wait a moment before sending again"})
		return
	}
	p.lastSend = time.Now()
	result, status := s.deliver(r.Context(), p, input)
	if p.receipts == nil {
		p.receipts = make(map[string]receipt)
	}
	p.receipts[input.RequestID] = receipt{input, result, status}
	p.receiptOrder = append(p.receiptOrder, input.RequestID)
	if len(p.receiptOrder) > 32 {
		delete(p.receipts, p.receiptOrder[0])
		p.receiptOrder = p.receiptOrder[1:]
	}
	writeSend(w, status, result)
}

// helix retries only an explicit unauthorized response after one validated
// refresh. Transport errors and ambiguous send responses never trigger a retry.
// The caller holds the session lock, serializing token refresh and sends.
func (s *Service) helix(ctx context.Context, p *session, method, path string, body []byte) ([]byte, int, bool) {
	for attempt := 0; attempt < 2; attempt++ {
		req, err := http.NewRequestWithContext(ctx, method, strings.TrimSuffix(s.cfg.HelixURL, "/")+path, bytes.NewReader(body))
		if err != nil {
			return nil, 0, false
		}
		req.Header.Set("Authorization", "Bearer "+p.tokens.Access)
		req.Header.Set("Client-Id", s.cfg.ClientID)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		res, err := s.client.Do(req)
		if err != nil {
			return nil, 0, false
		}
		data, readErr := io.ReadAll(io.LimitReader(res.Body, (64<<10)+1))
		closeErr := res.Body.Close()
		if res.StatusCode == 401 && attempt == 0 {
			tok, err := s.exchange(ctx, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {p.tokens.Refresh}})
			if err == nil {
				user, _, validationErr := s.validate(ctx, tok.Access)
				if validationErr == nil && user.UserID == p.user.UserID {
					p.tokens = tok
					p.user = user
					p.validated = time.Now()
					continue
				}
			}
			p.invalid = true
			p.tokens = tokens{}
			return nil, 401, true
		}
		if res.StatusCode == 401 {
			p.invalid = true
			p.tokens = tokens{}
		}
		if readErr != nil || closeErr != nil || len(data) > 64<<10 {
			return nil, res.StatusCode, false
		}
		return data, res.StatusCode, true
	}
	return nil, 401, true
}
func (s *Service) deliver(ctx context.Context, p *session, input sendInput) (sendResult, int) {
	if strings.HasPrefix(strings.TrimSpace(input.Message), "/") {
		command, _ := parseCommand(strings.TrimSpace(input.Message))
		if command.name == "/me" {
			return s.action(ctx, p, input)
		}
		return s.command(ctx, p, input)
	}
	data, status, ok := s.helix(ctx, p, http.MethodGet, "/users?login="+url.QueryEscape(input.Channel), nil)
	if !ok {
		return sendResult{Error: "Could not look up channel; message was not sent"}, 502
	}
	if status != 200 {
		return sendFailure(status, false)
	}
	var users struct {
		Data []struct {
			ID    string `json:"id"`
			Login string `json:"login"`
		} `json:"data"`
	}
	if json.Unmarshal(data, &users) != nil || len(users.Data) != 1 || users.Data[0].ID == "" || users.Data[0].Login != input.Channel {
		return sendResult{Error: "Channel not found; message was not sent"}, 404
	}
	payload := struct {
		BroadcasterID string `json:"broadcaster_id"`
		SenderID      string `json:"sender_id"`
		Message       string `json:"message"`
		ReplyID       string `json:"reply_parent_message_id,omitempty"`
	}{users.Data[0].ID, p.user.UserID, input.Message, input.ReplyID}
	body, err := json.Marshal(payload)
	if err != nil {
		return sendResult{Error: "Could not prepare message"}, 500
	}
	data, status, ok = s.helix(ctx, p, http.MethodPost, "/chat/messages", body)
	if !ok {
		return sendResult{Error: "Delivery could not be confirmed; check chat before sending again", Uncertain: true}, 502
	}
	if status != 200 {
		return sendFailure(status, true)
	}
	var response struct {
		Data []struct {
			MessageID  string `json:"message_id"`
			Sent       bool   `json:"is_sent"`
			DropReason *struct {
				Code string `json:"code"`
			} `json:"drop_reason"`
		} `json:"data"`
	}
	if json.Unmarshal(data, &response) != nil || len(response.Data) != 1 {
		return sendResult{Error: "Delivery could not be confirmed; check chat before sending again", Uncertain: true}, 502
	}
	result := response.Data[0]
	if !result.Sent {
		return sendResult{Error: "Twitch did not send the message; check channel chat restrictions"}, 422
	}
	if !messageIDPattern.MatchString(result.MessageID) {
		return sendResult{Error: "Delivery could not be confirmed; check chat before sending again", Uncertain: true}, 502
	}
	return sendResult{Sent: true, MessageID: result.MessageID}, 200
}
func sendFailure(status int, sending bool) (sendResult, int) {
	switch status {
	case 401:
		return sendResult{Error: "Session expired; log in again"}, 401
	case 403:
		return sendResult{Error: "Twitch does not permit you to send in this channel"}, 403
	case 400, 422:
		return sendResult{Error: "Twitch rejected the message; check its text and reply target"}, 422
	case 429:
		return sendResult{Error: "Twitch rate limit reached; wait before trying again"}, 429
	default:
		if sending {
			return sendResult{Error: "Delivery could not be confirmed; check chat before sending again", Uncertain: true}, 502
		}
		return sendResult{Error: "Channel lookup unavailable; message was not sent"}, 502
	}
}
