package auth

import (
	"encoding/json"
	"slices"
	"sort"
	"time"
	"unicode/utf8"
)

const userChatReadScope = "user:read:chat"
const userHoldKind = "channel.chat.user_message_hold"
const userUpdateKind = "channel.chat.user_message_update"

type userHoldRow struct {
	ID      string `json:"id"`
	EventID string `json:"eventID"`
	Text    string `json:"text"`
	Status  string `json:"status"`
	At      int64  `json:"at"`
}
type userHoldSnapshot struct {
	Format        string        `json:"format"`
	Account       string        `json:"account"`
	Channel       string        `json:"channel"`
	BroadcasterID string        `json:"broadcasterID"`
	Epoch         string        `json:"epoch"`
	State         string        `json:"state"`
	Active        bool          `json:"active"`
	Detail        string        `json:"detail"`
	Rows          []userHoldRow `json:"rows"`
}

// User feedback has its own row type and no moderation actions or public chat conversion.
type userHoldState struct {
	base *autoModState
	rows map[string]userHoldRow
}

func newUserHoldState(base *autoModState) *userHoldState {
	return &userHoldState{base: base, rows: make(map[string]userHoldRow)}
}
func (q *userHoldState) clear() { clear(q.rows) }
func (q *userHoldState) snapshot() userHoldSnapshot {
	b := q.base
	if !b.active {
		q.clear()
	}
	rows := []userHoldRow{}
	for id, row := range q.rows {
		if row.At < time.Now().Add(-15*time.Minute).UnixMilli() {
			delete(q.rows, id)
		} else {
			rows = append(rows, row)
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		return rows[i].At < rows[j].At || rows[i].At == rows[j].At && rows[i].ID < rows[j].ID
	})
	state := "connecting"
	if b.active {
		state = "live"
	} else if b.terminal {
		state = "unavailable"
	}
	return userHoldSnapshot{Format: "chatty-cat-private-user-holds", Account: b.account, Channel: b.channel, BroadcasterID: b.broadcaster, Epoch: b.epoch, State: state, Active: b.active, Detail: b.detail, Rows: rows}
}
func (q *userHoldState) observe(data []byte) bool {
	b := q.base
	if !b.active || len(data) > 64<<10 {
		return false
	}
	var frame eventSubFrame
	if json.Unmarshal(data, &frame) != nil {
		return false
	}
	meta, sub, event := frame.Metadata, frame.Payload.Subscription, frame.Payload.Event
	kind, known := b.subscriptions[sub.ID]
	at, err := time.Parse(time.RFC3339Nano, meta.At)
	if !known || kind != sub.Type || sub.Version != "1" || sub.Condition.Broadcaster != b.broadcaster || sub.Condition.User != b.account || err != nil || at.Before(b.floor) || at.Before(time.Now().Add(-15*time.Minute)) || at.After(time.Now().Add(5*time.Minute)) || !messageIDPattern.MatchString(meta.ID) || b.seen[meta.ID] {
		return false
	}
	if meta.Type == "revocation" {
		b.invalidate("Own-message feedback consent revoked; reconnect after granting consent")
		q.clear()
		return true
	}
	if meta.Type != "notification" || meta.Version != "1" || meta.SubscriptionType != sub.Type || event.Broadcaster != b.broadcaster || event.UserID != b.account || !messageIDPattern.MatchString(event.ID) || !utf8.ValidString(event.Message.Text) || utf8.RuneCountInString(event.Message.Text) > 500 {
		return false
	}
	status := "held"
	switch kind {
	case userHoldKind:
		if event.Message.Text == "" || b.resolved[event.ID] || q.rows[event.ID].ID != "" {
			return false
		}
	case userUpdateKind:
		if !slices.Contains([]string{"approved", "denied", "invalid"}, event.Status) {
			return false
		}
		status = event.Status
	default:
		return false
	}
	if len(b.seen) >= 1000 || len(b.resolved) >= 1000 {
		b.invalidate("Private replay budget reached; reconnect. Earlier feedback is unavailable")
		q.clear()
		return true
	}
	b.seen[meta.ID] = true
	if kind == userUpdateKind {
		b.resolved[event.ID] = true
	}
	q.snapshot()
	if len(q.rows) >= 100 && q.rows[event.ID].ID == "" {
		b.detail = "Private feedback full (100 rows); additional messages unavailable"
		return true
	}
	text := event.Message.Text
	if text == "" {
		text = q.rows[event.ID].Text
	}
	q.rows[event.ID] = userHoldRow{ID: event.ID, EventID: meta.ID, Text: text, Status: status, At: at.UnixMilli()}
	encoded, err := json.Marshal(q.snapshot())
	if err != nil || len(encoded) > 240<<10 {
		delete(q.rows, event.ID)
		b.detail = "Private feedback byte limit reached; additional messages unavailable"
	}
	return true
}
