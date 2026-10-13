package auth

import (
	"encoding/json"
	"errors"
	"slices"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const autoModScope = "moderator:manage:automod"

// autoModRow is private review state. It is never an IRC/public message.
type autoModRow struct {
	ID      string `json:"id"`
	EventID string `json:"eventID"`
	UserID  string `json:"userID"`
	Login   string `json:"login"`
	Text    string `json:"text"`
	Reason  string `json:"reason"`
	At      int64  `json:"at"`
	Status  string `json:"status"`
	request string
}
type autoModSnapshot struct {
	Format        string       `json:"format"`
	Account       string       `json:"account"`
	Channel       string       `json:"channel"`
	BroadcasterID string       `json:"broadcasterID"`
	Epoch         string       `json:"epoch"`
	State         string       `json:"state"`
	Active        bool         `json:"active"`
	Detail        string       `json:"detail"`
	Rows          []autoModRow `json:"rows"`
}
type autoModState struct {
	account, channel, broadcaster, epoch, detail string
	active                                       bool
	terminal                                     bool
	floor                                        time.Time
	rows                                         map[string]*autoModRow
	seen, resolved                               map[string]bool
	subscriptions                                map[string]string
}
type eventSubFrame struct {
	Metadata struct {
		ID               string `json:"message_id"`
		Type             string `json:"message_type"`
		At               string `json:"message_timestamp"`
		SubscriptionType string `json:"subscription_type"`
		Version          string `json:"subscription_version"`
	} `json:"metadata"`
	Payload struct {
		Subscription struct {
			ID        string `json:"id"`
			Type      string `json:"type"`
			Version   string `json:"version"`
			Condition struct {
				Broadcaster string `json:"broadcaster_user_id"`
				Moderator   string `json:"moderator_user_id"`
				User        string `json:"user_id"`
			} `json:"condition"`
		} `json:"subscription"`
		Event struct {
			Broadcaster string `json:"broadcaster_user_id"`
			UserID      string `json:"user_id"`
			Login       string `json:"user_login"`
			ID          string `json:"message_id"`
			Message     struct {
				Text string `json:"text"`
			} `json:"message"`
			Reason  string `json:"reason"`
			AutoMod struct {
				Category string `json:"category"`
				Level    int    `json:"level"`
			} `json:"automod"`
			Status string `json:"status"`
		} `json:"event"`
		Session struct {
			ID           string `json:"id"`
			Keepalive    int    `json:"keepalive_timeout_seconds"`
			ReconnectURL string `json:"reconnect_url"`
		} `json:"session"`
	} `json:"payload"`
}

// The owning hub serializes all state access. Replay-budget exhaustion stops the
// view rather than evicting tombstones and making resolved messages actionable.
func newAutoModState(account, channel, broadcaster string) *autoModState {
	return &autoModState{account: account, channel: channel, broadcaster: broadcaster, epoch: randomValue(), detail: "Connecting private AutoMod; earlier held messages are unavailable", floor: time.Now(), rows: map[string]*autoModRow{}, seen: map[string]bool{}, resolved: map[string]bool{}, subscriptions: map[string]string{}}
}
func (q *autoModState) invalidate(detail string) {
	q.active = false
	q.terminal = true
	q.detail = detail
	clear(q.rows)
}
func (q *autoModState) prune() {
	cutoff := time.Now().Add(-15 * time.Minute).UnixMilli()
	for id, row := range q.rows {
		if row.At < cutoff {
			delete(q.rows, id)
		}
	}
}
func (q *autoModState) snapshot() autoModSnapshot {
	q.prune()
	rows := make([]autoModRow, 0, len(q.rows))
	for _, row := range q.rows {
		value := *row
		rows = append(rows, value)
	}
	sort.Slice(rows, func(i, j int) bool {
		return rows[i].At < rows[j].At || rows[i].At == rows[j].At && rows[i].ID < rows[j].ID
	})
	state := "connecting"
	if q.active {
		state = "live"
	} else if q.terminal {
		state = "unavailable"
	}
	return autoModSnapshot{State: state, Format: "chatty-cat-private-automod", Account: q.account, Channel: q.channel, BroadcasterID: q.broadcaster, Epoch: q.epoch, Active: q.active, Detail: q.detail, Rows: rows}
}
func (q *autoModState) observe(data []byte) bool {
	if !q.active || len(data) > 64<<10 {
		return false
	}
	var v eventSubFrame
	if json.Unmarshal(data, &v) != nil {
		return false
	}
	meta, sub, event := v.Metadata, v.Payload.Subscription, v.Payload.Event
	registered, known := q.subscriptions[sub.ID]
	if meta.Type == "revocation" && known {
		q.invalidate("AutoMod permission revoked; grant consent and reconnect")
		return true
	}
	at, err := time.Parse(time.RFC3339Nano, meta.At)
	if err != nil || at.Before(q.floor) || at.Before(time.Now().Add(-15*time.Minute)) || at.After(time.Now().Add(5*time.Minute)) || !messageIDPattern.MatchString(meta.ID) || q.seen[meta.ID] || !known || registered != sub.Type || sub.Condition.Broadcaster != q.broadcaster || sub.Condition.Moderator != q.account || sub.Version != "2" {
		return false
	}
	if meta.Type == "revocation" {
		q.invalidate("AutoMod permission revoked; grant consent and reconnect")
		return true
	}
	if meta.Type != "notification" || meta.Version != "2" || meta.SubscriptionType != sub.Type || event.Broadcaster != q.broadcaster || !messageIDPattern.MatchString(event.ID) {
		return false
	}
	if len(q.seen) >= 1000 || len(q.resolved) >= 1000 {
		q.invalidate("Private replay budget reached; reconnect. Earlier held messages are unavailable")
		return true
	}
	q.seen[meta.ID] = true
	if sub.Type == "automod.message.update" {
		if !slices.Contains([]string{"approved", "denied", "expired"}, strings.ToLower(event.Status)) {
			return false
		}
		q.resolved[event.ID] = true
		delete(q.rows, event.ID)
		return true
	}
	if sub.Type != "automod.message.hold" || q.resolved[event.ID] || q.rows[event.ID] != nil {
		return false
	}
	if !numericID(event.UserID) || event.UserID[0] == '0' || !channelPattern.MatchString(event.Login) || !utf8.ValidString(event.Message.Text) || event.Message.Text == "" || utf8.RuneCountInString(event.Message.Text) > 500 {
		return false
	}
	q.prune()
	if len(q.rows) >= 100 {
		q.detail = "Private queue is full (100 rows); additional held messages are unavailable"
		return true
	}
	reason := "Provider reason unavailable"
	if event.Reason == "automod" && event.AutoMod.Category != "" && len(event.AutoMod.Category) <= 100 && event.AutoMod.Level >= 0 && event.AutoMod.Level <= 10 {
		reason = "AutoMod: " + event.AutoMod.Category
	}
	if event.Reason == "blocked_term" {
		reason = "Public blocked term"
	}
	q.rows[event.ID] = &autoModRow{ID: event.ID, EventID: meta.ID, UserID: event.UserID, Login: event.Login, Text: event.Message.Text, Reason: reason, At: at.UnixMilli(), Status: "held"}
	encoded, err := json.Marshal(q.snapshot())
	if err != nil || len(encoded) > 240<<10 {
		delete(q.rows, event.ID)
		q.detail = "Private queue byte capacity reached; additional held messages are unavailable"
	}
	return true
}
func (q *autoModState) begin(epoch, id, eventID, userID, request string) (autoModRow, error) {
	q.prune()
	row := q.rows[id]
	if !q.active || epoch != q.epoch || row == nil || row.EventID != eventID || row.UserID != userID {
		return autoModRow{}, errors.New("held message changed or is unavailable; reconnect/review before deciding")
	}
	if row.Status != "held" {
		return autoModRow{}, errors.New("a decision is pending or uncertain; wait for provider resolution")
	}
	row.Status = "pending"
	row.request = request
	return *row, nil
}
func (q *autoModState) finish(id, request, outcome string) {
	row := q.rows[id]
	if row == nil || row.request != request {
		return
	}
	switch outcome {
	case "confirmed":
		q.resolved[id] = true
		delete(q.rows, id)
	case "rejected":
		row.Status = "held"
		row.request = ""
	default:
		row.Status = "uncertain"
	}
}
