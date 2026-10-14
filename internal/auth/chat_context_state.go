package auth

import (
	"encoding/json"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const chatMessageKind = "channel.chat.message"
const chatNoticeKind = "channel.chat.notification"

var contextUUID = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var contextTagID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)

type chatContextRow struct {
	ID      string            `json:"id"`
	EventID string            `json:"eventID"`
	UserID  string            `json:"userID"`
	Command string            `json:"command"`
	At      int64             `json:"at"`
	Tags    map[string]string `json:"tags"`
}
type chatContextSnapshot struct {
	Format        string           `json:"format"`
	Account       string           `json:"account"`
	Channel       string           `json:"channel"`
	BroadcasterID string           `json:"broadcasterID"`
	Epoch         string           `json:"epoch"`
	State         string           `json:"state"`
	Active        bool             `json:"active"`
	Detail        string           `json:"detail"`
	Rows          []chatContextRow `json:"rows"`
}

// Supplemental public metadata has no body, fragments, reply body, or private event conversion.
type chatContextState struct {
	base  *autoModState
	rows  map[string]chatContextRow
	order []string
}

func newChatContextState(base *autoModState) *chatContextState {
	return &chatContextState{base: base, rows: map[string]chatContextRow{}}
}
func (q *chatContextState) clear() { clear(q.rows); q.order = nil }
func (q *chatContextState) prune() {
	for id, row := range q.rows {
		if row.At < time.Now().Add(-15*time.Minute).UnixMilli() {
			delete(q.rows, id)
		}
	}
}
func (q *chatContextState) reserveReplaySlot() bool {
	for len(q.base.seen) >= 1000 && len(q.order) > 0 {
		delete(q.base.seen, q.order[0])
		q.order = q.order[1:]
	}
	return len(q.base.seen) < 1000
}
func (q *chatContextState) snapshot() chatContextSnapshot {
	b := q.base
	if !b.active {
		q.clear()
	}
	rows := []chatContextRow{}
	q.prune()
	for _, row := range q.rows {
		rows = append(rows, row)
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
	return chatContextSnapshot{"chatty-cat-public-context", b.account, b.channel, b.broadcaster, b.epoch, state, b.active, b.detail, rows}
}
func (q *chatContextState) observe(data []byte) bool {
	b := q.base
	if !b.active || len(data) > 64<<10 {
		return false
	}
	var frame eventSubFrame
	if json.Unmarshal(data, &frame) != nil {
		return false
	}
	meta, sub := frame.Metadata, frame.Payload.Subscription
	kind, known := b.subscriptions[sub.ID]
	at, err := time.Parse(time.RFC3339Nano, meta.At)
	if !known || kind != sub.Type || (kind != chatMessageKind && kind != chatNoticeKind) || sub.Version != "1" || sub.Condition.Broadcaster != b.broadcaster || sub.Condition.User != b.account || err != nil || at.Before(b.floor) || at.Before(time.Now().Add(-15*time.Minute)) || at.After(time.Now().Add(5*time.Minute)) || !messageIDPattern.MatchString(meta.ID) || b.seen[meta.ID] {
		return false
	}
	if meta.Type == "revocation" {
		b.invalidate("Public context read consent revoked; reconnect after granting consent")
		q.clear()
		return true
	}
	if meta.Type != "notification" || meta.Version != "1" || meta.SubscriptionType != sub.Type {
		return false
	}
	var body struct {
		Payload struct {
			Event struct {
				Broadcaster  string `json:"broadcaster_user_id"`
				UserID       string `json:"chatter_user_id"`
				ID           string `json:"message_id"`
				Type         string `json:"message_type"`
				Notice       string `json:"notice_type"`
				Reward       string `json:"channel_points_custom_reward_id"`
				SourceRoom   string `json:"source_broadcaster_user_id"`
				SourceLogin  string `json:"source_broadcaster_user_login"`
				SourceID     string `json:"source_message_id"`
				SourceBadges []struct {
					Set string `json:"set_id"`
					ID  string `json:"id"`
				} `json:"source_badges"`
				SourceOnly *bool `json:"is_source_only"`
				Streak     *struct {
					Count  int64  `json:"streak_count"`
					Points *int64 `json:"channel_points_awarded"`
				} `json:"watch_streak"`
			} `json:"event"`
		} `json:"payload"`
	}
	if json.Unmarshal(data, &body) != nil {
		return false
	}
	event := body.Payload.Event
	if event.Broadcaster != b.broadcaster || !numericID(event.UserID) || !contextUUID.MatchString(event.ID) {
		return false
	}
	tags := map[string]string{}
	command := "PRIVMSG"
	if kind == chatMessageKind {
		switch event.Type {
		case "channel_points_highlighted", "channel_points_sub_only", "user_intro", "power_ups_message_effect", "power_ups_gigantified_emote":
			tags["eventsub-message-type"] = event.Type
		}
		if contextTagID.MatchString(event.Reward) {
			tags["custom-reward-id"] = event.Reward
		}
	} else {
		command = "USERNOTICE"
		if event.Notice == "watch_streak" && event.Streak != nil && event.Streak.Count > 0 && event.Streak.Count <= 1000000 {
			tags["eventsub-streak-count"] = strconv.FormatInt(event.Streak.Count, 10)
			if event.Streak.Points != nil && *event.Streak.Points >= 0 && *event.Streak.Points <= 1000000000 {
				tags["eventsub-streak-points"] = strconv.FormatInt(*event.Streak.Points, 10)
			}
		}
	}
	if numericID(event.SourceRoom) && contextUUID.MatchString(event.SourceID) {
		tags["source-room-id"] = event.SourceRoom
		tags["source-id"] = event.SourceID
		if channelPattern.MatchString(event.SourceLogin) {
			tags["source-login"] = event.SourceLogin
		}
		if event.SourceOnly != nil {
			tags["source-only"] = "0"
			if *event.SourceOnly {
				tags["source-only"] = "1"
			}
		}
		if event.SourceBadges != nil && len(event.SourceBadges) <= 32 {
			badges := []string{}
			valid := true
			for _, badge := range event.SourceBadges {
				if !contextTagID.MatchString(badge.Set) || !contextTagID.MatchString(badge.ID) {
					valid = false
					break
				}
				badges = append(badges, badge.Set+"/"+badge.ID)
			}
			joined := strings.Join(badges, ",")
			if valid && len(joined) <= 1024 {
				tags["source-badges"] = joined
			}
		}
	}
	if len(tags) == 0 {
		return false
	}
	row := chatContextRow{event.ID, meta.ID, event.UserID, command, at.UnixMilli(), tags}
	encoded, err := json.Marshal(row)
	if err != nil || len(encoded) > 2048 {
		return false
	}
	if old, ok := q.rows[row.ID]; ok && old.At >= row.At {
		return false
	}
	if !q.reserveReplaySlot() {
		b.invalidate("Public context replay budget reached; reconnect")
		q.clear()
		return true
	}
	b.seen[meta.ID] = true
	q.order = append(q.order, meta.ID)
	q.prune()
	if len(q.rows) >= 100 && q.rows[row.ID].ID == "" {
		var oldest chatContextRow
		for _, candidate := range q.rows {
			if oldest.ID == "" || candidate.At < oldest.At || candidate.At == oldest.At && candidate.ID < oldest.ID {
				oldest = candidate
			}
		}
		delete(q.rows, oldest.ID)
	}
	q.rows[row.ID] = row
	return true
}
