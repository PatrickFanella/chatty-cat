package auth

import (
	"context"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/PatrickFanella/hasanabi.neocities.org/rebuild/internal/irc"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type personalEvent struct {
	Type    string       `json:"type"`
	State   string       `json:"state,omitempty"`
	Detail  string       `json:"detail,omitempty"`
	Message *irc.Message `json:"message,omitempty"`
}

func (s *Service) personalChat(w http.ResponseWriter, r *http.Request) {
	if !s.sameHost(r) || !equal(r.Header.Get("Origin"), s.origin) {
		http.Error(w, "Invalid chat origin", http.StatusForbidden)
		return
	}
	want := strings.Split(r.URL.Query().Get("channels"), ",")
	if len(want) < 1 || len(want) > 6 {
		http.Error(w, "Invalid channels", http.StatusBadRequest)
		return
	}
	for _, channel := range want {
		if !channelPattern.MatchString(channel) {
			http.Error(w, "Invalid channel", http.StatusBadRequest)
			return
		}
	}
	p := s.lookup(r)
	if p == nil {
		http.Error(w, "Log in to receive personal chat state", http.StatusUnauthorized)
		return
	}
	checkCtx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	p.mu.Lock()
	valid := s.check(checkCtx, p, time.Now())
	token, login := p.tokens.Access, p.user.Login
	enabled := slices.Contains(p.user.Scopes, "chat:read") && slices.Contains(p.user.Scopes, "chat:edit")
	p.mu.Unlock()
	cancel()
	if !valid {
		http.Error(w, "Session expired", http.StatusUnauthorized)
		return
	}
	if !enabled {
		http.Error(w, "Log in again to enable personal chat state", http.StatusForbidden)
		return
	}
	if !channelPattern.MatchString(login) || strings.ContainsAny(token, " \r\n\x00") {
		http.Error(w, "Invalid personal chat identity", http.StatusUnauthorized)
		return
	}
	p.mu.Lock()
	if p.personalConnections >= 2 {
		p.mu.Unlock()
		http.Error(w, "Close another personal chat tab before opening this one", http.StatusTooManyRequests)
		return
	}
	p.personalConnections++
	p.mu.Unlock()
	defer func() { p.mu.Lock(); p.personalConnections--; p.mu.Unlock() }()
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
	case s.ircSlots <- struct{}{}:
		defer func() { <-s.ircSlots }()
	default:
		http.Error(w, "Personal chat capacity reached", http.StatusServiceUnavailable)
		return
	}
	browser, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer func() { _ = browser.CloseNow() }()
	ctx, stop := context.WithCancel(s.ctx)
	defer stop()
	ctx = browser.CloseRead(ctx)
	write := func(event personalEvent) error {
		writeCtx, end := context.WithTimeout(ctx, 5*time.Second)
		defer end()
		return wsjson.Write(writeCtx, browser, event)
	}
	dialCtx, end := context.WithTimeout(ctx, 10*time.Second)
	upstream, response, err := websocket.Dial(dialCtx, s.cfg.IRCURL, nil)
	end()
	if response != nil && response.Body != nil {
		_ = response.Body.Close()
	}
	if err != nil {
		_ = write(personalEvent{Type: "status", State: "reconnecting", Detail: "Personal chat unavailable; public chat continues"})
		return
	}
	defer func() { _ = upstream.CloseNow() }()
	upstream.SetReadLimit(1 << 20)
	peer := &personalPeer{conn: upstream, joined: map[string]bool{}, done: make(chan struct{})}
	p.mu.Lock()
	p.personalPeers = append(p.personalPeers, peer)
	p.mu.Unlock()
	defer func() {
		close(peer.done)
		p.mu.Lock()
		for i, candidate := range p.personalPeers {
			if candidate == peer {
				p.personalPeers = append(p.personalPeers[:i], p.personalPeers[i+1:]...)
				break
			}
		}
		p.mu.Unlock()
	}()

	send := func(text string) error {
		writeCtx, end := context.WithTimeout(ctx, 5*time.Second)
		defer end()
		return upstream.Write(writeCtx, websocket.MessageText, []byte(text+"\r\n"))
	}
	for _, command := range []string{"CAP REQ :twitch.tv/tags twitch.tv/commands", "PASS oauth:" + token, "NICK " + login} {
		if send(command) != nil {
			return
		}
	}
	for _, channel := range want {
		if send("JOIN #"+channel) != nil {
			return
		}
	}
	// Logout, token rotation and session expiry cancel the credentialed connection.
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if s.lookup(r) != p {
					stop()
					return
				}
				p.mu.Lock()
				changed := p.invalid || p.tokens.Access != token
				p.mu.Unlock()
				if changed {
					stop()
					return
				}
			}
		}
	}()
	defer func() { stop(); <-done }()
	ready := false
	for {
		readCtx := ctx
		var finish context.CancelFunc = func() {}
		if !ready {
			readCtx, finish = context.WithTimeout(ctx, 15*time.Second)
		}
		_, data, err := upstream.Read(readCtx)
		finish()
		if err != nil {
			return
		}
		for _, line := range strings.Split(string(data), "\r\n") {
			message, err := irc.Parse(line)
			if err != nil {
				continue
			}
			if message.Timestamp == 0 {
				message.Timestamp = time.Now().UnixMilli()
			}
			peer.observe(message)
			switch message.Command {
			case "PING":
				if send("PONG :"+message.Text) != nil {
					return
				}
			case "RECONNECT":
				return
			case "001":
				ready = true
				if write(personalEvent{Type: "status", State: "connected", Detail: "Personal chat state connected"}) != nil {
					return
				}
			case "GLOBALUSERSTATE":
				message.Channel = ""
				if write(personalEvent{Type: "message", Message: &message}) != nil {
					return
				}
			case "USERSTATE", "ROOMSTATE", "NOTICE", "CLEARCHAT", "WHISPER":
				if message.Command == "WHISPER" {
					message.Channel = login
				} else if !slices.Contains(want, message.Channel) {
					if message.Command == "NOTICE" && message.Channel == "*" {
						_ = write(personalEvent{Type: "status", State: "reconnecting", Detail: "Personal chat authentication unavailable; log in again"})
						return
					}
					continue
				}
				if write(personalEvent{Type: "message", Message: &message}) != nil {
					return
				}
			}
		}
	}
}
