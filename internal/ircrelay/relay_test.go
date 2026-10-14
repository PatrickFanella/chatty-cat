package ircrelay

import (
	"bufio"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type deadlineConn struct {
	net.Conn
	reads atomic.Int32
}

func (c *deadlineConn) SetReadDeadline(deadline time.Time) error {
	c.reads.Add(1)
	return c.Conn.SetReadDeadline(deadline)
}

func TestServerKeepaliveRenewsReadDeadline(t *testing.T) {
	s, err := New([]Network{testNetwork()})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	client, server := net.Pipe()
	defer server.Close()
	conn := &deadlineConn{Conn: client}
	s.dial = func(context.Context, Network) (net.Conn, error) { return conn, nil }
	lines := make(chan string, 8)
	go func() {
		reader := bufio.NewScanner(server)
		for reader.Scan() {
			lines <- reader.Text()
		}
	}()
	if _, err := s.Connect(context.Background(), "42", "test", "keepalive"); err != nil {
		t.Fatal(err)
	}
	<-lines
	<-lines
	if _, err := server.Write([]byte(":server 001 Alice :Welcome\r\n")); err != nil {
		t.Fatal(err)
	}
	<-lines
	before := conn.reads.Load()
	if _, err := server.Write([]byte("PING :still-alive\r\n")); err != nil {
		t.Fatal(err)
	}
	if line := <-lines; line != "PONG :still-alive" {
		t.Fatal(line)
	}
	deadline := time.Now().Add(time.Second)
	for conn.reads.Load() == before && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if conn.reads.Load() == before {
		t.Fatal("server keepalive did not renew read deadline")
	}
}

func testNetwork() Network {
	return Network{ID: "test", Name: "Test", Host: "irc.example.org", Port: 6697, Account: "42", Nick: "Alice", Channels: []string{"#room"}}
}

func TestUncertainSendCanReadSameReceiptWithoutResending(t *testing.T) {
	s, err := New([]Network{testNetwork()})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	client, peer := net.Pipe()
	_ = peer.Close()
	ctx, cancel := context.WithCancel(s.ctx)
	s.sessions["test"] = &Session{network: testNetwork(), conn: client, ctx: ctx, cancel: cancel, epoch: "epoch", state: "connected", receipts: map[string]Message{}}
	first, err := s.Send("42", "test", "epoch", "once", "Bob", "hello")
	if err != nil || first.Delivery != "uncertain" {
		t.Fatal(first, err)
	}
	second, err := s.Send("42", "test", "epoch", "once", "Bob", "hello")
	if err != nil || second != first {
		t.Fatal("uncertain receipt not recoverable", second, err)
	}
	if _, err := s.Send("42", "test", "epoch", "twice", "Bob", "hello"); err == nil {
		t.Fatal("new send on ended session accepted")
	}
	if _, err := s.Send("42", "test", "epoch", "once", "Bob", "changed"); err == nil {
		t.Fatal("receipt content changed")
	}
}
func TestConfigurationRejectsProxyAndPrivateTargets(t *testing.T) {
	for _, change := range []func(*Network){
		func(n *Network) { n.Host = "127.0.0.1" },
		func(n *Network) { n.Host = "irc.example.org/path" },
		func(n *Network) { n.Nick = "bad\r\nPASS x" },
		func(n *Network) { n.Channels = []string{"#room", "#ROOM"} },
		func(n *Network) { n.PasswordEnv = "MISSING_IRC_TEST_PASSWORD" },
	} {
		n := testNetwork()
		change(&n)
		if s, e := New([]Network{n}); e == nil {
			s.Close()
			t.Fatal("unsafe configuration")
		}
	}
	for _, ip := range []string{"127.0.0.1", "10.0.0.1", "::1", "169.254.169.254", "100.64.0.1", "192.0.2.1"} {
		if publicIP(net.ParseIP(ip)) {
			t.Fatal("non-public address", ip)
		}
	}
}
func TestRegistrationPrivateIsolationAndSubmittedEcho(t *testing.T) {
	s, err := New([]Network{testNetwork()})
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	client, server := net.Pipe()
	defer func() { _ = server.Close() }()
	s.dial = func(context.Context, Network) (net.Conn, error) { return client, nil }
	lines := make(chan string, 16)
	go func() {
		reader := bufio.NewReader(server)
		for {
			line, e := reader.ReadString('\n')
			if e != nil {
				return
			}
			lines <- strings.TrimSpace(line)
		}
	}()
	view, err := s.Connect(context.Background(), "42", "test", "connect-one")
	if err != nil {
		t.Fatal(err)
	}
	if a, b := <-lines, <-lines; !strings.HasPrefix(a, "NICK Alice") || !strings.HasPrefix(b, "USER Alice ") {
		t.Fatal(a, b)
	}
	_, _ = server.Write([]byte(":server 001 Alice :Welcome\r\n"))
	if line := <-lines; line != "JOIN #room" {
		t.Fatal(line)
	}
	_, _ = server.Write([]byte(":Bob!u@host PRIVMSG Alice :private message\r\n:Bob!u@host PRIVMSG #room :public message\r\nPING :one\r\n"))
	if line := <-lines; line != "PONG :one" {
		t.Fatal(line)
	}
	deadline := time.Now().Add(time.Second)
	for {
		v, _ := s.Read("42", "test")
		if len(v.Messages) == 2 {
			if v.Messages[0].Target != "Bob" || v.Messages[1].Target != "#room" {
				t.Fatal(v.Messages)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("missing messages")
		}
		time.Sleep(time.Millisecond)
	}
	if _, err = s.Read("43", "test"); err == nil {
		t.Fatal("private network crossed account")
	}
	receipt, err := s.Send("42", "test", view.Epoch, "send-one", "#room", "hello")
	if err != nil || receipt.Delivery != "submitted" {
		t.Fatal(receipt, err)
	}
	if line := <-lines; line != "PRIVMSG #room :hello" {
		t.Fatal(line)
	}
	if _, err = s.Send("42", "test", view.Epoch, "send-one", "#room", "hello"); err != nil {
		t.Fatal(err)
	}
	select {
	case line := <-lines:
		t.Fatal("duplicate send", line)
	case <-time.After(20 * time.Millisecond):
	}
	_, _ = server.Write([]byte(":Alice!u@host PRIVMSG #room :hello\r\n"))
	v, _ := s.Read("42", "test")
	for len(v.Messages) < 3 || v.Messages[2].Delivery != "observed" {
		if time.Now().After(deadline) {
			t.Fatal("echo not reconciled")
		}
		time.Sleep(time.Millisecond)
		v, _ = s.Read("42", "test")
	}
	if len(v.Messages) != 3 {
		t.Fatal("echo duplicated")
	}
	for _, target := range []string{"#unapproved", "Bob,Other", "Bob\r\nQUIT"} {
		if _, err = s.Send("42", "test", view.Epoch, "bad", target, "text"); err == nil {
			t.Fatal("unsafe target", target)
		}
	}
}
func TestHTTPAuthorizationAndStrictBodies(t *testing.T) {
	s, e := New([]Network{testNetwork()})
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	mux := http.NewServeMux()
	s.Register(mux, func(w http.ResponseWriter, r *http.Request, write bool) (string, bool) {
		if r.Header.Get("X-Account-ID") != "42" || write && r.Header.Get("X-CSRF-Token") != "test" {
			http.Error(w, "refused", http.StatusForbidden)
			return "", false
		}
		return "42", true
	})
	r := httptest.NewRequest("GET", "/api/irc/networks", nil)
	r.Header.Set("X-Account-ID", "42")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 200 || strings.Contains(w.Body.String(), "password") {
		t.Fatal(w.Code, w.Body.String())
	}
	var v any
	if json.Unmarshal(w.Body.Bytes(), &v) != nil {
		t.Fatal("invalid config")
	}
	r = httptest.NewRequest("POST", "/api/irc/action", strings.NewReader(`{"kind":"connect","network":"test","host":"10.0.0.1"}`))
	r.Header.Set("X-Account-ID", "42")
	r.Header.Set("X-CSRF-Token", "test")
	r.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 400 {
		t.Fatal("arbitrary host accepted", w.Code)
	}
}
