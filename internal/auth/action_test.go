package auth

import (
	"context"
	"testing"

	"git.subcult.tv/subculture-collective/chatty-cat/internal/irc"
)

func TestActionAcknowledgements(t *testing.T) {
	peer := &personalPeer{joined: map[string]bool{}, done: make(chan struct{})}
	pending := &actionPending{channel: "hasanabi", result: make(chan sendResult, 1)}
	peer.pending = pending
	peer.observe(irc.Message{Command: "USERSTATE", Channel: "other", ID: "other-id"})
	peer.observe(irc.Message{Command: "USERSTATE", Channel: "hasanabi"})
	peer.observe(irc.Message{Command: "NOTICE", Channel: "hasanabi", Tags: map[string]string{"msg-id": "slow_on"}})
	select {
	case <-pending.result:
		t.Fatal("unrelated state acknowledged an action")
	default:
	}
	peer.observe(irc.Message{Command: "NOTICE", Channel: "hasanabi", Tags: map[string]string{"msg-id": "msg_timedout"}})
	if result := <-pending.result; result.Sent || result.Error == "" {
		t.Fatal(result)
	}
	peer.observe(irc.Message{Command: "USERSTATE", Channel: "hasanabi", ID: "accepted"})
	if result := <-pending.result; !result.Sent || !result.Action || result.MessageID != "accepted" {
		t.Fatal(result)
	}
	peer.pending = nil
	peer.observe(irc.Message{Command: "USERSTATE", Channel: "hasanabi", ID: "late"})
}
func TestActionRequiresScopedActiveChannel(t *testing.T) {
	f := setup(t)
	p := &session{}
	if _, status := f.service.action(context.Background(), p, sendInput{Channel: "hasanabi", Message: "/me hi"}); status != 403 {
		t.Fatal(status)
	}
	p.user.Scopes = []string{"chat:edit"}
	p.personalPeers = []*personalPeer{{joined: map[string]bool{"other": true}, done: make(chan struct{})}}
	if _, status := f.service.action(context.Background(), p, sendInput{Channel: "hasanabi", Message: "/me hi"}); status != 409 {
		t.Fatal(status)
	}
	p.personalPeers[0].joined["hasanabi"] = true
	close(p.personalPeers[0].done)
	if _, status := f.service.action(context.Background(), p, sendInput{Channel: "hasanabi", Message: "/me hi"}); status != 409 {
		t.Fatal(status)
	}
	if _, err := parseCommand("/me"); err == nil {
		t.Fatal("empty action allowed")
	}
}
