package cosmetics

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestConfiguredCatalogBoundariesAndCache(t *testing.T) {
	var calls atomic.Int32
	host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		switch r.URL.Path {
		case "/ffz":
			_, _ = w.Write([]byte(`{"badges":[{"id":1,"title":"Developer","urls":{"2":"//cdn.frankerfacez.com/badge.png"}}],"users":{"1":[42,"43"]}}`))
		case "/chatterino":
			_, _ = w.Write([]byte(`{"badges":[{"tooltip":"Supporter","image2":"https://cdn.chatterino.com/badge.png","users":["42"]}]}`))
		default:
			t.Error(r.URL.Path)
		}
	}))
	defer host.Close()
	s, err := New(Config{Providers: "FFZ,Chatterino", Endpoints: map[string]string{"FFZ": host.URL + "/ffz", "Chatterino": host.URL + "/chatterino"}})
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.Load(context.Background(), []string{"42"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Badges["42"]) != 2 || len(got.Badges["43"]) != 0 || got.Badges["42"][0].Provider != "FFZ" {
		t.Fatalf("result %+v", got)
	}
	if _, err = s.Load(context.Background(), []string{"43"}); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 2 {
		t.Fatal("catalog reads were not cached")
	}
	if _, err = s.Load(context.Background(), []string{"../42"}); err == nil {
		t.Fatal("invalid identity accepted")
	}
}
func TestDisabledAndMalformedCatalogs(t *testing.T) {
	s, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.Load(context.Background(), []string{"42"})
	if err != nil || len(got.Providers) != 0 || len(got.Badges) != 0 {
		t.Fatal("disabled service performed work")
	}
	if _, err = New(Config{Providers: "unknown"}); err == nil {
		t.Fatal("unknown provider accepted")
	}
	for _, data := range []string{`{"badges":[{"id":1,"title":"x","urls":{"2":"javascript:bad"}}],"users":{"1":["42"]}}`, `{"badges":[],"users":{"1":["42"]}}`, `{"badges":{},"users":{}}`} {
		if _, err = parseCatalog("FFZ", []byte(data)); err == nil {
			t.Fatalf("bad catalog accepted %s", data)
		}
	}
}

func TestRedirectsAndOversizedCatalogsFailClosed(t *testing.T) {
	var targetCalls atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { targetCalls.Add(1) }))
	defer target.Close()
	host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/redirect" {
			http.Redirect(w, r, target.URL, http.StatusFound)
			return
		}
		_, _ = w.Write([]byte(strings.Repeat("x", catalogLimit+1)))
	}))
	defer host.Close()
	for _, path := range []string{"/redirect", "/large"} {
		s, err := New(Config{Providers: "FFZ", Endpoints: map[string]string{"FFZ": host.URL + path}})
		if err != nil {
			t.Fatal(err)
		}
		result, err := s.Load(context.Background(), []string{"42"})
		if err != nil || len(result.Errors) != 1 || len(result.Badges) != 0 {
			t.Fatalf("failure not isolated: %+v %v", result, err)
		}
		s.Close()
	}
	if targetCalls.Load() != 0 {
		t.Fatal("provider redirect followed")
	}
}
func TestHandlerFiltersIDsAndLeavesCatalogsOff(t *testing.T) {
	s, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	s.Register(mux)
	for _, path := range []string{"/api/cosmetics/config", "/api/cosmetics?users=42"} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "no-store" {
			t.Fatal(rec.Code, rec.Body.String())
		}
		if strings.Contains(rec.Body.String(), "https:") {
			t.Fatal("disabled service exposed a provider URL")
		}
	}
}

func TestExactNumericIDs(t *testing.T) {
	data := []byte(`{"badges":[{"id":1,"title":"Developer","urls":{"1":"https://cdn.frankerfacez.com/badge.png"}}],"users":{"1":[9007199254740993]}}`)
	badges, err := parseCatalog("FFZ", data)
	if err != nil || len(badges["9007199254740993"]) != 1 {
		t.Fatal("numeric ID lost precision", err)
	}
	for _, value := range []string{"1.5", "-1", "1e3", "true"} {
		if _, err = parseCatalog("FFZ", []byte(strings.ReplaceAll(string(data), "9007199254740993", value))); err == nil {
			t.Fatal("invalid numeric ID accepted")
		}
	}
}

func TestChatterinoSkipsMalformedAssignmentsWithoutDiscardingValidBadges(t *testing.T) {
	data := []byte(`{"badges":[{"tooltip":"Supporter","image2":"https://fourtf.com/badge.png","users":["42","not-a-twitch-id","",9007199254740993,true,null,{},1.5]}]}`)
	badges, err := parseCatalog("Chatterino", data)
	if err != nil || len(badges) != 2 || len(badges["42"]) != 1 || len(badges["9007199254740993"]) != 1 {
		t.Fatalf("valid assignments discarded: %d users, %v", len(badges), err)
	}
	large := strings.Replace(string(data), `"42","not-a-twitch-id","",9007199254740993,true,null,{},1.5`, strings.Repeat(`"invalid",`, 100000)+`"42"`, 1)
	if _, err := parseCatalog("Chatterino", []byte(large)); err == nil {
		t.Fatal("malformed assignments bypassed the catalog count limit")
	}
}
