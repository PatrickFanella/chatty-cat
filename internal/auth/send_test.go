package auth

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type sendFixture struct {
	*fixture
	cookies        []*http.Cookie
	csrf           string
	calls, lookups atomic.Int32
	mode           atomic.Int32
}

func setupSend(t *testing.T) *sendFixture {
	t.Helper()
	f := &sendFixture{fixture: setup(t)}
	f.cookies, f.csrf = f.signin(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer access-secret" || r.Header.Get("Client-Id") != "client" {
			t.Error("missing user authorization")
		}
		if r.URL.Path == "/users" {
			f.lookups.Add(1)
			if r.URL.Query().Get("login") != "hasanabi" {
				t.Error("channel lookup mismatch")
			}
			if f.mode.Load() == 7 {
				if _, err := w.Write([]byte(`{"data":[]}`)); err != nil {
					t.Error(err)
				}
				return
			}
			if _, err := w.Write([]byte(`{"data":[{"id":"123","login":"hasanabi"}]}`)); err != nil {
				t.Error(err)
			}
			return
		}
		if r.URL.Path != "/chat/messages" || r.Method != "POST" {
			t.Error("wrong send route")
		}
		n := f.calls.Add(1)
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
		}
		if payload["sender_id"] != "42" || payload["broadcaster_id"] != "123" || payload["message"] == "" {
			t.Error("wrong sender/message payload")
		}
		for _, key := range []string{"client_secret", "for_source_only", "requestID"} {
			if _, exists := payload[key]; exists {
				t.Error("unexpected field", key)
			}
		}
		if payload["reply_parent_message_id"] != nil && payload["reply_parent_message_id"] != "parent-id" {
			t.Error("reply mismatch")
		}
		switch f.mode.Load() {
		case 1:
			if n == 1 {
				http.Error(w, "unauthorized secret", http.StatusUnauthorized)
				return
			}
		case 2:
			http.Error(w, "forbidden secret", http.StatusForbidden)
			return
		case 3:
			http.Error(w, "rate secret", http.StatusTooManyRequests)
			return
		case 4:
			http.Error(w, "server secret", http.StatusInternalServerError)
			return
		case 5:
			if _, err := w.Write([]byte(`{"data":[{"is_sent":false,"drop_reason":{"code":"blocked","message":"secret"}}]}`)); err != nil {
				t.Error(err)
			}
			return
		case 6:
			if _, err := w.Write([]byte(`{"data":[{"is_sent":true}]}`)); err != nil {
				t.Error(err)
			}
			return
		case 9:
			conn, _, err := w.(http.Hijacker).Hijack()
			if err != nil {
				t.Error(err)
				return
			}
			if err := conn.Close(); err != nil {
				t.Error(err)
			}
			return
		case 8:
			http.Error(w, "unauthorized secret", http.StatusUnauthorized)
			return
		}
		if _, err := w.Write([]byte(`{"data":[{"message_id":"sent-id","is_sent":true}]}`)); err != nil {
			t.Error(err)
		}
	}))
	t.Cleanup(upstream.Close)
	f.service.cfg.HelixURL = upstream.URL
	return f
}
func (f *sendFixture) post(t *testing.T, body string, cookies []*http.Cookie, origin, csrf string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "https://chat.subcult.tv/api/chat/send", strings.NewReader(body))
	req.Header.Set("Origin", origin)
	req.Header.Set("X-CSRF-Token", csrf)
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, req)
	if strings.Contains(w.Body.String(), "secret") {
		t.Error("upstream/credential leaked")
	}
	return w
}
func sendBody(text, id string) string {
	body, err := json.Marshal(sendInput{Channel: "hasanabi", Message: text, RequestID: id})
	if err != nil {
		panic(err)
	}
	return string(body)
}
func TestSendConfirmedAndReplay(t *testing.T) {
	f := setupSend(t)
	body := `{"channel":"hasanabi","message":"hello 😀","requestID":"request-1234567890","replyID":"parent-id"}`
	for i := 0; i < 2; i++ {
		w := f.post(t, body, f.cookies, f.service.origin, f.csrf)
		if w.Code != 200 || !strings.Contains(w.Body.String(), `"messageID":"sent-id"`) {
			t.Fatal(w.Code, w.Body)
		}
	}
	if f.calls.Load() != 1 {
		t.Fatal("duplicate posted")
	}
	w := f.post(t, strings.Replace(body, "hello", "changed", 1), f.cookies, f.service.origin, f.csrf)
	if w.Code != 409 {
		t.Fatal("id conflict accepted")
	}
	// A different request is locally throttled even when Twitch would accept it.
	if f.post(t, sendBody("again", "request-0987654321"), f.cookies, f.service.origin, f.csrf).Code != 429 {
		t.Fatal("rate guard missing")
	}
}
func TestSendAuthorizationAndInput(t *testing.T) {
	for _, tc := range []struct {
		name, body, origin, csrf string
		anonymous                bool
		code                     int
	}{
		{"anonymous", sendBody("hi", "request-1234567890"), "https://chat.subcult.tv", "", true, 401},
		{"origin", sendBody("hi", "request-1234567890"), "https://evil.test", "csrf", false, 403},
		{"csrf", sendBody("hi", "request-1234567890"), "https://chat.subcult.tv", "wrong", false, 403},
		{"empty", sendBody(" ", "request-1234567890"), "https://chat.subcult.tv", "use", false, 400},
		{"length", sendBody(strings.Repeat("😀", 501), "request-1234567890"), "https://chat.subcult.tv", "use", false, 400},
		{"newline", sendBody("a\nb", "request-1234567890"), "https://chat.subcult.tv", "use", false, 400},
		{"slash", sendBody(" /raid viewer", "request-1234567890"), "https://chat.subcult.tv", "use", false, 400},
		{"impersonation", `{"channel":"hasanabi","message":"hi","requestID":"request-1234567890","sender_id":"other"}`, "https://chat.subcult.tv", "use", false, 400},
		{"channel", `{"channel":"bad/path","message":"hi","requestID":"request-1234567890"}`, "https://chat.subcult.tv", "use", false, 400},
		{"multiple-json", sendBody("hi", "request-1234567890") + `{}`, "https://chat.subcult.tv", "use", false, 400},
		{"oversize", strings.Repeat("x", 9000), "https://chat.subcult.tv", "use", false, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := setupSend(t)
			cookies := f.cookies
			if tc.anonymous {
				cookies = nil
			}
			csrf := tc.csrf
			if csrf == "use" {
				csrf = f.csrf
			}
			w := f.post(t, tc.body, cookies, tc.origin, csrf)
			if w.Code != tc.code {
				t.Fatal(w.Code, w.Body)
			}
			if f.calls.Load() != 0 || f.lookups.Load() != 0 {
				t.Fatal("invalid request reached Twitch")
			}
		})
	}
	f := setupSend(t)
	if f.post(t, sendBody(strings.Repeat("😀", 500), "request-1234567890"), f.cookies, f.service.origin, f.csrf).Code != 200 {
		t.Fatal("codepoint boundary rejected")
	}
}
func TestSendUpstreamFailures(t *testing.T) {
	for _, tc := range []struct {
		mode      int32
		status    int
		uncertain bool
		calls     int32
	}{{1, 200, false, 2}, {2, 403, false, 1}, {3, 429, false, 1}, {4, 502, true, 1}, {5, 422, false, 1}, {6, 502, true, 1}, {7, 404, false, 0}, {8, 401, false, 2}, {9, 502, true, 1}} {
		t.Run(string(rune('0'+tc.mode)), func(t *testing.T) {
			f := setupSend(t)
			f.mode.Store(tc.mode)
			body := sendBody("hello", "request-1234567890")
			w := f.post(t, body, f.cookies, f.service.origin, f.csrf)
			if w.Code != tc.status {
				t.Fatal(w.Code, w.Body)
			}
			var result sendResult
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if result.Uncertain != tc.uncertain {
				t.Fatal("uncertainty mismatch")
			}
			if f.calls.Load() != tc.calls {
				t.Fatal("unexpected retry", f.calls.Load())
			}
			if tc.mode == 1 && f.tokenCalls.Load() != 2 {
				t.Fatal("missing refresh")
			}
			if tc.uncertain {
				w = f.post(t, body, f.cookies, f.service.origin, f.csrf)
				if w.Code != 502 || f.calls.Load() != tc.calls {
					t.Fatal("ambiguous send retried")
				}
			}
		})
	}
}
func TestReceiptBound(t *testing.T) {
	f := setupSend(t)
	key := sha256.Sum256([]byte(f.cookies[0].Value))
	p := f.service.sessions[key]
	for i := 0; i < 34; i++ {
		p.mu.Lock()
		p.lastSend = time.Time{}
		p.mu.Unlock()
		id := fmt.Sprintf("request-%016d", i)
		if w := f.post(t, sendBody("hello", id), f.cookies, f.service.origin, f.csrf); w.Code != 200 {
			t.Fatal(w.Code, w.Body)
		}
	}
	if len(p.receipts) != 32 || len(p.receiptOrder) != 32 {
		t.Fatal("unbounded receipts")
	}
}

func TestRefreshCannotChangeSender(t *testing.T) {
	f := setupSend(t)
	f.mode.Store(1)
	f.fixture.mode.Store(6)
	w := f.post(t, sendBody("hello", "request-1234567890"), f.cookies, f.service.origin, f.csrf)
	if w.Code != 401 || f.calls.Load() != 1 {
		t.Fatal("refreshed identity was used to post")
	}
}
func TestConcurrentReplay(t *testing.T) {
	f := setupSend(t)
	results := make(chan int, 2)
	for i := 0; i < 2; i++ {
		go func() {
			results <- f.post(t, sendBody("hello", "request-1234567890"), f.cookies, f.service.origin, f.csrf).Code
		}()
	}
	for i := 0; i < 2; i++ {
		if code := <-results; code != 200 {
			t.Fatal(code)
		}
	}
	if f.calls.Load() != 1 {
		t.Fatal("concurrent duplicate posted")
	}
}
