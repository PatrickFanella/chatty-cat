package auth

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

func automodFixture(id, kind, msg, status string) []byte {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	raw := map[string]any{"metadata": map[string]any{"message_id": id, "message_type": "notification", "message_timestamp": now, "subscription_type": kind, "subscription_version": "2"}, "payload": map[string]any{"subscription": map[string]any{"id": "subscription-" + kind, "type": kind, "version": "2", "condition": map[string]string{"broadcaster_user_id": "123", "moderator_user_id": "42"}}, "event": map[string]any{"broadcaster_user_id": "123", "user_id": "456", "user_login": "alice", "message_id": msg, "message": map[string]string{"text": "private-held-sentinel <script>inert</script>"}, "reason": "automod", "automod": map[string]any{"category": "aggression", "level": 2}, "status": status, "access_token": "never-export"}}}
	data, err := json.Marshal(raw)
	if err != nil {
		panic(err)
	}
	return data
}
func TestAutoModStateFiltersDeduplicatesAndPreventsResurrection(t *testing.T) {
	q := newAutoModState("42", "one", "123")
	q.active = true
	q.subscriptions = map[string]string{"subscription-automod.message.hold": "automod.message.hold", "subscription-automod.message.update": "automod.message.update"}
	hold := automodFixture("event-one", "automod.message.hold", "message-one", "")
	if !q.observe(hold) || q.observe(hold) || len(q.rows) != 1 {
		t.Fatal(q.rows)
	}
	b, err := json.Marshal(q.snapshot())
	if err != nil || string(b) == "" {
		t.Fatal(err)
	}
	if containsSecret(string(b)) {
		t.Fatal(string(b))
	}
	if !q.observe(automodFixture("event-two", "automod.message.update", "message-one", "approved")) || len(q.rows) != 0 {
		t.Fatal(q.rows)
	}
	if q.observe(automodFixture("event-three", "automod.message.hold", "message-one", "")) || len(q.rows) != 0 {
		t.Fatal("resolved message resurrected")
	}
	wrong := automodFixture("event-wrong", "automod.message.hold", "other-message", "")
	var v map[string]any
	_ = json.Unmarshal(wrong, &v)
	v["payload"].(map[string]any)["event"].(map[string]any)["broadcaster_user_id"] = "999"
	wrong, _ = json.Marshal(v)
	if q.observe(wrong) || len(q.rows) != 0 {
		t.Fatal("cross-channel event accepted")
	}
}
func containsSecret(s string) bool { return len(s) > 0 && strings.Contains(s, "never-export") }
func TestAutoModStateSerializesDecisionsAndRejectsStaleEpochs(t *testing.T) {
	q := newAutoModState("42", "one", "123")
	q.active = true
	q.subscriptions = map[string]string{"subscription-automod.message.hold": "automod.message.hold"}
	q.observe(automodFixture("event-one", "automod.message.hold", "message-one", ""))
	row := q.rows["message-one"]
	if _, err := q.begin("wrong", row.ID, row.EventID, "456", "request-one"); err == nil {
		t.Fatal("stale epoch")
	}
	if _, err := q.begin(q.epoch, row.ID, row.EventID, "456", "request-one"); err != nil {
		t.Fatal(err)
	}
	if _, err := q.begin(q.epoch, row.ID, row.EventID, "456", "request-two"); err == nil {
		t.Fatal("concurrent decision admitted")
	}
	q.finish(row.ID, "request-one", "uncertain")
	if _, err := q.begin(q.epoch, row.ID, row.EventID, "456", "request-three"); err == nil {
		t.Fatal("uncertain decision retried")
	}
	q.invalidate("revoked")
	if len(q.rows) != 0 || q.active {
		t.Fatal("revocation retained actionable rows")
	}
}

func TestAutoModStateCapacityAndExpiry(t *testing.T) {
	q := newAutoModState("42", "one", "123")
	q.active = true
	q.subscriptions["subscription-automod.message.hold"] = "automod.message.hold"
	for i := 0; i < 110; i++ {
		q.observe(automodFixture(fmt.Sprintf("event-%d", i), "automod.message.hold", fmt.Sprintf("message-%d", i), ""))
	}
	if len(q.rows) != 100 || !strings.Contains(q.detail, "full") {
		t.Fatal("row capacity", len(q.rows), q.detail)
	}
	q.rows["message-0"].At = time.Now().Add(-16 * time.Minute).UnixMilli()
	if _, err := q.begin(q.epoch, "message-0", "event-0", "456", "request-0"); err == nil {
		t.Fatal("expired row actionable")
	}
	for i := len(q.seen); i <= 1000; i++ {
		q.observe(automodFixture(fmt.Sprintf("event-%d", i), "automod.message.hold", fmt.Sprintf("message-%d", i), ""))
	}
	if q.active || len(q.rows) != 0 || q.snapshot().State != "unavailable" {
		t.Fatal("replay budget did not fail closed")
	}
}
func TestAutoModStateByteCapacity(t *testing.T) {
	q := newAutoModState("42", "one", "123")
	q.active = true
	q.subscriptions["subscription-automod.message.hold"] = "automod.message.hold"
	for i := 0; i < 100; i++ {
		var value map[string]any
		if err := json.Unmarshal(automodFixture(fmt.Sprintf("event-%d", i), "automod.message.hold", fmt.Sprintf("message-%d", i), ""), &value); err != nil {
			t.Fatal(err)
		}
		value["payload"].(map[string]any)["event"].(map[string]any)["message"].(map[string]any)["text"] = strings.Repeat("<", 500)
		data, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		q.observe(data)
	}
	data, err := json.Marshal(q.snapshot())
	if err != nil {
		t.Fatal(err)
	}
	if len(data) > 256<<10 || len(q.rows) >= 100 || !strings.Contains(q.detail, "byte capacity") {
		t.Fatal("byte capacity", len(data), len(q.rows), q.detail)
	}
}
