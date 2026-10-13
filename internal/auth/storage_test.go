package auth

import (
	"git.subcult.tv/subculture-collective/chatty-cat/internal/uploads"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStorageAccountGuardsSessionOriginCSRFAndIdentity(t *testing.T) {
	f := setup(t)
	cookies, csrf := f.signin(t)
	for _, tc := range []struct {
		name, origin, token, account string
		cookie, write, ok            bool
	}{
		{"valid", "https://chat.subcult.tv", csrf, "42", true, true, true}, {"missing CSRF", "https://chat.subcult.tv", "", "42", true, true, false}, {"wrong origin", "https://evil.test", csrf, "42", true, true, false}, {"wrong account", "https://chat.subcult.tv", csrf, "43", true, true, false}, {"anonymous", "https://chat.subcult.tv", csrf, "42", false, true, false}, {"read", "", "", "42", true, false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "https://chat.subcult.tv/api/uploads", nil)
			if tc.cookie {
				r.AddCookie(cookies[0])
			}
			r.Header.Set("Origin", tc.origin)
			r.Header.Set("X-CSRF-Token", tc.token)
			r.Header.Set("X-Account-ID", tc.account)
			w := httptest.NewRecorder()
			account, ok := f.service.StorageAccount(w, r, tc.write)
			if ok != tc.ok || ok && account != "42" {
				t.Fatal(account, ok, w.Code)
			}
		})
	}
}

func TestStorageUploadDiscardsRevokedSessionAfterBodyRead(t *testing.T) {
	f := setup(t)
	cookies, csrf := f.signin(t)
	store, err := uploads.New(uploads.Config{Directory: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	mux := http.NewServeMux()
	store.Register(mux, f.service.StorageAccount)
	gate := &gatedProfileBody{reader: strings.NewReader("not-an-image"), entered: make(chan struct{}), resume: make(chan struct{})}
	r := httptest.NewRequest("POST", "https://chat.subcult.tv/api/uploads/"+strings.Repeat("a", 32), gate)
	r.AddCookie(cookies[0])
	r.Header.Set("Origin", "https://chat.subcult.tv")
	r.Header.Set("X-CSRF-Token", csrf)
	r.Header.Set("X-Account-ID", "42")
	w := httptest.NewRecorder()
	done := make(chan struct{})
	go func() { defer close(done); mux.ServeHTTP(w, r) }()
	<-gate.entered
	res := f.request("POST", "/api/auth/logout", cookies, map[string]string{"Origin": "https://chat.subcult.tv", "X-CSRF-Token": csrf})
	if res.Code != 204 {
		t.Fatal(res.Code)
	}
	close(gate.resume)
	<-done
	if w.Code != 401 || len(store.List("42")) != 0 {
		t.Fatal("revoked upload committed", w.Code)
	}
}
