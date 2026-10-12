package preview

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestTwitchClipAndVideoMetadata(t *testing.T) {
	for _, test := range []struct{ target, path, body, site string }{
		{"https://clips.twitch.tv/Clip-ID", "/clips?id=Clip-ID", `{"data":[{"id":"Clip-ID","title":"Clip title","broadcaster_name":"Channel","creator_name":"Creator","view_count":1234,"duration":25.5,"created_at":"2026-10-11T12:00:00Z","thumbnail_url":"https://static-cdn.jtvnw.net/clip.jpg"}]}`, "Twitch clip"},
		{"https://www.twitch.tv/videos/123", "/videos?id=123", `{"data":[{"id":"123","title":"VOD title","user_name":"Channel","view_count":10,"duration":"2h3m","thumbnail_url":"https://static-cdn.jtvnw.net/vod-%{width}x%{height}.jpg"}]}`, "Twitch VOD"},
	} {
		t.Run(test.site, func(t *testing.T) {
			calls := 0
			s := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
				t.Fatal("unexpected public web request")
				return nil, nil
			})}, func(_ context.Context, path string) ([]byte, error) {
				calls++
				if path != test.path {
					t.Fatalf("unexpected credential path %q", path)
				}
				return []byte(test.body), nil
			})
			defer s.Close()
			card, err := s.Load(context.Background(), test.target)
			if err != nil || card.Site != test.site || !strings.Contains(card.Description, "views") {
				t.Fatalf("card %+v error %v", card, err)
			}
			if strings.Contains(card.Image, "%{") {
				t.Fatal("unresolved thumbnail geometry")
			}
			_, _ = s.Load(context.Background(), test.target)
			if calls != 1 {
				t.Fatal("uncached metadata")
			}
		})
	}
}
func TestTwitchChannelMetadata(t *testing.T) {
	s := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://api.ivr.fi/v2/twitch/user?login=one" {
			t.Fatal(r.URL)
		}
		return response(r, `[{"login":"one","displayName":"One","bio":"Bio","followers":50,"stream":{"title":"Live title","viewersCount":100,"game":{"displayName":"Game"}},"roles":{"isPartner":true}}]`, "application/json"), nil
	})})
	defer s.Close()
	card, err := s.Load(context.Background(), "https://www.twitch.tv/one")
	if err != nil || card.Title != "One" || !strings.Contains(card.Description, "100 viewers") || !strings.Contains(card.Description, "partner") {
		t.Fatalf("%+v %v", card, err)
	}
}
