package auth

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func userHoldFixture(eventID, kind, id, status string) []byte {
	data, _ := json.Marshal(map[string]any{"metadata": map[string]string{"message_id": eventID, "message_type": "notification", "message_timestamp": time.Now().UTC().Format(time.RFC3339Nano), "subscription_type": kind, "subscription_version": "1"}, "payload": map[string]any{"subscription": map[string]any{"id": "sub-" + kind, "type": kind, "version": "1", "condition": map[string]string{"broadcaster_user_id": "123", "user_id": "42"}}, "event": map[string]any{"broadcaster_user_id": "123", "user_id": "42", "message_id": id, "status": status, "message": map[string]string{"text": "private-own-held-sentinel <script>inert</script>"}, "access_token": "never-export"}}})
	return data
}
func holdState() *userHoldState {
	base := newAutoModState("42", "one", "123")
	base.active = true
	base.subscriptions = map[string]string{"sub-" + userHoldKind: userHoldKind, "sub-" + userUpdateKind: userUpdateKind}
	return newUserHoldState(base)
}
func TestOwnUserHoldIsolationAndOutOfOrderResolution(t *testing.T) {
	q := holdState()
	hold := userHoldFixture("event-one", userHoldKind, "message-one", "")
	if !q.observe(hold) || q.observe(hold) || len(q.rows) != 1 {
		t.Fatal("hold/replay handling")
	}
	encoded, _ := json.Marshal(q.snapshot())
	if strings.Contains(string(encoded), "never-export") || strings.Contains(string(encoded), `"command"`) {
		t.Fatal("private frame escaped allowlist")
	}
	if !q.observe(userHoldFixture("event-two", userUpdateKind, "message-one", "denied")) || q.rows["message-one"].Status != "denied" {
		t.Fatal("resolution missing")
	}
	if q.observe(userHoldFixture("event-three", userHoldKind, "message-one", "")) {
		t.Fatal("late hold resurrected")
	}
	if !q.observe(userHoldFixture("event-four", userUpdateKind, "update-first", "approved")) {
		t.Fatal("update-first unavailable")
	}
	if q.observe(userHoldFixture("event-five", userHoldKind, "update-first", "")) {
		t.Fatal("update-first hold resurrected")
	}
	wrong := strings.ReplaceAll(string(userHoldFixture("wrong", userHoldKind, "other", "")), `"user_id":"42"`, `"user_id":"99"`)
	if q.observe([]byte(wrong)) {
		t.Fatal("cross-account hold accepted")
	}
	q.base.invalidate("logout")
	q.clear()
	if len(q.snapshot().Rows) != 0 {
		t.Fatal("private rows survived invalidation")
	}
}
func TestOwnUserHoldBudgetsAndRevocation(t *testing.T) {
	q := holdState()
	for i := 0; i < 1000; i++ {
		q.base.seen["seen"+strings.Repeat("x", i%20)+time.Unix(int64(i), 0).String()] = true
	}
	if !q.observe(userHoldFixture("overflow", userHoldKind, "one", "")) || q.base.active {
		t.Fatal("replay budget did not close private view")
	}
	q = holdState()
	raw := strings.Replace(string(userHoldFixture("revoke", userHoldKind, "one", "")), `"message_type":"notification"`, `"message_type":"revocation"`, 1)
	if !q.observe([]byte(raw)) || q.base.active || len(q.snapshot().Rows) != 0 {
		t.Fatal("revocation retained private rows")
	}
}
