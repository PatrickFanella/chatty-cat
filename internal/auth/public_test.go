package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
)

func TestPublicAppReads(t *testing.T) {
	var grants atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			grants.Add(1)
			if err := r.ParseForm(); err != nil {
				t.Error(err)
			}
			if r.PostForm.Get("grant_type") != "client_credentials" || r.PostForm.Get("client_secret") != "secret" {
				t.Error("missing server credential grant")
			}
			_, _ = w.Write([]byte(`{"access_token":"private-app-token","expires_in":3600,"token_type":"bearer"}`))
		case "/validate":
			if r.Header.Get("Authorization") != "OAuth private-app-token" {
				t.Error("missing validation credential")
			}
			_, _ = w.Write([]byte(`{"client_id":"client","expires_in":3600}`))
		case "/helix/videos":
			if r.Header.Get("Authorization") != "Bearer private-app-token" || r.Header.Get("Client-Id") != "client" {
				t.Error("missing API credential")
			}
			_, _ = w.Write([]byte(`{"data":[]}`))
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()
	service, err := New(Config{ClientID: "client", ClientSecret: "secret", TokenURL: upstream.URL + "/token", ValidateURL: upstream.URL + "/validate", HelixURL: upstream.URL + "/helix"})
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			data, err := service.PublicRead(context.Background(), "/videos?user_id=123")
			if err != nil || string(data) != `{"data":[]}` {
				t.Errorf("public read %s %v", data, err)
			}
		}()
	}
	wg.Wait()
	if grants.Load() != 1 {
		t.Fatalf("grants=%d", grants.Load())
	}
	for _, path := range []string{"https://evil.test/users", "//evil.test/users", "/chat/messages", "/users#fragment"} {
		if _, err := service.PublicRead(context.Background(), path); err == nil {
			t.Fatalf("accepted %s", path)
		}
	}
}
func TestPublicCredentialFailuresAreBounded(t *testing.T) {
	for _, scenario := range []string{"token rejected", "client mismatch", "user token", "invalid validation", "API revoked"} {
		t.Run(scenario, func(t *testing.T) {
			var grants, reads atomic.Int32
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/token":
					grants.Add(1)
					if scenario == "token rejected" {
						http.Error(w, "rejected", 400)
						return
					}
					_, _ = w.Write([]byte(`{"access_token":"app","expires_in":3600,"token_type":"bearer"}`))
				case "/validate":
					switch scenario {
					case "client mismatch":
						_, _ = w.Write([]byte(`{"client_id":"other","expires_in":3600}`))
					case "user token":
						_, _ = w.Write([]byte(`{"client_id":"client","user_id":"someone","expires_in":3600}`))
					case "invalid validation":
						_, _ = w.Write([]byte(`not JSON`))
					default:
						_, _ = w.Write([]byte(`{"client_id":"client","expires_in":3600}`))
					}
				case "/helix/videos":
					reads.Add(1)
					http.Error(w, "revoked", http.StatusUnauthorized)
				default:
					http.NotFound(w, r)
				}
			}))
			defer upstream.Close()
			service, err := New(Config{ClientID: "client", ClientSecret: "secret", TokenURL: upstream.URL + "/token", ValidateURL: upstream.URL + "/validate", HelixURL: upstream.URL + "/helix"})
			if err != nil {
				t.Fatal(err)
			}
			defer service.Close()
			if _, err := service.PublicRead(context.Background(), "/videos"); err == nil {
				t.Fatal("accepted credential failure")
			}
			before := grants.Load()
			if _, err := service.PublicRead(context.Background(), "/videos"); err == nil {
				t.Fatal("accepted cooldown request")
			}
			if grants.Load() != before || before > 2 || reads.Load() > 2 {
				t.Fatalf("unbounded retry: grants=%d reads=%d", grants.Load(), reads.Load())
			}
		})
	}
}
func TestPublicReadRefreshesRejectedCredentialOnce(t *testing.T) {
	var grants, reads atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			grants.Add(1)
			_, _ = w.Write([]byte(`{"access_token":"app","expires_in":3600,"token_type":"bearer"}`))
		case "/validate":
			_, _ = w.Write([]byte(`{"client_id":"client","expires_in":3600}`))
		case "/helix/videos":
			if reads.Add(1) == 1 {
				http.Error(w, "revoked", http.StatusUnauthorized)
				return
			}
			_, _ = w.Write([]byte(`{"data":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()
	service, err := New(Config{ClientID: "client", ClientSecret: "secret", TokenURL: upstream.URL + "/token", ValidateURL: upstream.URL + "/validate", HelixURL: upstream.URL + "/helix"})
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()
	if _, err := service.PublicRead(context.Background(), "/videos"); err != nil {
		t.Fatal(err)
	}
	if grants.Load() != 2 || reads.Load() != 2 {
		t.Fatalf("grants %d reads %d", grants.Load(), reads.Load())
	}
	service.Close()
	if _, err := service.PublicRead(context.Background(), "/videos"); err == nil {
		t.Fatal("read after shutdown")
	}
}
