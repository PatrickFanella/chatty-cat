package server

import (
	"encoding/json"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/providerservices"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOptionalProviderConfigurationAndRefreshGate(t *testing.T) {
	for _, providers := range [][]providerservices.Provider{nil, {providerservices.SevenTV, providerservices.BTTV}} {
		app := New(Config{ProviderServices: providers})
		handler := app.Handler()
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", "/api/provider-services/config", nil))
		var data struct {
			Providers                               []string `json:"providers"`
			MaxChannels, MaxSockets, RefreshSeconds int
		}
		if json.Unmarshal(response.Body.Bytes(), &data) != nil || response.Header().Get("Cache-Control") != "no-store" || len(data.Providers) != len(providers) || data.MaxChannels != 24 || data.MaxSockets != 3 || data.RefreshSeconds != 30 {
			t.Fatal("invalid optional service capabilities")
		}
		app.Close()
	}
	app := New(Config{})
	defer app.Close()
	for _, test := range []struct {
		query  string
		status int
	}{{"refresh=7TV", http.StatusForbidden}, {"refresh=BTTV", http.StatusForbidden}, {"refresh=unknown", http.StatusBadRequest}, {"refresh=7TV&refresh=BTTV", http.StatusBadRequest}, {"refresh=7TV&url=https://other.example", http.StatusBadRequest}} {
		response := httptest.NewRecorder()
		app.Handler().ServeHTTP(response, httptest.NewRequest("GET", "/api/channels/one?"+test.query, nil))
		if response.Code != test.status {
			t.Fatal("provider gate", test.query, response.Code)
		}
	}
}
