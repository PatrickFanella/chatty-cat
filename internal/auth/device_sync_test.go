package auth

import (
	"encoding/json"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/devicesync"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func syncTestDocument() devicesync.Document {
	return devicesync.Document{Format: "chatty-cat-device-sync", Version: 1, Workspaces: []devicesync.Workspace{{ID: "one", Name: "One", Channels: []string{"room"}, Target: "room", Focus: "log", Settings: devicesync.Settings{Version: 1, Display: map[string]any{}, Extras: map[string]any{}}}}}
}
func TestDeviceSyncUsesRealAccountCSRFAndCASBoundaries(t *testing.T) {
	f := setup(t)
	alice, csrfAlice := f.signin(t)
	f.mode.Store(6)
	bob, csrfBob := f.signin(t)
	store, err := devicesync.New(devicesync.Config{Directory: filepath.Join(t.TempDir(), "sync")})
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	}()
	mux := http.NewServeMux()
	store.Register(mux, f.service.StorageAccount)
	body, _ := json.Marshal(map[string]any{"requestID": "request-one", "document": syncTestDocument()})
	request := func(method, account, token, revision string, cookies []*http.Cookie, data string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "https://chat.subcult.tv/api/sync", strings.NewReader(data))
		r.Header.Set("Origin", "https://chat.subcult.tv")
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Account-ID", account)
		r.Header.Set("X-CSRF-Token", token)
		r.Header.Set("If-Match", revision)
		for _, cookie := range cookies {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		return w
	}
	for _, tc := range []struct {
		account, token string
		cookies        []*http.Cookie
		want           int
	}{{"43", csrfAlice, alice, 403}, {"42", csrfBob, alice, 403}, {"42", "", alice, 403}, {"42", csrfAlice, nil, 401}} {
		if got := request("PUT", tc.account, tc.token, `"0"`, tc.cookies, string(body)); got.Code != tc.want {
			t.Fatal("write authorization", got.Code, tc.want)
		}
	}
	written := request("PUT", "42", csrfAlice, `"0"`, alice, string(body))
	if written.Code != 200 {
		t.Fatal("valid sync write", written.Code)
	}
	if got := request("GET", "43", "", "", bob, ""); got.Code != 200 || strings.Contains(got.Body.String(), `"name":"One"`) {
		t.Fatal("cross-account snapshot leak")
	}
	if got := request("GET", "43", "", "", alice, ""); got.Code != 403 {
		t.Fatal("cross-account read accepted")
	}
	if got := request("PUT", "42", csrfAlice, `"0"`, alice, strings.Replace(string(body), "request-one", "request-two", 1)); got.Code != 409 {
		t.Fatal("stale revision overwrote", got.Code)
	}
	deleted := request("DELETE", "42", csrfAlice, written.Header().Get("ETag"), alice, `{"requestID":"request-delete"}`)
	if deleted.Code != 200 {
		t.Fatal(deleted.Code)
	}
	if got := request("PUT", "42", csrfAlice, `"0"`, alice, strings.Replace(string(body), "request-one", "request-old", 1)); got.Code != 409 {
		t.Fatal("deleted snapshot resurrected")
	}
}
func TestDeviceSyncRechecksLogoutAfterBodyRead(t *testing.T) {
	f := setup(t)
	cookies, csrf := f.signin(t)
	store, err := devicesync.New(devicesync.Config{Directory: filepath.Join(t.TempDir(), "sync")})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = store.Close() }()
	mux := http.NewServeMux()
	store.Register(mux, f.service.StorageAccount)
	body, _ := json.Marshal(map[string]any{"requestID": "request-one", "document": syncTestDocument()})
	gate := &gatedProfileBody{reader: strings.NewReader(string(body)), entered: make(chan struct{}), resume: make(chan struct{})}
	r := httptest.NewRequest("PUT", "https://chat.subcult.tv/api/sync", gate)
	r.AddCookie(cookies[0])
	r.Header.Set("Origin", "https://chat.subcult.tv")
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Account-ID", "42")
	r.Header.Set("X-CSRF-Token", csrf)
	r.Header.Set("If-Match", `"0"`)
	rec := httptest.NewRecorder()
	done := make(chan struct{})
	go func() { defer close(done); mux.ServeHTTP(rec, r) }()
	<-gate.entered
	if f.request("POST", "/api/auth/logout", cookies, map[string]string{"Origin": "https://chat.subcult.tv", "X-CSRF-Token": csrf}).Code != 204 {
		t.Fatal("logout failed")
	}
	close(gate.resume)
	<-done
	if rec.Code != 401 || store.Read("42").Document != nil {
		t.Fatal("revoked sync write committed")
	}
}
