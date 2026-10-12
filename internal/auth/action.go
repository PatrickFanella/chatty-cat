package auth

import (
	"context"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"git.subcult.tv/subculture-collective/chatty-cat/internal/irc"
	"github.com/coder/websocket"
)

type actionPending struct {
	channel string
	result  chan sendResult
}
type personalPeer struct {
	mu      sync.Mutex
	conn    *websocket.Conn
	joined  map[string]bool
	pending *actionPending
	done    chan struct{}
}

func (p *personalPeer) observe(message irc.Message) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if message.Command == "USERSTATE" {
		p.joined[message.Channel] = true
	}
	if p.pending == nil || p.pending.channel != message.Channel {
		return
	}
	var result sendResult
	if message.Command == "USERSTATE" && messageIDPattern.MatchString(message.ID) {
		result = sendResult{Sent: true, MessageID: message.ID, Action: true}
	} else if message.Command == "NOTICE" && strings.HasPrefix(message.Tags["msg-id"], "msg_") {
		result = sendResult{Error: "Twitch rejected the action; check channel chat restrictions"}
	} else {
		return
	}
	select {
	case p.pending.result <- result:
	default:
	}
}

// The session lock serializes sends. The peer reader uses its own lock so an
// acknowledgement can arrive while the HTTP handler waits for it.
func (s *Service) action(ctx context.Context, p *session, input sendInput) (sendResult, int) {
	if !slices.Contains(p.user.Scopes, "chat:edit") {
		return sendResult{Error: "Log in again to enable /me actions"}, http.StatusForbidden
	}
	var peer *personalPeer
	for _, candidate := range p.personalPeers {
		candidate.mu.Lock()
		joined := candidate.joined[input.Channel]
		candidate.mu.Unlock()
		if joined {
			select {
			case <-candidate.done:
				continue
			default:
				peer = candidate
			}
			break
		}
	}
	if peer == nil {
		return sendResult{Error: "Wait for personal chat state to connect before sending /me"}, http.StatusConflict
	}
	pending := &actionPending{channel: input.Channel, result: make(chan sendResult, 1)}
	peer.mu.Lock()
	peer.pending = pending
	peer.mu.Unlock()
	defer func() {
		peer.mu.Lock()
		if peer.pending == pending {
			peer.pending = nil
		}
		peer.mu.Unlock()
	}()
	command, _ := parseCommand(strings.TrimSpace(input.Message))
	writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	err := peer.conn.Write(writeCtx, websocket.MessageText, []byte("PRIVMSG #"+input.Channel+" :"+"/me "+command.text+"\r\n"))
	cancel()
	if err != nil {
		return sendResult{Error: "Action could not be confirmed; check chat before retrying", Uncertain: true}, http.StatusBadGateway
	}
	timer := time.NewTimer(10 * time.Second)
	defer timer.Stop()
	select {
	case result := <-pending.result:
		if result.Sent {
			return result, http.StatusOK
		}
		return result, http.StatusUnprocessableEntity
	case <-peer.done:
	case <-ctx.Done():
	case <-timer.C:
	}
	return sendResult{Error: "Action could not be confirmed; check chat before retrying", Uncertain: true}, http.StatusBadGateway
}
