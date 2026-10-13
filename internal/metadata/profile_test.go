package metadata

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProfile(t *testing.T) {
	body := `[{"id":"100","login":"alice","displayName":"Alice","bio":"<script>text</script>","logo":"https://example.com/avatar.png","chatColor":"#123456","createdAt":"2020-01-01T00:00:00Z","followers":123,"roles":{"isPartner":true}}]`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("login") != "alice" {
			t.Error(r.URL)
		}
		_, _ = w.Write([]byte(body))
	}))
	defer server.Close()
	service := New(server.Client(), Endpoints{IVR: server.URL})
	profile, err := service.Profile(context.Background(), "alice")
	if err != nil || profile.ID != "100" || profile.Login != "alice" || profile.Name != "Alice" || !profile.Partner || profile.Followers == nil || *profile.Followers != 123 || profile.Created == "" {
		t.Fatal(profile, err)
	}
	if _, err := service.Profile(context.Background(), "bad!"); err == nil {
		t.Fatal("invalid login accepted")
	}
	for _, invalid := range []string{`[]`, `{}`, `[{"login":"other"}]`, ``} {
		body = invalid
		service = New(server.Client(), Endpoints{IVR: server.URL})
		if _, err := service.Profile(context.Background(), "alice"); err == nil {
			t.Fatal(invalid)
		}
	}
	body = `[{"login":"alice","logo":"javascript:evil","chatColor":"#badxxx","followers":-1,"createdAt":"bad"}]`
	service = New(server.Client(), Endpoints{IVR: server.URL})
	profile, err = service.Profile(context.Background(), "alice")
	if err != nil || profile.Image != "" || profile.Color != "" || profile.Followers != nil || profile.Created != "" || profile.Name != "alice" {
		t.Fatal(profile, err)
	}
}
