package auth

import (
	"io"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestProfileOAuthRequiresSelectedIdentityAndExplicitConsent(t *testing.T) {
	f := setup(t)
	res := f.request("GET", "/api/auth/login?account=43", nil, nil)
	u, err := url.Parse(res.Header().Get("Location"))
	if err != nil || u.Query().Get("force_verify") != "true" {
		t.Fatal("missing forced account consent")
	}
	result := f.request("GET", "/api/auth/callback?code=code&state="+u.Query().Get("state"), res.Result().Cookies(), nil)
	if result.Code != 303 || result.Header().Get("Location") != "/?auth=account-mismatch" || len(f.service.sessions) != 0 {
		t.Fatal("wrong account became active", result.Code, result.Header(), len(f.service.sessions))
	}
	f.mode.Store(6)
	res = f.request("GET", "/api/auth/login?account=43", nil, nil)
	u, _ = url.Parse(res.Header().Get("Location"))
	result = f.request("GET", "/api/auth/callback?code=code&state="+u.Query().Get("state"), res.Result().Cookies(), nil)
	if result.Code != 303 || result.Header().Get("Location") != "/" || len(f.service.sessions) != 1 {
		t.Fatal("selected account did not activate")
	}
	if bad := f.request("GET", "/api/auth/login?account=bad", nil, nil); bad.Code != 400 {
		t.Fatal("invalid account accepted")
	}
}

type gatedProfileBody struct {
	reader          io.Reader
	entered, resume chan struct{}
	started         bool
}

func (b *gatedProfileBody) Read(p []byte) (int, error) {
	if !b.started {
		b.started = true
		close(b.entered)
		<-b.resume
	}
	return b.reader.Read(p)
}
func TestProfileLogoutRejectsAnAlreadyLookedUpSend(t *testing.T) {
	f := setup(t)
	cookies, csrf := f.signin(t)
	gate := &gatedProfileBody{reader: strings.NewReader(`{"channel":"one","message":"public fixture","requestID":"1234567890123456"}`), entered: make(chan struct{}), resume: make(chan struct{})}
	req := httptest.NewRequest("POST", "https://chat.subcult.tv/api/chat/send", gate)
	req.AddCookie(cookies[0])
	req.Header.Set("Origin", "https://chat.subcult.tv")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", csrf)
	result := httptest.NewRecorder()
	finished := make(chan struct{})
	go func() { defer close(finished); f.handler.ServeHTTP(result, req) }()
	<-gate.entered
	logout := f.request("POST", "/api/auth/logout", cookies, map[string]string{"Origin": "https://chat.subcult.tv", "X-CSRF-Token": csrf})
	if logout.Code != 204 {
		t.Fatal("logout failed")
	}
	close(gate.resume)
	<-finished
	if result.Code != 401 || len(result.Result().Cookies()) != 0 {
		t.Fatal("stale send survived session change or cleared replacement cookie", result.Code, result.Header())
	}
}
