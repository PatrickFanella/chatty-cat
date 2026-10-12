package server

import (
	"context"
	"encoding/json"
	"errors"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/metadata"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestVerifiedVodEndpoint(t *testing.T) {
	service := New(Config{})
	service.metadata = metadata.New(nil, metadata.Endpoints{}, func(_ context.Context, path string) ([]byte, error) {
		if path == "/users?login=alice" {
			return []byte(`{"data":[{"id":"123","login":"alice"}]}`), nil
		}
		switch path {
		case "/videos?id=1":
			return []byte(`{"data":[{"id":"1","user_id":"123","created_at":"2026-10-10T12:00:00Z","duration":"2h","type":"archive","title":"Public","token":"secret"}]}`), nil
		case "/videos?id=2":
			return []byte(`{"data":[]}`), nil
		default:
			return nil, errors.New("secret upstream error")
		}
	})
	defer service.Close()
	handler := service.Handler()
	get := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w
	}
	response := get("/api/channels/alice/vod/1")
	var vod metadata.Vod
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &vod) != nil || vod.End != "2026-10-10T14:00:00Z" || response.Header().Get("Cache-Control") != "no-store" || strings.Contains(response.Body.String(), "secret") {
		t.Fatal(response.Code, response.Body.String())
	}
	for path, want := range map[string]int{"/api/channels/alice/vod/2": 404, "/api/channels/alice/vod/3": 503, "/api/channels/bad!/vod/1": 400, "/api/channels/alice/vod/bad!": 400} {
		if got := get(path); got.Code != want || strings.Contains(got.Body.String(), "secret") {
			t.Fatal(path, got.Code, got.Body.String())
		}
	}
	for range cap(service.metadataSlots) {
		service.metadataSlots <- struct{}{}
	}
	if get("/api/channels/alice/vod/1").Code != 503 {
		t.Fatal("capacity not bounded")
	}
	for range cap(service.metadataSlots) {
		<-service.metadataSlots
	}
	service.Close()
	if get("/api/channels/alice/vod/1").Code != 503 {
		t.Fatal("shutdown not respected")
	}
}
