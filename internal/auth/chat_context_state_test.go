package auth

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

const contextMessageID = "11111111-1111-4111-8111-111111111111"

func contextFixture(eventID, kind string, event map[string]any) []byte {
	data, _ := json.Marshal(map[string]any{"metadata": map[string]string{"message_id": eventID, "message_type": "notification", "message_timestamp": time.Now().UTC().Format(time.RFC3339Nano), "subscription_type": kind, "subscription_version": "1"}, "payload": map[string]any{"subscription": map[string]any{"id": map[string]string{chatMessageKind: "sub-message", chatNoticeKind: "sub-notice"}[kind], "type": kind, "version": "1", "condition": map[string]string{"broadcaster_user_id": "123", "user_id": "42"}}, "event": event}})
	return data
}
func publicContextEvent() map[string]any {
	return map[string]any{"broadcaster_user_id": "123", "chatter_user_id": "99", "message_id": contextMessageID, "message_type": "power_ups_message_effect", "source_broadcaster_user_id": "456", "source_broadcaster_user_login": "origin", "source_message_id": "22222222-2222-4222-8222-222222222222", "source_badges": []any{map[string]string{"set_id": "subscriber", "id": "3", "info": "private-ignored"}}, "is_source_only": false, "channel_points_custom_reward_id": "reward-one", "message": map[string]string{"text": "never-forward-message-text"}, "access_token": "never-export"}
}
func contextState() *chatContextState {
	base := newAutoModState("42", "one", "123")
	base.active = true
	base.subscriptions = map[string]string{"sub-message": chatMessageKind, "sub-notice": chatNoticeKind}
	return newChatContextState(base)
}
func TestPublicContextProjectionAndPrivateKindRejection(t *testing.T) {
	q := contextState()
	frame := contextFixture("event-one", chatMessageKind, publicContextEvent())
	if !q.observe(frame) || q.observe(frame) {
		t.Fatal("context replay")
	}
	row := q.snapshot().Rows[0]
	if row.Command != "PRIVMSG" || row.Tags["source-room-id"] != "456" || row.Tags["source-badges"] != "subscriber/3" || row.Tags["source-only"] != "0" || row.Tags["eventsub-message-type"] != "power_ups_message_effect" {
		t.Fatal("context fields lost", row)
	}
	encoded, _ := json.Marshal(q.snapshot())
	for _, private := range []string{"never-forward", "never-export", "private-ignored", "\"text\""} {
		if strings.Contains(string(encoded), private) {
			t.Fatal("non-context data escaped", private)
		}
	}
	if q.observe(userHoldFixture("private-hold", userHoldKind, contextMessageID, "")) {
		t.Fatal("private held event accepted")
	}
	bad := strings.ReplaceAll(string(frame), `"user_id":"42"`, `"user_id":"43"`)
	if q.observe([]byte(bad)) {
		t.Fatal("wrong actor accepted")
	}
}
func TestPublicWatchStreakAndContextBudgets(t *testing.T) {
	q := contextState()
	event := publicContextEvent()
	delete(event, "message_type")
	event["notice_type"] = "watch_streak"
	event["watch_streak"] = map[string]int{"streak_count": 10, "channel_points_awarded": 0}
	if !q.observe(contextFixture("notice-one", chatNoticeKind, event)) {
		t.Fatal("streak missing")
	}
	row := q.snapshot().Rows[0]
	if row.Command != "USERNOTICE" || row.Tags["eventsub-streak-count"] != "10" || row.Tags["eventsub-streak-points"] != "0" {
		t.Fatal("exact streak fields missing")
	}
	for i := 0; i < 1100; i++ {
		event := publicContextEvent()
		event["message_id"] = fmt.Sprintf("%08x-1111-4111-8111-111111111111", i)
		q.observe(contextFixture(fmt.Sprint("event-", i), chatMessageKind, event))
	}
	if len(q.rows) > 100 || len(q.base.seen) > 1000 || !q.base.active {
		t.Fatal("public rolling bounds")
	}
	if !q.reserveReplaySlot() || len(q.base.seen) >= 1000 {
		t.Fatal("handoff replay slot unavailable")
	}
	q.base.invalidate("logout")
	if len(q.snapshot().Rows) != 0 {
		t.Fatal("context survived invalidation")
	}
}
