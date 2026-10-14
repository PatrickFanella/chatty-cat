package ircrelay

import (
	"bufio"
	"context"
	"crypto/tls"
	"crypto/x509"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestControlledTLSRegistrationAndMessage(t *testing.T) {
	reference := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer reference.Close()
	roots := x509.NewCertPool()
	roots.AddCert(reference.Certificate())
	tcp, e := net.Listen("tcp", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	listener := tls.NewListener(tcp, &tls.Config{MinVersion: tls.VersionTLS12, Certificates: reference.TLS.Certificates})
	defer func() { _ = listener.Close() }()
	finished := make(chan error, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			finished <- err
			return
		}
		defer func() { _ = conn.Close() }()
		_ = conn.SetDeadline(time.Now().Add(3 * time.Second))
		reader := bufio.NewReader(conn)
		for range 2 {
			if _, err = reader.ReadString('\n'); err != nil {
				finished <- err
				return
			}
		}
		_, err = conn.Write([]byte(":server 001 Alice :Welcome\r\n"))
		if err == nil {
			_, err = reader.ReadString('\n')
		}
		if err == nil {
			_, err = conn.Write([]byte(":Bob!user@host PRIVMSG Alice :TLS private body\r\n"))
		}
		if err == nil {
			_, err = reader.ReadString('\n')
		}
		finished <- err
	}()
	s, e := New([]Network{testNetwork()})
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	s.dial = func(ctx context.Context, _ Network) (net.Conn, error) {
		return (&tls.Dialer{NetDialer: &net.Dialer{Timeout: time.Second}, Config: &tls.Config{MinVersion: tls.VersionTLS12, ServerName: "example.com", RootCAs: roots}}).DialContext(ctx, "tcp", listener.Addr().String())
	}
	v, e := s.Connect(context.Background(), "42", "test", "tls-test")
	if e != nil {
		t.Fatal(e)
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		v, e = s.Read("42", "test")
		if e != nil {
			t.Fatal(e)
		}
		if len(v.Messages) > 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("TLS fixture did not deliver")
		}
		time.Sleep(time.Millisecond)
	}
	if v.Messages[0].Text != "TLS private body" || v.Messages[0].Target != "Bob" {
		t.Fatal(v.Messages)
	}
	_, e = s.Send("42", "test", v.Epoch, "send-tls", "Bob", "reply")
	if e != nil {
		t.Fatal(e)
	}
	if e = <-finished; e != nil && !strings.Contains(e.Error(), "closed") {
		t.Fatal(e)
	}
}
