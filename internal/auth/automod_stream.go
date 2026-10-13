package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type autoModHub struct {
	mu      sync.Mutex
	state   *autoModState
	signals *suspiciousState
	holds   *userHoldState
	service *Service
	session *session
	ctx     context.Context
	cancel  context.CancelFunc
	peers   map[chan struct{}]bool
}

func (h *autoModHub) notifyLocked() {
	for peer := range h.peers {
		select {
		case peer <- struct{}{}:
		default:
		}
	}
}
func (h *autoModHub) scope() string {
	if h.holds != nil {
		return userChatReadScope
	}
	if h.signals != nil {
		return suspiciousReadScope
	}
	return autoModScope
}
func (h *autoModHub) version() string {
	if h.signals != nil || h.holds != nil {
		return "1"
	}
	return "2"
}
func (h *autoModHub) registry() map[string]*autoModHub {
	if h.holds != nil {
		return h.service.userHoldHubs
	}
	if h.signals != nil {
		return h.service.suspiciousHubs
	}
	return h.service.autoModHubs
}
func (h *autoModHub) invalidateLocked(detail string) {
	h.state.invalidate(detail)
	if h.holds != nil {
		h.holds.clear()
	}
	if h.signals != nil {
		clear(h.signals.rows)
	}
}
func (h *autoModHub) snapshot() any {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.ctx.Err() != nil && h.state.active {
		h.invalidateLocked("Private connection ended; earlier private events are unavailable")
	}
	if h.holds != nil {
		return h.holds.snapshot()
	}
	if h.signals != nil {
		return h.signals.snapshot()
	}
	return h.state.snapshot()
}
func (h *autoModHub) fail(detail string) {
	h.mu.Lock()
	h.invalidateLocked(detail)
	h.notifyLocked()
	h.mu.Unlock()
	h.cancel()
}
func (h *autoModHub) detach(peer chan struct{}) {
	h.mu.Lock()
	delete(h.peers, peer)
	empty := len(h.peers) == 0
	h.mu.Unlock()
	if empty {
		h.cancel()
	}
}

type privateFeed string

const (
	autoModFeed    privateFeed = "automod"
	suspiciousFeed privateFeed = "suspicious"
	userHoldFeed   privateFeed = "user-holds"
)

func (s *Service) privateHubKindFor(p *session, account, channel, broadcaster string, kind privateFeed) (*autoModHub, chan struct{}, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing {
		return nil, nil, errors.New("Service shutting down")
	}
	if s.autoModHubs == nil {
		s.autoModHubs = map[string]*autoModHub{}
	}
	if s.suspiciousHubs == nil {
		s.suspiciousHubs = map[string]*autoModHub{}
	}
	if s.userHoldHubs == nil {
		s.userHoldHubs = map[string]*autoModHub{}
	}
	hubs := s.autoModHubs
	if kind == userHoldFeed {
		hubs = s.userHoldHubs
	}
	if kind == suspiciousFeed {
		hubs = s.suspiciousHubs
	}
	h := hubs[account]
	if h != nil && h.ctx.Err() != nil {
		delete(hubs, account)
		h = nil
	}
	fresh := h == nil
	if fresh {
		if len(s.autoModHubs)+len(s.suspiciousHubs)+len(s.userHoldHubs) >= 16 {
			return nil, nil, errors.New("private moderation capacity reached; reconnect later")
		}
		ctx, cancel := context.WithCancel(s.ctx)
		h = &autoModHub{state: newAutoModState(account, channel, broadcaster), service: s, session: p, ctx: ctx, cancel: cancel, peers: map[chan struct{}]bool{}}
		if kind == userHoldFeed {
			h.holds = newUserHoldState(h.state)
			h.state.detail = "Connecting own-message feedback; earlier private events unavailable"
		}
		if kind == suspiciousFeed {
			h.signals = newSuspiciousState(h.state)
		}
		hubs[account] = h
	}
	h.mu.Lock()
	if h.session != p || h.state.channel != channel || h.state.broadcaster != broadcaster || len(h.peers) >= 4 {
		h.mu.Unlock()
		return nil, nil, errors.New("Close the other account/channel private moderation view before reconnecting (four tabs maximum)")
	}
	peer := make(chan struct{}, 1)
	h.peers[peer] = true
	h.mu.Unlock()
	if fresh {
		s.wg.Add(1)
		go func() { defer s.wg.Done(); h.run() }()
	}
	return h, peer, nil
}
func (s *Service) autoModEvents(w http.ResponseWriter, r *http.Request) { s.privateEvents(w, r, false) }
func (s *Service) suspiciousEvents(w http.ResponseWriter, r *http.Request) {
	s.privateEvents(w, r, true)
}
func (s *Service) userHoldEvents(w http.ResponseWriter, r *http.Request) {
	s.privateEventsKind(w, r, userHoldFeed)
}
func (s *Service) privateEvents(w http.ResponseWriter, r *http.Request, suspicious bool) {
	kind := autoModFeed
	if suspicious {
		kind = suspiciousFeed
	}
	s.privateEventsKind(w, r, kind)
}
func (s *Service) privateEventsKind(w http.ResponseWriter, r *http.Request, kind privateFeed) {
	scope := autoModScope
	if kind == userHoldFeed {
		scope = userChatReadScope
	}
	if kind == suspiciousFeed {
		scope = suspiciousReadScope
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != s.origin || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		http.Error(w, "Use a same-origin private view", http.StatusForbidden)
		return
	}
	q := r.URL.Query()
	channel := q.Get("channel")
	if len(q) != 1 || len(q["channel"]) != 1 || !channelPattern.MatchString(channel) || !s.sameHost(r) {
		http.Error(w, "Choose a same-origin channel", http.StatusBadRequest)
		return
	}
	p := s.lookup(r)
	if p == nil {
		http.Error(w, "Log in for private moderation", http.StatusUnauthorized)
		return
	}
	ctx, end := context.WithTimeout(r.Context(), 15*time.Second)
	p.mu.Lock()
	valid := s.lookup(r) == p && s.check(ctx, p, time.Now())
	enabled := slices.Contains(p.user.Scopes, scope)
	account := p.user.UserID
	limited := false
	if valid && enabled {
		if time.Since(p.autoModWindow) >= time.Minute {
			p.autoModWindow = time.Now()
			p.autoModRequests = 0
		}
		limited = p.autoModRequests >= 12
		if !limited {
			p.autoModRequests++
		}
	}
	broadcaster, found := "", false
	if valid && enabled && !limited {
		broadcaster, found = s.resolveUser(ctx, p, channel)
	}
	p.mu.Unlock()
	end()
	if !valid {
		http.Error(w, "Session changed", http.StatusUnauthorized)
		return
	}
	if !enabled {
		http.Error(w, "Grant "+scope+" consent", http.StatusForbidden)
		return
	}
	if limited {
		w.Header().Set("Retry-After", "60")
		http.Error(w, "Wait before reconnecting private moderation", http.StatusTooManyRequests)
		return
	}
	if !found || !numericID(broadcaster) {
		http.Error(w, "Channel identity unavailable", http.StatusBadGateway)
		return
	}
	h, peer, err := s.privateHubKindFor(p, account, channel, broadcaster, kind)
	if err != nil {
		w.Header().Set("Content-Type", "text/event-stream")
		snapshot := newAutoModState(account, channel, broadcaster)
		snapshot.invalidate(err.Error())
		var value any = snapshot.snapshot()
		if kind == userHoldFeed {
			value = newUserHoldState(snapshot).snapshot()
		}
		if kind == suspiciousFeed {
			value = newSuspiciousState(snapshot).snapshot()
		}
		if err := writeAutoModSnapshot(w, value); err != nil {
			return
		}
		return
	}
	defer h.detach(peer)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	validSession := func() bool {
		p.mu.Lock()
		defer p.mu.Unlock()
		return s.lookup(r) == p && !p.invalid && p.user.UserID == account && slices.Contains(p.user.Scopes, scope)
	}
	if !validSession() {
		return
	}
	if err := writeAutoModSnapshot(w, h.snapshot()); err != nil {
		return
	}
	heartbeat := time.NewTicker(2 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-h.ctx.Done():
			if !validSession() {
				return
			}
			if err := writeAutoModSnapshot(w, h.snapshot()); err != nil {
				return
			}
			return
		case <-heartbeat.C:
			p.mu.Lock()
			valid := s.lookup(r) == p && !p.invalid && slices.Contains(p.user.Scopes, scope)
			p.mu.Unlock()
			if !valid {
				return
			}
			if err := writeAutoModSnapshot(w, h.snapshot()); err != nil {
				return
			}
		case <-peer:
			if !validSession() {
				return
			}
			if err := writeAutoModSnapshot(w, h.snapshot()); err != nil {
				return
			}
		}
	}
}
func writeAutoModSnapshot(w http.ResponseWriter, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if len(data) > 256<<10 {
		return errors.New("private snapshot capacity exceeded")
	}
	controller := http.NewResponseController(w)
	if err := controller.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil && !errors.Is(err, http.ErrNotSupported) {
		return err
	}
	if _, err := fmt.Fprintf(w, "event: snapshot\ndata: %s\n\n", data); err != nil {
		return err
	}
	return controller.Flush()
}
func closeEventSub(conn *websocket.Conn) {
	if conn != nil {
		if err := conn.CloseNow(); err != nil {
			slog.Debug("Private EventSub teardown ended")
		}
	}
}
func allowedEventSubURL(base, raw string) bool {
	a, err := url.Parse(base)
	if err != nil {
		return false
	}
	b, err := url.Parse(raw)
	if err != nil || b.User != nil || b.Fragment != "" || b.Scheme != a.Scheme || b.Host != a.Host || b.Path != a.Path {
		return false
	}
	return b.Scheme == "wss" || b.Scheme == "ws" && (b.Hostname() == "127.0.0.1" || b.Hostname() == "localhost")
}
func dialEventSub(ctx context.Context, raw string) (*websocket.Conn, eventSubFrame, error) {
	var welcome eventSubFrame
	dialCtx, end := context.WithTimeout(ctx, 10*time.Second)
	defer end()
	client := &http.Client{CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	conn, response, err := websocket.Dial(dialCtx, raw, &websocket.DialOptions{HTTPClient: client})
	if response != nil && response.Body != nil {
		if err := response.Body.Close(); err != nil {
			slog.Debug("Private EventSub handshake response close failed")
		}
	}
	if err != nil {
		return nil, welcome, err
	}
	conn.SetReadLimit(64 << 10)
	_, data, err := conn.Read(dialCtx)
	if err != nil || json.Unmarshal(data, &welcome) != nil || welcome.Metadata.Type != "session_welcome" || welcome.Payload.Session.ID == "" || len(welcome.Payload.Session.ID) > 128 || welcome.Payload.Session.Keepalive < 1 || welcome.Payload.Session.Keepalive > 120 {
		closeEventSub(conn)
		return nil, welcome, errors.New("invalid private EventSub welcome")
	}
	return conn, welcome, nil
}
func (h *autoModHub) subscribe(ctx context.Context, sessionID, kind string) (string, error) {
	condition := map[string]string{"broadcaster_user_id": h.state.broadcaster}
	if h.holds != nil {
		condition["user_id"] = h.state.account
	} else {
		condition["moderator_user_id"] = h.state.account
	}
	payload, err := json.Marshal(map[string]any{"type": kind, "version": h.version(), "condition": condition, "transport": map[string]string{"method": "websocket", "session_id": sessionID}})
	if err != nil {
		return "", err
	}
	p := h.session
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.invalid || !slices.Contains(p.user.Scopes, h.scope()) {
		return "", errors.New("private moderation consent/session changed")
	}
	data, status, ok := h.service.helix(ctx, p, http.MethodPost, "/eventsub/subscriptions", payload)
	if !ok || status != http.StatusAccepted {
		return "", fmt.Errorf("private moderation subscription unavailable (HTTP %d); check consent/role and reconnect", status)
	}
	var response struct {
		Data []struct {
			ID, Type, Version, Status string
			Condition                 struct {
				Broadcaster string `json:"broadcaster_user_id"`
				Moderator   string `json:"moderator_user_id"`
				User        string `json:"user_id"`
			}
			Transport struct {
				Method    string
				SessionID string `json:"session_id"`
			}
		}
	}
	if json.Unmarshal(data, &response) != nil || len(response.Data) != 1 {
		return "", errors.New("private subscription could not be verified")
	}
	v := response.Data[0]
	if !messageIDPattern.MatchString(v.ID) || v.Type != kind || v.Version != h.version() || v.Status != "enabled" || v.Condition.Broadcaster != h.state.broadcaster || (h.holds == nil && v.Condition.Moderator != h.state.account) || (h.holds != nil && v.Condition.User != h.state.account) || v.Transport.Method != "websocket" || v.Transport.SessionID != sessionID {
		return "", errors.New("private subscription identity could not be verified")
	}
	return v.ID, nil
}

type eventSubRead struct {
	conn *websocket.Conn
	data []byte
	err  error
}

func readEventSub(ctx context.Context, conn *websocket.Conn, keepalive int, out chan<- eventSubRead) {
	for {
		readCtx, end := context.WithTimeout(ctx, time.Duration(keepalive+5)*time.Second)
		_, data, err := conn.Read(readCtx)
		end()
		select {
		case out <- eventSubRead{conn, data, err}:
		case <-ctx.Done():
			return
		}
		if err != nil {
			return
		}
	}
}
func (h *autoModHub) run() {
	defer func() {
		h.mu.Lock()
		if h.state.active {
			h.invalidateLocked("Private connection ended; earlier private events are unavailable")
		}
		h.notifyLocked()
		h.mu.Unlock()
		h.cancel()
		h.service.mu.Lock()
		if h.registry()[h.state.account] == h {
			delete(h.registry(), h.state.account)
		}
		h.service.mu.Unlock()
	}()
	if !allowedEventSubURL(h.service.cfg.EventSubURL, h.service.cfg.EventSubURL) {
		h.fail("Private EventSub endpoint unavailable")
		return
	}
	conn, welcome, err := dialEventSub(h.ctx, h.service.cfg.EventSubURL)
	if err != nil {
		h.fail("Private moderation connection unavailable; reconnect after checking consent/role")
		return
	}
	defer func() { closeEventSub(conn) }()
	at, err := time.Parse(time.RFC3339Nano, welcome.Metadata.At)
	if err != nil {
		h.fail("Private welcome timestamp unavailable")
		return
	}
	h.mu.Lock()
	h.state.floor = at
	h.mu.Unlock()
	subscribeCtx, end := context.WithTimeout(h.ctx, 8*time.Second)
	kinds := []string{"automod.message.hold", "automod.message.update"}
	if h.holds != nil {
		kinds = []string{userHoldKind, userUpdateKind}
	}
	if h.signals != nil {
		kinds = []string{"channel.suspicious_user.message", "channel.suspicious_user.update"}
	}
	for _, kind := range kinds {
		id, err := h.subscribe(subscribeCtx, welcome.Payload.Session.ID, kind)
		if err != nil {
			end()
			h.fail(err.Error())
			return
		}
		h.mu.Lock()
		h.state.subscriptions[id] = kind
		h.mu.Unlock()
	}
	end()
	h.mu.Lock()
	h.state.active = true
	h.state.detail = "Live private AutoMod (100 rows / 15 minutes); earlier private events are unavailable"
	if h.holds != nil {
		h.state.detail = "Live own-message feedback (100 rows / 15 minutes); earlier feedback unavailable"
	}
	if h.signals != nil {
		h.state.detail = "Live private suspicious-user signals (100 users / 15 minutes); earlier/missing signals unavailable"
	}
	h.notifyLocked()
	h.mu.Unlock()
	type handoff struct {
		conn    *websocket.Conn
		welcome eventSubFrame
		err     error
	}
	handoffs := make(chan handoff, 1)
	reads := make(chan eventSubRead, 4)
	workersCtx, stop := context.WithCancel(h.ctx)
	var workers sync.WaitGroup
	defer func() {
		stop()
		closeEventSub(conn)
		workers.Wait()
		select {
		case pending := <-handoffs:
			closeEventSub(pending.conn)
		default:
		}
	}()
	start := func(c *websocket.Conn, keepalive int) {
		workers.Add(1)
		go func() { defer workers.Done(); readEventSub(workersCtx, c, keepalive, reads) }()
	}
	start(conn, welcome.Payload.Session.Keepalive)
	reconnecting := false
	for {
		select {
		case <-h.ctx.Done():
			return
		case next := <-handoffs:
			reconnecting = false
			if next.err != nil {
				h.fail("Private reconnect unavailable; earlier private events are unavailable")
				return
			}
			old := conn
			conn = next.conn
			start(conn, next.welcome.Payload.Session.Keepalive)
			closeEventSub(old)
		case incoming := <-reads:
			if incoming.conn != conn {
				continue
			}
			if incoming.err != nil {
				h.fail("Private moderation disconnected; reconnect. Earlier held messages are unavailable")
				return
			}
			var frame eventSubFrame
			if json.Unmarshal(incoming.data, &frame) != nil {
				continue
			}
			if frame.Metadata.Type == "session_reconnect" {
				raw := frame.Payload.Session.ReconnectURL
				if reconnecting {
					continue
				}
				h.mu.Lock()
				duplicate := h.state.seen[frame.Metadata.ID]
				exhausted := len(h.state.seen) >= 1000
				if !exhausted && !duplicate && messageIDPattern.MatchString(frame.Metadata.ID) {
					h.state.seen[frame.Metadata.ID] = true
				}
				h.mu.Unlock()
				if exhausted {
					h.fail("Private replay budget reached; reconnect; earlier private events unavailable")
					return
				}
				if duplicate {
					continue
				}
				if !messageIDPattern.MatchString(frame.Metadata.ID) || !allowedEventSubURL(h.service.cfg.EventSubURL, raw) {
					h.fail("Private reconnect target unavailable")
					return
				}
				reconnecting = true
				workers.Add(1)
				go func() {
					defer workers.Done()
					c, w, err := dialEventSub(workersCtx, raw)
					select {
					case handoffs <- handoff{c, w, err}:
					case <-workersCtx.Done():
						closeEventSub(c)
					}
				}()
				continue
			}
			h.mu.Lock()
			changed := false
			if h.holds != nil {
				changed = h.holds.observe(incoming.data)
			} else if h.signals != nil {
				changed = h.signals.observe(incoming.data)
			} else {
				changed = h.state.observe(incoming.data)
			}
			active := h.state.active
			if changed {
				h.notifyLocked()
			}
			h.mu.Unlock()
			if !active {
				return
			}
		}
	}
}
