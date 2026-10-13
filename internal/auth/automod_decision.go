package auth

import (
	"context"
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"slices"
	"time"
)

type autoModInput struct {
	Account       string `json:"account"`
	Channel       string `json:"channel"`
	BroadcasterID string `json:"broadcasterID"`
	UserID        string `json:"userID"`
	MessageID     string `json:"messageID"`
	EventID       string `json:"eventID"`
	Epoch         string `json:"epoch"`
	Action        string `json:"action"`
	RequestID     string `json:"requestID"`
}
type autoModReceipt struct {
	input  autoModInput
	result sendResult
	status int
}

func (s *Service) autoModDecision(w http.ResponseWriter, r *http.Request) {
	if !s.sameHost(r) || !equal(r.Header.Get("Origin"), s.origin) {
		writeSend(w, http.StatusForbidden, sendResult{Error: "Invalid request origin"})
		return
	}
	p := s.lookup(r)
	if p == nil {
		writeSend(w, http.StatusUnauthorized, sendResult{Error: "Log in for private AutoMod decisions"})
		return
	}
	kind, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || kind != "application/json" {
		writeSend(w, http.StatusUnsupportedMediaType, sendResult{Error: "Expected a JSON decision"})
		return
	}
	var input autoModInput
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF || !channelPattern.MatchString(input.Channel) || !numericID(input.Account) || !numericID(input.BroadcasterID) || !numericID(input.UserID) || !messageIDPattern.MatchString(input.MessageID) || !messageIDPattern.MatchString(input.EventID) || !requestPattern.MatchString(input.Epoch) || !requestPattern.MatchString(input.RequestID) || !slices.Contains([]string{"ALLOW", "DENY"}, input.Action) {
		writeSend(w, http.StatusBadRequest, sendResult{Error: "Invalid private decision identifiers or action"})
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if s.lookup(r) != p || !s.check(r.Context(), p, time.Now()) || p.user.UserID != input.Account {
		writeSend(w, http.StatusUnauthorized, sendResult{Error: "Account session changed; review again"})
		return
	}
	if !equal(r.Header.Get("X-CSRF-Token"), p.csrf) {
		writeSend(w, http.StatusForbidden, sendResult{Error: "Session request rejected; reload before deciding"})
		return
	}
	if !slices.Contains(p.user.Scopes, autoModScope) {
		writeSend(w, http.StatusForbidden, sendResult{Error: "Grant moderator:manage:automod and reconnect"})
		return
	}
	if saved, ok := p.autoModReceipts[input.RequestID]; ok {
		if saved.input != input {
			writeSend(w, http.StatusConflict, sendResult{Error: "Decision identifier was already used"})
			return
		}
		writeSend(w, saved.status, saved.result)
		return
	}
	s.mu.Lock()
	h := s.autoModHubs[input.Account]
	s.mu.Unlock()
	result, status := sendResult{Error: "Held message is unavailable; connect and review the private queue"}, http.StatusConflict
	if h != nil && h.session == p && h.ctx.Err() == nil {
		h.mu.Lock()
		correct := h.state.channel == input.Channel && h.state.broadcaster == input.BroadcasterID
		h.mu.Unlock()
		if correct {
			current, known := s.resolveUser(r.Context(), p, input.Channel)
			correct = known && current == input.BroadcasterID
		}
		if correct {
			if time.Since(p.lastSend) < time.Second {
				writeSend(w, http.StatusTooManyRequests, sendResult{Error: "Wait a moment before deciding again"})
				return
			}
			h.mu.Lock()
			_, err := h.state.begin(input.Epoch, input.MessageID, input.EventID, input.UserID, input.RequestID)
			if err == nil {
				h.notifyLocked()
			}
			h.mu.Unlock()
			if err != nil {
				result.Error = err.Error()
			} else {
				p.lastSend = time.Now()
				ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
				stop := context.AfterFunc(h.ctx, cancel)
				body, err := json.Marshal(map[string]string{"user_id": p.user.UserID, "msg_id": input.MessageID, "action": input.Action})
				if err != nil {
					result, status = sendResult{Error: "Could not prepare private decision"}, http.StatusInternalServerError
				} else {
					_, code, ok := s.helix(ctx, p, http.MethodPost, "/moderation/automod/message", body)
					switch {
					case ok && code == http.StatusNoContent:
						result, status = sendResult{Sent: true, Command: true}, http.StatusOK
					case ok && slices.Contains([]int{400, 401, 403, 404, 409, 429}, code):
						result, status = sendResult{Error: "Twitch rejected the AutoMod decision; check scope/role or held-message state"}, code
					default:
						result, status = sendResult{Error: "AutoMod decision outcome is uncertain; check Twitch before another action", Uncertain: true}, http.StatusBadGateway
					}
				}
				stop()
				cancel()
				outcome := "rejected"
				if result.Sent {
					outcome = "confirmed"
				} else if result.Uncertain {
					outcome = "uncertain"
				}
				h.mu.Lock()
				h.state.finish(input.MessageID, input.RequestID, outcome)
				if status == http.StatusUnauthorized || status == http.StatusForbidden {
					h.state.invalidate("AutoMod permission unavailable; grant consent and reconnect")
				}
				h.notifyLocked()
				h.mu.Unlock()
				if status == http.StatusUnauthorized || status == http.StatusForbidden {
					h.cancel()
				}
			}
		}
	}
	if p.autoModReceipts == nil {
		p.autoModReceipts = map[string]autoModReceipt{}
	}
	p.autoModReceipts[input.RequestID] = autoModReceipt{input, result, status}
	p.autoModReceiptOrder = append(p.autoModReceiptOrder, input.RequestID)
	if len(p.autoModReceiptOrder) > 32 {
		delete(p.autoModReceipts, p.autoModReceiptOrder[0])
		p.autoModReceiptOrder = p.autoModReceiptOrder[1:]
	}
	writeSend(w, status, result)
}
