package auth

import (
	"encoding/json"
	"slices"
	"sort"
	"time"
	"unicode/utf8"
)

const suspiciousReadScope = "moderator:read:suspicious_users"
const suspiciousManageScope = "moderator:manage:suspicious_users"

type suspiciousRow struct {
	observed   time.Time
	kind       string
	UserID     string   `json:"userID"`
	Login      string   `json:"login"`
	Status     string   `json:"status"`
	Text       string   `json:"text"`
	MessageID  string   `json:"messageID"`
	EventID    string   `json:"eventID"`
	At         int64    `json:"at"`
	Types      []string `json:"types"`
	Shared     []string `json:"shared"`
	Evaluation string   `json:"evaluation"`
}
type suspiciousSnapshot struct {
	Format        string          `json:"format"`
	Account       string          `json:"account"`
	Channel       string          `json:"channel"`
	BroadcasterID string          `json:"broadcasterID"`
	Epoch         string          `json:"epoch"`
	State         string          `json:"state"`
	Active        bool            `json:"active"`
	Detail        string          `json:"detail"`
	Rows          []suspiciousRow `json:"rows"`
}
type suspiciousState struct {
	common *autoModState
	rows   map[string]suspiciousRow
}

func newSuspiciousState(common *autoModState) *suspiciousState {
	return &suspiciousState{common: common, rows: map[string]suspiciousRow{}}
}
func (q *suspiciousState) snapshot() suspiciousSnapshot {
	for id, row := range q.rows {
		if !q.common.active || row.At < time.Now().Add(-15*time.Minute).UnixMilli() {
			delete(q.rows, id)
		}
	}
	rows := make([]suspiciousRow, 0, len(q.rows))
	for _, row := range q.rows {
		rows = append(rows, row)
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].UserID < rows[j].UserID })
	state := q.common.snapshot()
	return suspiciousSnapshot{"chatty-cat-private-suspicious", state.Account, state.Channel, state.BroadcasterID, state.Epoch, state.State, state.Active, state.Detail, rows}
}
func (q *suspiciousState) observe(data []byte) bool {
	c := q.common
	if !c.active || len(data) > 64<<10 {
		return false
	}
	var frame eventSubFrame
	if json.Unmarshal(data, &frame) != nil {
		return false
	}
	meta, sub := frame.Metadata, frame.Payload.Subscription
	kind, known := c.subscriptions[sub.ID]
	if meta.Type == "revocation" && known {
		c.invalidate("Suspicious-user permission revoked; grant consent and reconnect")
		clear(q.rows)
		return true
	}
	at, err := time.Parse(time.RFC3339Nano, meta.At)
	if err != nil || at.Before(c.floor) || at.Before(time.Now().Add(-15*time.Minute)) || at.After(time.Now().Add(5*time.Minute)) || !messageIDPattern.MatchString(meta.ID) || c.seen[meta.ID] || !known || kind != sub.Type || sub.Version != "1" || meta.Version != "1" || meta.Type != "notification" || meta.SubscriptionType != kind || sub.Condition.Broadcaster != c.broadcaster || sub.Condition.Moderator != c.account {
		return false
	}
	var payload struct {
		Payload struct {
			Event struct {
				Broadcaster string   `json:"broadcaster_user_id"`
				UserID      string   `json:"user_id"`
				Login       string   `json:"user_login"`
				Status      string   `json:"low_trust_status"`
				Types       []string `json:"types"`
				Shared      []string `json:"shared_ban_channel_ids"`
				Evaluation  string   `json:"ban_evasion_evaluation"`
				Message     struct {
					ID   string `json:"message_id"`
					Text string `json:"text"`
				} `json:"message"`
			} `json:"event"`
		} `json:"payload"`
	}
	if json.Unmarshal(data, &payload) != nil {
		return false
	}
	e := payload.Payload.Event
	if e.Broadcaster != c.broadcaster || !numericID(e.UserID) || e.UserID[0] == '0' || !channelPattern.MatchString(e.Login) || !slices.Contains([]string{"no_treatment", "active_monitoring", "restricted"}, e.Status) {
		return false
	}
	if len(c.seen) >= 1000 {
		c.invalidate("Private replay budget reached; reconnect; earlier signals unavailable")
		clear(q.rows)
		return true
	}
	c.seen[meta.ID] = true
	old, exists := q.rows[e.UserID]
	// Delivery can reorder update and message events; an older event cannot undo a newer treatment.
	if exists && old.observed.After(at) || old.observed.Equal(at) && old.kind == "channel.suspicious_user.update" && kind == "channel.suspicious_user.message" {
		return false
	}
	row := suspiciousRow{observed: at, kind: kind, UserID: e.UserID, Login: e.Login, Status: e.Status, EventID: meta.ID, At: at.UnixMilli(), Types: []string{}, Shared: []string{}, Evaluation: "Unavailable"}
	if kind == "channel.suspicious_user.message" {
		if !messageIDPattern.MatchString(e.Message.ID) || e.Message.Text == "" || !utf8.ValidString(e.Message.Text) || utf8.RuneCountInString(e.Message.Text) > 500 || len(e.Types) > 10 || len(e.Shared) > 100 {
			return false
		}
		row.Text = e.Message.Text
		row.MessageID = e.Message.ID
		for _, v := range e.Types {
			if slices.Contains([]string{"manually_added", "ban_evader", "banned_in_shared_channel", "detected_sus_chatter"}, v) && !slices.Contains(row.Types, v) {
				row.Types = append(row.Types, v)
			}
		}
		for _, v := range e.Shared {
			if numericID(v) && v[0] != '0' && !slices.Contains(row.Shared, v) {
				row.Shared = append(row.Shared, v)
			}
		}
		if slices.Contains([]string{"unknown", "possible", "likely"}, e.Evaluation) {
			row.Evaluation = e.Evaluation
		}
	} else if kind != "channel.suspicious_user.update" {
		return false
	}
	_ = q.snapshot()
	if !exists && len(q.rows) >= 100 {
		c.detail = "Private signal capacity reached (100 users); additional signals unavailable"
		return true
	}
	q.rows[e.UserID] = row
	encoded, err := json.Marshal(q.snapshot())
	if err != nil || len(encoded) > 240<<10 {
		if exists {
			q.rows[e.UserID] = old
		} else {
			delete(q.rows, e.UserID)
		}
		c.detail = "Private signal byte capacity reached; additional signals unavailable"
	}
	return true
}
