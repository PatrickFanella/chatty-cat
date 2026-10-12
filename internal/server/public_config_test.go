package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPublicConfiguration(t *testing.T) {
	for _, key := range []string{"", "test-public-browser-key"} {
		t.Run(key, func(t *testing.T) {
			app := New(Config{GiphyAPIKey: key})
			defer app.Close()
			response := httptest.NewRecorder()
			app.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/public-config", nil))
			if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("status or cache policy: %d", response.Code)
			}
			var data map[string]json.RawMessage
			if err := json.Unmarshal(response.Body.Bytes(), &data); err != nil {
				t.Fatal(err)
			}
			var got string
			if err := json.Unmarshal(data["giphyApiKey"], &got); err != nil {
				t.Fatal(err)
			}
			if len(data) != 4 || got != key || string(data["paneChannels"]) != "6" || string(data["workspaceChannels"]) != "12" || string(data["subscriptions"]) != "96" {
				t.Fatal("unexpected public configuration fields")
			}
		})
	}
}
