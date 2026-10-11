package server

import (
	"encoding/json"
	"github.com/PatrickFanella/hasanabi.neocities.org/rebuild/internal/metadata"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPublicProfileEndpoint(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("login") == "missing" {
			http.Error(w, "missing", 404)
			return
		}
		_, _ = w.Write([]byte(`[{"login":"alice","displayName":"Alice","bio":"public biography","logo":"https://example.com/image.png","followers":12,"access_token":"never forward","extra":"never forward"}]`))
	}))
	defer upstream.Close()
	service := New(Config{Assets: t.TempDir(), MetadataEndpoints: metadata.Endpoints{IVR: upstream.URL}})
	defer service.Close()
	handler := service.Handler()
	get := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w
	}
	response := get("/api/users/alice")
	if response.Code != 200 {
		t.Fatal(response.Code, response.Body.String())
	}
	var profile map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &profile); err != nil || profile["login"] != "alice" || profile["bio"] != "public biography" || profile["access_token"] != nil || profile["extra"] != nil {
		t.Fatal(profile, err)
	}
	if response = get("/api/users/bad!"); response.Code != 400 {
		t.Fatal(response.Code)
	}
	if response = get("/api/users/missing"); response.Code != 503 {
		t.Fatal(response.Code)
	}
	for range cap(service.metadataSlots) {
		service.metadataSlots <- struct{}{}
	}
	if response = get("/api/users/alice"); response.Code != 503 {
		t.Fatal(response.Code)
	}
	for range cap(service.metadataSlots) {
		<-service.metadataSlots
	}
	service.Close()
	if response = get("/api/users/alice"); response.Code != 503 {
		t.Fatal(response.Code)
	}
}
