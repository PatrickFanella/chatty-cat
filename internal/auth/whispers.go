package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"slices"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/PatrickFanella/hasanabi.neocities.org/rebuild/internal/irc"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type whisperMember struct {
	events  chan personalEvent
	ctx     context.Context
	cancel  context.CancelFunc
	request *http.Request
	session *session
}
type whisperHub struct {
	mu      sync.Mutex
	service *Service
	user    string
	ctx     context.Context
	cancel  context.CancelFunc
	members map[*whisperMember]bool
	status  personalEvent
	seen    map[string]bool
	order   []string
}

type eventSubEnvelope struct {
	Metadata struct {
		Type      string `json:"message_type"`
		Timestamp string `json:"message_timestamp"`
	} `json:"metadata"`
	Payload struct {
		Session struct {
			ID        string `json:"id"`
			Keepalive int    `json:"keepalive_timeout_seconds"`
			Reconnect string `json:"reconnect_url"`
		} `json:"session"`
		Subscription struct {
			Type      string `json:"type"`
			Version   string `json:"version"`
			Condition struct {
				User string `json:"user_id"`
			} `json:"condition"`
		} `json:"subscription"`
		Event struct {
			FromID    string `json:"from_user_id"`
			FromLogin string `json:"from_user_login"`
			FromName  string `json:"from_user_name"`
			ToID      string `json:"to_user_id"`
			ID        string `json:"whisper_id"`
			Whisper   struct {
				Text string `json:"text"`
			} `json:"whisper"`
		} `json:"event"`
	} `json:"payload"`
}

func whisperMessage(e eventSubEnvelope, user string) (irc.Message, bool) {
	event := e.Payload.Event
	sub := e.Payload.Subscription
	timestamp, err := time.Parse(time.RFC3339Nano, e.Metadata.Timestamp)
	if e.Metadata.Type != "notification" || sub.Type != "user.whisper.message" || sub.Version != "1" || sub.Condition.User != user || event.ToID != user || event.FromID == "" || !channelPattern.MatchString(event.FromLogin) || !messageIDPattern.MatchString(event.ID) || err != nil || timestamp.UnixMilli() < 0 || !utf8.ValidString(event.Whisper.Text) || utf8.RuneCountInString(event.Whisper.Text) > 10000 || event.Whisper.Text == "" {
		return irc.Message{}, false
	}
	return irc.Message{ID: event.ID, Command: "WHISPER", Channel: "", Login: event.FromLogin, Text: event.Whisper.Text, Timestamp: timestamp.UnixMilli(), Tags: map[string]string{"display-name": event.FromName, "user-id": event.FromID}}, true
}
func (s *Service) whisperChat(w http.ResponseWriter, r *http.Request) {
	if !s.sameHost(r) || !equal(r.Header.Get("Origin"), s.origin) {
		http.Error(w, "Invalid whisper origin", http.StatusForbidden)
		return
	}
	p := s.lookup(r)
	if p == nil {
		http.Error(w, "Log in for whispers", http.StatusUnauthorized)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	p.mu.Lock()
	valid := s.check(ctx, p, time.Now())
	enabled := slices.Contains(p.user.Scopes, "user:manage:whispers")
	user := p.user.UserID
	p.mu.Unlock()
	cancel()
	if !valid {
		http.Error(w, "Session expired", http.StatusUnauthorized)
		return
	}
	if !enabled {
		http.Error(w, "Log in again to enable whispers", http.StatusForbidden)
		return
	}
	s.mu.Lock()
	if s.closing {
		s.mu.Unlock()
		http.Error(w, "Service shutting down", http.StatusServiceUnavailable)
		return
	}
	s.wg.Add(1)
	s.mu.Unlock()
	defer s.wg.Done()
	select {
	case s.whisperSlots <- struct{}{}:
		defer func() { <-s.whisperSlots }()
	default:
		http.Error(w, "Whisper capacity reached", http.StatusServiceUnavailable)
		return
	}
	browser, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer func() { _ = browser.CloseNow() }()
	memberCtx, stop := context.WithCancel(s.ctx)
	defer stop()
	memberCtx = browser.CloseRead(memberCtx)
	member := &whisperMember{events: make(chan personalEvent, 32), ctx: memberCtx, cancel: stop, request: r, session: p}
	s.mu.Lock()
	hub := s.whispers[user]
	if hub == nil || hub.ctx.Err() != nil {
		hubCtx, hubCancel := context.WithCancel(s.ctx)
		hub = &whisperHub{service: s, user: user, ctx: hubCtx, cancel: hubCancel, members: make(map[*whisperMember]bool), seen: make(map[string]bool), status: personalEvent{Type: "status", State: "connecting", Detail: "Connecting incoming whispers"}}
		s.whispers[user] = hub
		s.wg.Add(1)
		go func() { defer s.wg.Done(); hub.run() }()
	}
	hub.mu.Lock()
	hub.members[member] = true
	member.events <- hub.status
	hub.mu.Unlock()
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		hub.mu.Lock()
		delete(hub.members, member)
		empty := len(hub.members) == 0
		hub.mu.Unlock()
		if empty {
			hub.cancel()
			if s.whispers[user] == hub {
				delete(s.whispers, user)
			}
		}
		s.mu.Unlock()
	}()
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-memberCtx.Done():
			return
		case <-ticker.C:
			if !hub.active(member) {
				return
			}
		case event := <-member.events:
			if !hub.active(member) {
				return
			}
			writeCtx, end := context.WithTimeout(memberCtx, 5*time.Second)
			err := wsjson.Write(writeCtx, browser, event)
			end()
			if err != nil {
				return
			}
		}
	}
}
func (h *whisperHub) active(m *whisperMember) bool {
	if m.ctx.Err() != nil || h.service.lookup(m.request) != m.session {
		return false
	}
	m.session.mu.Lock()
	defer m.session.mu.Unlock()
	return !m.session.invalid && m.session.user.UserID == h.user && slices.Contains(m.session.user.Scopes, "user:manage:whispers")
}
func (h *whisperHub) broadcast(event personalEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if event.Type == "status" {
		h.status = event
	}
	if event.Message != nil {
		id := event.Message.ID
		if h.seen[id] {
			return
		}
		h.seen[id] = true
		h.order = append(h.order, id)
		if len(h.order) > 2000 {
			delete(h.seen, h.order[0])
			h.order = h.order[1:]
		}
	}
	for member := range h.members {
		select {
		case member.events <- event:
		default:
			member.cancel()
		}
	}
}
func (h *whisperHub) credential() *session {
	h.mu.Lock()
	members := make([]*whisperMember, 0, len(h.members))
	for m := range h.members {
		members = append(members, m)
	}
	h.mu.Unlock()
	for _, m := range members {
		if h.active(m) {
			return m.session
		}
	}
	return nil
}
func (h *whisperHub) subscribe(ctx context.Context, id string) bool {
	p := h.credential()
	if p == nil {
		return false
	}
	body, err := json.Marshal(map[string]any{"type": "user.whisper.message", "version": "1", "condition": map[string]string{"user_id": h.user}, "transport": map[string]string{"method": "websocket", "session_id": id}})
	if err != nil {
		return false
	}
	p.mu.Lock()
	data, status, ok := h.service.helix(ctx, p, http.MethodPost, "/eventsub/subscriptions", body)
	p.mu.Unlock()
	var result struct {
		Data []struct {
			ID string `json:"id"`
		}
	}
	return ok && status == http.StatusAccepted && json.Unmarshal(data, &result) == nil && len(result.Data) == 1 && result.Data[0].ID != ""
}
func (s *Service) reconnectAllowed(raw string) bool {
	candidate, err := url.Parse(raw)
	base, baseErr := url.Parse(s.cfg.EventSubURL)
	return err == nil && baseErr == nil && candidate.User == nil && candidate.Fragment == "" && candidate.Scheme == base.Scheme && candidate.Host == base.Host && (candidate.Scheme == "wss" || candidate.Scheme == "ws" && (candidate.Hostname() == "127.0.0.1" || candidate.Hostname() == "localhost"))
}

type eventSubSocket struct {
	conn   *websocket.Conn
	events chan eventSubEnvelope
	done   chan struct{}
	cancel context.CancelFunc
}

func (h *whisperHub) connect(raw string) (*eventSubSocket, error) {
	ctx, cancel := context.WithTimeout(h.ctx, 10*time.Second)
	defer cancel()
	conn, response, err := websocket.Dial(ctx, raw, nil)
	if response != nil && response.Body != nil {
		_ = response.Body.Close()
	}
	if err != nil {
		return nil, err
	}
	conn.SetReadLimit(128 << 10)
	welcomeCtx, end := context.WithTimeout(h.ctx, 10*time.Second)
	var welcome eventSubEnvelope
	err = wsjson.Read(welcomeCtx, conn, &welcome)
	end()
	if err != nil || welcome.Metadata.Type != "session_welcome" || welcome.Payload.Session.ID == "" {
		_ = conn.CloseNow()
		return nil, errors.New("invalid EventSub welcome")
	}
	keepalive := welcome.Payload.Session.Keepalive
	if keepalive == 0 {
		keepalive = 10
	}
	if keepalive < 10 || keepalive > 600 {
		_ = conn.CloseNow()
		return nil, errors.New("invalid EventSub keepalive")
	}
	readerCtx, stop := context.WithCancel(h.ctx)
	socket := &eventSubSocket{conn: conn, events: make(chan eventSubEnvelope, 64), done: make(chan struct{}), cancel: stop}
	socket.events <- welcome
	go func() {
		defer close(socket.done)
		for {
			readCtx, finish := context.WithTimeout(readerCtx, time.Duration(keepalive)*time.Second)
			var envelope eventSubEnvelope
			err := wsjson.Read(readCtx, conn, &envelope)
			finish()
			if err != nil {
				return
			}
			select {
			case socket.events <- envelope:
			case <-readerCtx.Done():
				return
			}
		}
	}()
	return socket, nil
}
func (s *eventSubSocket) close() { s.cancel(); _ = s.conn.CloseNow(); <-s.done }
func (h *whisperHub) consume(socket *eventSubSocket) bool {
	current := socket
	defer func() { current.close() }()
	select {
	case welcome := <-current.events:
		if !h.subscribe(h.ctx, welcome.Payload.Session.ID) {
			return false
		}
	case <-h.ctx.Done():
		return false
	}
	h.broadcast(personalEvent{Type: "status", State: "connected", Detail: "Incoming whispers connected"})
	type handoffResult struct {
		socket *eventSubSocket
		err    error
	}
	var pending <-chan handoffResult
	for {
		select {
		case <-h.ctx.Done():
			if pending != nil {
				result := <-pending
				if result.socket != nil {
					result.socket.close()
				}
			}
			return false
		case <-current.done:
			if pending != nil {
				result := <-pending
				if result.socket != nil {
					result.socket.close()
				}
			}
			return false
		case result := <-pending:
			pending = nil
			if result.err != nil {
				return false
			}
			old := current
			current = result.socket
			<-current.events
			old.close()
		case envelope := <-current.events:
			switch envelope.Metadata.Type {
			case "notification":
				if message, ok := whisperMessage(envelope, h.user); ok {
					h.broadcast(personalEvent{Type: "message", Message: &message})
				}
			case "session_keepalive":
			case "revocation":
				h.broadcast(personalEvent{Type: "status", State: "reconnecting", Detail: "Whisper authorization revoked; sign out and log in again"})
				return true
			case "session_reconnect":
				if pending == nil && h.service.reconnectAllowed(envelope.Payload.Session.Reconnect) {
					results := make(chan handoffResult, 1)
					pending = results
					raw := envelope.Payload.Session.Reconnect
					go func() { next, err := h.connect(raw); results <- handoffResult{next, err} }()
				} else if pending == nil {
					return false
				}
			default:
				return false
			}
		}
	}
}
func (h *whisperHub) run() {
	backoff := time.Second
	for h.ctx.Err() == nil {
		socket, err := h.connect(h.service.cfg.EventSubURL)
		if err == nil {
			if h.consume(socket) {
				<-h.ctx.Done()
				return
			}
		}
		h.broadcast(personalEvent{Type: "status", State: "reconnecting", Detail: "Incoming whispers reconnecting; messages during the gap cannot be recovered"})
		timer := time.NewTimer(backoff)
		select {
		case <-h.ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		backoff = min(backoff*2, 30*time.Second)
	}
}
