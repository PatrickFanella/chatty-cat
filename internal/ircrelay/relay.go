// Package ircrelay owns configured, account-private non-Twitch TLS IRC sessions.
package ircrelay

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/netip"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

type Network struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Host        string   `json:"host"`
	Port        int      `json:"port"`
	Account     string   `json:"account"`
	Nick        string   `json:"nick"`
	Channels    []string `json:"channels"`
	PasswordEnv string   `json:"passwordEnv,omitempty"`
	password    string
}
type Message struct {
	ID       string `json:"id"`
	Target   string `json:"target"`
	Nick     string `json:"nick"`
	Text     string `json:"text"`
	Time     int64  `json:"time"`
	Delivery string `json:"delivery"`
}
type View struct {
	Network  string    `json:"network"`
	Epoch    string    `json:"epoch"`
	Nick     string    `json:"nick"`
	State    string    `json:"state"`
	Detail   string    `json:"detail"`
	Channels []string  `json:"channels"`
	Messages []Message `json:"messages"`
}
type Session struct {
	mu                              sync.Mutex
	writeMu                         sync.Mutex
	actions                         sync.Mutex
	network                         Network
	conn                            net.Conn
	ctx                             context.Context
	cancel                          context.CancelFunc
	epoch, connectID, state, detail string
	messages                        []Message
	seq                             int
	lastSeen                        time.Time
	receipts                        map[string]Message
	sends                           []time.Time
}
type Service struct {
	mu       sync.Mutex
	networks []Network
	sessions map[string]*Session
	ctx      context.Context
	cancel   context.CancelFunc
	wg       sync.WaitGroup
	closed   bool
	dial     func(context.Context, Network) (net.Conn, error)
}

var identifier = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)
var accountID = regexp.MustCompile(`^[1-9][0-9]{0,19}$`)
var nickname = regexp.MustCompile("^[A-Za-z_\\[\\]\\\\`^{|}][A-Za-z0-9_\\-\\[\\]\\\\`^{|}]{0,29}$")
var channel = regexp.MustCompile("^#[A-Za-z0-9_\\-\\[\\]\\\\`^{|}]{1,49}$")
var hostName = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{0,252}$`)
var envName = regexp.MustCompile(`^[A-Z][A-Z0-9_]{0,63}$`)
var requestID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

func canonical(v string) string {
	return strings.NewReplacer("[", "{", "]", "}", "\\", "|", "~", "^").Replace(strings.ToLower(v))
}
func random() string {
	var b [16]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic("system randomness unavailable")
	}
	return hex.EncodeToString(b[:])
}
func publicIP(ip net.IP) bool {
	a, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	a = a.Unmap()
	if !a.IsGlobalUnicast() || a.IsPrivate() || a.IsLoopback() || a.IsLinkLocalUnicast() {
		return false
	}
	for _, prefix := range []string{"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "2001:db8::/32"} {
		if netip.MustParsePrefix(prefix).Contains(a) {
			return false
		}
	}
	return true
}
func Load(path string) ([]Network, error) {
	if path == "" {
		return nil, nil
	}
	f, e := os.Open(path)
	if e != nil {
		return nil, e
	}
	defer func() { _ = f.Close() }()
	info, e := f.Stat()
	if e != nil || info.Size() > 32768 {
		return nil, errors.New("IRC configuration exceeds 32 KiB")
	}
	d := json.NewDecoder(io.LimitReader(f, 32769))
	d.DisallowUnknownFields()
	var v []Network
	if d.Decode(&v) != nil || d.Decode(new(any)) != io.EOF {
		return nil, errors.New("invalid IRC configuration")
	}
	return v, nil
}
func New(networks []Network) (*Service, error) {
	if len(networks) > 8 {
		return nil, errors.New("IRC limit: eight owner-configured networks")
	}
	seen := map[string]bool{}
	copyNetworks := make([]Network, len(networks))
	for i, n := range networks {
		if !identifier.MatchString(n.ID) || seen[n.ID] || len(n.Name) < 1 || len(n.Name) > 64 || !hostName.MatchString(n.Host) || strings.Contains(n.Host, "..") || n.Port < 1 || n.Port > 65535 || !accountID.MatchString(n.Account) || !nickname.MatchString(n.Nick) || len(n.Channels) < 1 || len(n.Channels) > 8 {
			return nil, errors.New("invalid owner IRC endpoint/identity")
		}
		seen[n.ID] = true
		if ip := net.ParseIP(n.Host); ip != nil && !publicIP(ip) {
			return nil, errors.New("IRC endpoints must be public TLS destinations")
		}
		channels := map[string]bool{}
		for _, c := range n.Channels {
			if !channel.MatchString(c) || channels[canonical(c)] {
				return nil, errors.New("invalid or duplicate approved IRC channel")
			}
			channels[canonical(c)] = true
		}
		if n.PasswordEnv != "" {
			if !envName.MatchString(n.PasswordEnv) {
				return nil, errors.New("invalid IRC credential environment key")
			}
			n.password = os.Getenv(n.PasswordEnv)
			if n.password == "" || len(n.password) > 256 || strings.ContainsAny(n.password, "\r\n\x00") {
				return nil, errors.New("IRC credential environment key missing or invalid")
			}
		}
		n.Channels = append([]string{}, n.Channels...)
		copyNetworks[i] = n
	}
	ctx, cancel := context.WithCancel(context.Background())
	s := &Service{networks: copyNetworks, sessions: map[string]*Session{}, ctx: ctx, cancel: cancel, dial: tlsDial}
	if len(networks) > 0 {
		s.wg.Add(1)
		go s.sweep()
	}
	return s, nil
}
func tlsDial(ctx context.Context, n Network) (net.Conn, error) {
	deadline, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	ips, e := net.DefaultResolver.LookupNetIP(deadline, "ip", n.Host)
	if e != nil || len(ips) == 0 || len(ips) > 16 {
		return nil, errors.New("IRC DNS resolution unavailable")
	}
	for _, ip := range ips {
		if !publicIP(net.IP(ip.AsSlice())) {
			return nil, errors.New("IRC DNS returned a non-public address")
		}
	}
	for _, ip := range ips[:min(len(ips), 3)] {
		conn, e := (&net.Dialer{Timeout: 3 * time.Second}).DialContext(deadline, "tcp", net.JoinHostPort(ip.String(), strconv.Itoa(n.Port)))
		if e != nil {
			continue
		}
		secure := tls.Client(conn, &tls.Config{ServerName: n.Host, MinVersion: tls.VersionTLS12})
		if secure.HandshakeContext(deadline) == nil {
			return secure, nil
		}
		_ = conn.Close()
	}
	return nil, errors.New("IRC TLS connection unavailable")
}
func (s *Service) network(account, id string) (Network, error) {
	for _, n := range s.networks {
		if n.ID == id && n.Account == account {
			return n, nil
		}
	}
	return Network{}, errors.New("IRC network unavailable for this account")
}
func (x *Session) snapshot() View {
	return View{Network: x.network.ID, Epoch: x.epoch, Nick: x.network.Nick, State: x.state, Detail: x.detail, Channels: append([]string{}, x.network.Channels...), Messages: append([]Message{}, x.messages...)}
}
func (s *Service) Read(account, id string) (View, error) {
	if _, e := s.network(account, id); e != nil {
		return View{}, e
	}
	s.mu.Lock()
	x := s.sessions[id]
	s.mu.Unlock()
	if x == nil {
		return View{}, errors.New("connect this network first")
	}
	x.mu.Lock()
	defer x.mu.Unlock()
	x.lastSeen = time.Now()
	return x.snapshot(), nil
}
func (s *Service) Connect(ctx context.Context, account, id, request string) (View, error) {
	n, e := s.network(account, id)
	if e != nil || !requestID.MatchString(request) {
		return View{}, errors.New("invalid IRC connection request")
	}
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return View{}, errors.New("IRC relay stopped")
	}
	old := s.sessions[id]
	if old != nil {
		old.mu.Lock()
		if old.connectID == request {
			v := old.snapshot()
			old.mu.Unlock()
			s.mu.Unlock()
			return v, nil
		}
		if old.state == "connected" || old.state == "connecting" {
			old.mu.Unlock()
			s.mu.Unlock()
			return View{}, errors.New("disconnect before reconnecting")
		}
		old.mu.Unlock()
	}
	ctxSession, cancel := context.WithCancel(s.ctx)
	x := &Session{network: n, ctx: ctxSession, cancel: cancel, epoch: random(), connectID: request, state: "connecting", detail: "TLS registration pending", lastSeen: time.Now(), receipts: map[string]Message{}}
	if old != nil {
		old.mu.Lock()
		x.messages = append([]Message{}, old.messages...)
		old.mu.Unlock()
	}
	s.sessions[id] = x
	s.wg.Add(1)
	s.mu.Unlock()
	// Reserve the session before dialing so duplicate connect cannot create a second socket.
	conn, e := s.dial(ctx, n)
	if e != nil {
		x.mu.Lock()
		x.state = "unavailable"
		x.detail = "TLS connection unavailable"
		x.mu.Unlock()
		cancel()
		s.wg.Done()
		return View{}, errors.New("IRC TLS connection unavailable")
	}
	x.mu.Lock()
	if x.ctx.Err() != nil {
		x.mu.Unlock()
		_ = conn.Close()
		s.wg.Done()
		return View{}, errors.New("IRC connection cancelled")
	}
	x.conn = conn
	x.mu.Unlock()
	if n.password != "" {
		e = x.write("PASS :" + n.password)
	}
	if e == nil {
		e = x.write("NICK " + n.Nick)
	}
	if e == nil {
		e = x.write("USER " + n.Nick + " 0 * :Chatty Cat")
	}
	if e != nil {
		x.end("Registration write uncertain")
		s.wg.Done()
		return View{}, errors.New("IRC registration failed")
	}
	go func() { defer s.wg.Done(); x.readLoop() }()
	x.mu.Lock()
	v := x.snapshot()
	x.mu.Unlock()
	return v, nil
}
func (x *Session) write(line string) error {
	if len(line) > 510 || strings.ContainsAny(line, "\r\n\x00") {
		return errors.New("invalid IRC wire line")
	}
	x.writeMu.Lock()
	defer x.writeMu.Unlock()
	if e := x.conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); e != nil {
		return e
	}
	_, e := io.WriteString(x.conn, line+"\r\n")
	return e
}
func (x *Session) end(detail string) {
	x.mu.Lock()
	x.state = "unavailable"
	x.detail = detail
	x.cancel()
	conn := x.conn
	x.mu.Unlock()
	if conn != nil {
		_ = conn.Close()
	}
}
func (x *Session) readLoop() {
	defer x.end("Connection ended; reconnect explicitly (no automatic resend)")
	reader := bufio.NewScanner(x.conn)
	reader.Buffer(make([]byte, 4096), 4096)
	_ = x.conn.SetReadDeadline(time.Now().Add(30 * time.Second))
	for reader.Scan() {
		line := reader.Text()
		if len(line) > 4094 || !utf8.ValidString(line) || strings.ContainsAny(line, "\x00\n") {
			return
		}
		line = strings.TrimSuffix(line, "\r")
		prefix := ""
		if strings.HasPrefix(line, "@") {
			_, tail, ok := strings.Cut(line, " ")
			if !ok {
				continue
			}
			line = tail
		}
		if strings.HasPrefix(line, ":") {
			head, tail, ok := strings.Cut(line, " ")
			if !ok {
				continue
			}
			prefix = head[1:]
			line = tail
		}
		params, text, _ := strings.Cut(line, " :")
		fields := strings.Fields(params)
		if len(fields) == 0 {
			continue
		}
		command := fields[0]
		if command == "PING" {
			token := text
			if token == "" && len(fields) > 1 {
				token = fields[1]
			}
			if token == "" || len(token) > 256 || x.write("PONG :"+token) != nil {
				return
			}
			_ = x.conn.SetReadDeadline(time.Now().Add(5 * time.Minute))
			continue
		}
		if command == "001" {
			if len(fields) < 2 || canonical(fields[1]) != canonical(x.network.Nick) {
				return
			}
			x.mu.Lock()
			x.state = "connected"
			x.detail = "TLS IRC connected; identity is the configured IRC nick"
			x.mu.Unlock()
			_ = x.conn.SetReadDeadline(time.Now().Add(5 * time.Minute))
			for _, c := range x.network.Channels {
				if x.write("JOIN "+c) != nil {
					return
				}
			}
			continue
		}
		if command == "ERROR" || command == "433" || command == "464" {
			return
		}
		if command == "PONG" {
			_ = x.conn.SetReadDeadline(time.Now().Add(5 * time.Minute))
			continue
		}
		if command != "PRIVMSG" && command != "NOTICE" || len(fields) < 2 || len(text) > 1024 {
			continue
		}
		nick, _, ok := strings.Cut(prefix, "!")
		if !ok || !nickname.MatchString(nick) {
			continue
		}
		target := fields[1]
		if canonical(target) == canonical(x.network.Nick) {
			target = nick
		} else if !x.allowedChannel(target) {
			continue
		}
		if strings.HasPrefix(text, "\x01ACTION ") && strings.HasSuffix(text, "\x01") {
			text = "* " + strings.TrimSuffix(strings.TrimPrefix(text, "\x01ACTION "), "\x01")
		} else if strings.ContainsRune(text, '\x01') {
			continue
		}
		text = strings.Map(func(r rune) rune {
			if r < 32 || r == 127 {
				return -1
			}
			return r
		}, text)
		x.mu.Lock()
		matched := false
		if canonical(nick) == canonical(x.network.Nick) {
			for i := len(x.messages) - 1; i >= 0 && i >= len(x.messages)-32; i-- {
				m := &x.messages[i]
				if m.Delivery != "observed" && canonical(m.Target) == canonical(target) && m.Text == text && time.Now().UnixMilli()-m.Time < 10000 {
					m.Delivery = "observed"
					if r, ok := x.receipts[strings.TrimPrefix(m.ID, x.epoch+":")]; ok {
						r.Delivery = "observed"
						x.receipts[strings.TrimPrefix(m.ID, x.epoch+":")] = r
					}
					matched = true
					break
				}
			}
		}
		if !matched {
			x.seq++
			x.append(Message{ID: x.epoch + ":incoming:" + strconv.Itoa(x.seq), Target: target, Nick: nick, Text: text, Time: time.Now().UnixMilli(), Delivery: "observed"})
		}
		x.mu.Unlock()
		_ = x.conn.SetReadDeadline(time.Now().Add(5 * time.Minute))
	}
}
func (x *Session) allowedChannel(target string) bool {
	for _, c := range x.network.Channels {
		if canonical(c) == canonical(target) {
			return true
		}
	}
	return false
}
func (x *Session) append(m Message) {
	x.messages = append(x.messages, m)
	for len(x.messages) > 500 {
		x.messages = x.messages[1:]
	}
}
func (s *Service) Send(account, id, epoch, request, target, text string) (Message, error) {
	if _, e := s.network(account, id); e != nil {
		return Message{}, e
	}
	if !requestID.MatchString(request) || len(text) < 1 || len(text) > 400 || !utf8.ValidString(text) || strings.ContainsAny(text, "\r\n\x00\x01") {
		return Message{}, errors.New("IRC message must be 1–400 UTF-8 bytes without control framing")
	}
	s.mu.Lock()
	x := s.sessions[id]
	s.mu.Unlock()
	if x == nil {
		return Message{}, errors.New("connect first")
	}
	x.actions.Lock()
	defer x.actions.Unlock()
	x.mu.Lock()
	if x.epoch != epoch {
		x.mu.Unlock()
		return Message{}, errors.New("IRC connection changed; review again")
	}
	if !x.allowedChannel(target) && !nickname.MatchString(target) {
		x.mu.Unlock()
		return Message{}, errors.New("target is not an approved channel or valid nick")
	}
	if m, ok := x.receipts[request]; ok {
		x.mu.Unlock()
		if m.Target != target || m.Text != text {
			return Message{}, errors.New("request ID already used")
		}
		return m, nil
	}
	if x.state != "connected" {
		x.mu.Unlock()
		return Message{}, errors.New("IRC connection changed; review again")
	}
	if len(x.receipts) >= 32 {
		x.mu.Unlock()
		return Message{}, errors.New("IRC session receipt limit reached; reconnect explicitly")
	}
	now := time.Now()
	recent := x.sends[:0]
	for _, t := range x.sends {
		if now.Sub(t) < time.Minute {
			recent = append(recent, t)
		}
	}
	x.sends = recent
	if len(recent) >= 20 {
		x.mu.Unlock()
		return Message{}, errors.New("IRC send limit: 20 per minute")
	}
	x.sends = append(x.sends, now)
	x.lastSeen = now
	m := Message{ID: x.epoch + ":" + request, Target: target, Nick: x.network.Nick, Text: text, Time: now.UnixMilli(), Delivery: "pending"}
	x.receipts[request] = m
	x.append(m)
	x.mu.Unlock()
	e := x.write("PRIVMSG " + target + " :" + text)
	x.mu.Lock()
	m = x.receipts[request]
	if m.Delivery != "observed" {
		if e != nil {
			m.Delivery = "uncertain"
		} else {
			m.Delivery = "submitted"
		}
		x.receipts[request] = m
		for i := range x.messages {
			if x.messages[i].ID == m.ID {
				x.messages[i] = m
				break
			}
		}
	}
	x.mu.Unlock()
	if e != nil {
		x.end("Write outcome uncertain; never automatically resend")
	}
	return m, nil
}
func (s *Service) channelAction(account, id, epoch, target, kind string) error {
	if _, e := s.network(account, id); e != nil {
		return e
	}
	s.mu.Lock()
	x := s.sessions[id]
	s.mu.Unlock()
	if x == nil {
		return errors.New("connect first")
	}
	x.mu.Lock()
	valid := x.epoch == epoch && x.state == "connected" && x.allowedChannel(target)
	x.mu.Unlock()
	if !valid {
		return errors.New("invalid IRC channel or connection")
	}
	if kind != "join" && kind != "part" {
		return errors.New("invalid channel action")
	}
	return x.write(strings.ToUpper(kind) + " " + target)
}
func (s *Service) Disconnect(account, id, epoch string) error {
	if _, e := s.network(account, id); e != nil {
		return e
	}
	s.mu.Lock()
	x := s.sessions[id]
	s.mu.Unlock()
	if x == nil {
		return nil
	}
	x.mu.Lock()
	valid := x.epoch == epoch
	x.mu.Unlock()
	if !valid {
		return errors.New("IRC connection changed")
	}
	x.end("Disconnected by owner")
	return nil
}
func (s *Service) sweep() {
	defer s.wg.Done()
	tick := time.NewTicker(5 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-tick.C:
			s.mu.Lock()
			sessions := make([]*Session, 0, len(s.sessions))
			for _, x := range s.sessions {
				sessions = append(sessions, x)
			}
			s.mu.Unlock()
			for _, x := range sessions {
				x.mu.Lock()
				stale := time.Since(x.lastSeen) > 30*time.Second
				x.mu.Unlock()
				if stale {
					x.end("Browser lease expired; reconnect explicitly")
				}
			}
		}
	}
}
func (s *Service) Close() {
	s.mu.Lock()
	s.closed = true
	s.cancel()
	sessions := make([]*Session, 0, len(s.sessions))
	for _, x := range s.sessions {
		sessions = append(sessions, x)
	}
	s.mu.Unlock()
	for _, x := range sessions {
		x.end("Relay shutdown")
	}
	s.wg.Wait()
}
