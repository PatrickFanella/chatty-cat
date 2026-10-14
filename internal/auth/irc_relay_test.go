package auth

import (
	"git.subcult.tv/subculture-collective/chatty-cat/internal/ircrelay"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOwnerIRCUsesSessionAccountAndCSRFWithoutTwitchScopes(t *testing.T) {
	f := setup(t)
	alice, csrf := f.signin(t)
	f.mode.Store(6)
	bob, _ := f.signin(t)
	relay, e := ircrelay.New([]ircrelay.Network{{ID: "test", Name: "Test", Host: "irc.example.org", Port: 6697, Account: "42", Nick: "Alice", Channels: []string{"#room"}}})
	if e != nil {
		t.Fatal(e)
	}
	defer relay.Close()
	mux := http.NewServeMux()
	relay.Register(mux, f.service.StorageAccount)
	request := func(method, account, token string, cookies []*http.Cookie, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "https://chat.subcult.tv/api/irc/networks", strings.NewReader(body))
		if method == "POST" {
			r = httptest.NewRequest(method, "https://chat.subcult.tv/api/irc/action", strings.NewReader(body))
		}
		r.Header.Set("Origin", "https://chat.subcult.tv")
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Account-ID", account)
		r.Header.Set("X-CSRF-Token", token)
		for _, c := range cookies {
			r.AddCookie(c)
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	if w := request("GET", "42", "", alice, ""); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "Alice") {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request("GET", "43", "", bob, ""); w.Code != http.StatusOK || strings.Contains(w.Body.String(), "Alice") {
		t.Fatal("other account network leaked")
	}
	if w := request("GET", "43", "", alice, ""); w.Code != http.StatusForbidden {
		t.Fatal("cross-account header accepted")
	}
	if w := request("POST", "42", "", alice, `{"kind":"connect","network":"test","requestID":"one"}`); w.Code != http.StatusForbidden {
		t.Fatal("CSRF bypass")
	}
	if w := request("POST", "42", csrf, alice, `{"kind":"connect","network":"test","requestID":"one","host":"10.0.0.1"}`); w.Code != http.StatusBadRequest {
		t.Fatal("arbitrary host")
	}
}
