package auth

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func suspiciousFixture(id, kind, status string) []byte {
	data, _ := json.Marshal(map[string]any{"metadata": map[string]string{"message_id": id, "message_type": "notification", "message_timestamp": time.Now().UTC().Format(time.RFC3339Nano), "subscription_type": kind, "subscription_version": "1"}, "payload": map[string]any{"subscription": map[string]any{"id": "sub-" + kind, "type": kind, "version": "1", "condition": map[string]string{"broadcaster_user_id": "123", "moderator_user_id": "42"}}, "event": map[string]any{"broadcaster_user_id": "123", "user_id": "456", "user_login": "alice", "low_trust_status": status, "types": []string{"ban_evader", "unknown"}, "shared_ban_channel_ids": []string{"99", "bad"}, "ban_evasion_evaluation": "likely", "message": map[string]string{"message_id": "message-one", "text": "private-suspicious <script>inert</script>"}, "access_token": "never-export"}}})
	return data
}
func TestSuspiciousStateOnlyObservedSignalsAndRevocation(t *testing.T) {
	c := newAutoModState("42", "one", "123")
	c.active = true
	c.subscriptions = map[string]string{"sub-channel.suspicious_user.message": "channel.suspicious_user.message", "sub-channel.suspicious_user.update": "channel.suspicious_user.update"}
	q := newSuspiciousState(c)
	data := suspiciousFixture("event-one", "channel.suspicious_user.message", "restricted")
	if !q.observe(data) || q.observe(data) {
		t.Fatal("dedup")
	}
	row := q.snapshot().Rows[0]
	if row.Evaluation != "likely" || len(row.Types) != 1 || len(row.Shared) != 1 {
		t.Fatal(row)
	}
	encoded, _ := json.Marshal(q.snapshot())
	if strings.Contains(string(encoded), "never-export") {
		t.Fatal("private extra leaked")
	}
	if !q.observe(suspiciousFixture("event-two", "channel.suspicious_user.update", "no_treatment")) {
		t.Fatal("update")
	}
	row = q.snapshot().Rows[0]
	if row.Status != "no_treatment" || row.Text != "" || row.Evaluation != "Unavailable" {
		t.Fatal("inferred stale message signals", row)
	}
	if q.observe(suspiciousFixture("event-three", "channel.suspicious_user.message", "invented")) {
		t.Fatal("unknown status accepted")
	}
	revoke := []byte(`{"metadata":{"message_type":"revocation"},"payload":{"subscription":{"id":"sub-channel.suspicious_user.update"}}}`)
	if !q.observe(revoke) || len(q.snapshot().Rows) != 0 || c.active {
		t.Fatal("revocation")
	}
}
