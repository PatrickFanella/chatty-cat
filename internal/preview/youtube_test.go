package preview

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func TestYouTubePreview(t *testing.T) {
	calls := 0
	s := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.Host != "www.youtube.com" || r.URL.Path != "/oembed" || r.URL.Query().Get("url") != "https://www.youtube.com/watch?v=abcdefghijk" || r.URL.Query().Get("format") != "json" {
			t.Fatal(r.URL)
		}
		return response(r, `{"title":"<script>video</script>","author_name":"Alice","provider_name":"YouTube","type":"video","thumbnail_url":"https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg","html":"<script>unsafe</script>"}`, "application/json"), nil
	})})
	defer s.Close()
	card, err := s.Load(context.Background(), "https://youtu.be/abcdefghijk?t=90")
	if err != nil || card.Site != "YouTube" || card.Title != "<script>video</script>" || card.Author != "Alice" || card.Description != "by Alice" || card.Image == "" {
		t.Fatal(card, err)
	}
	if _, err := s.Load(context.Background(), card.URL); err != nil || calls != 1 {
		t.Fatal(err, calls)
	}
	for _, raw := range []string{"https://music.youtube.com/watch?v=abcdefghijk", "https://youtube.com/live/abcdefghijk", "https://www.youtube-nocookie.com/embed/abcdefghijk"} {
		u, _ := url.Parse(raw)
		if youtubeID(u) != "abcdefghijk" {
			t.Fatal(raw)
		}
	}
	for _, raw := range []string{"https://youtube.com.evil.test/watch?v=abcdefghijk", "https://youtube.com/channel/abcdefghijk", "https://youtu.be/abcdefghijk/other", "https://youtube.com/watch?v=bad"} {
		u, _ := url.Parse(raw)
		if youtubeID(u) != "" {
			t.Fatal(raw)
		}
	}
}
func TestYouTubeFailures(t *testing.T) {
	for _, body := range []string{`{`, `{"type":"video","provider_name":"YouTube","title":""}`, `{"type":"rich","provider_name":"YouTube","title":"bad"}`, `{"type":"video","provider_name":"Other","title":"bad"}`, strings.Repeat("x", 128*1024+1)} {
		s := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) { return response(r, body, "application/json"), nil })})
		if _, err := s.Load(context.Background(), "https://youtu.be/abcdefghijk"); err == nil {
			t.Fatal("accepted malformed body")
		}
		s.Close()
	}
}
