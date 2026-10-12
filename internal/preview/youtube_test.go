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
		if r.URL.Path == "/watch" {
			return response(r, `<meta itemprop="interactionCount" content="1234"><meta itemprop="datePublished" content="2026-10-01">`, "text/html"), nil
		}
		if r.URL.Host != "www.youtube.com" || r.URL.Path != "/oembed" || r.URL.Query().Get("url") != "https://www.youtube.com/watch?v=abcdefghijk" || r.URL.Query().Get("format") != "json" {
			t.Fatal(r.URL)
		}
		return response(r, `{"title":"<script>video</script>","author_name":"Alice","provider_name":"YouTube","type":"video","thumbnail_url":"https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg","html":"<script>unsafe</script>"}`, "application/json"), nil
	})})
	defer s.Close()
	card, err := s.Load(context.Background(), "https://youtu.be/abcdefghijk?t=90")
	if err != nil || card.Site != "YouTube" || card.Title != "<script>video</script>" || card.Author != "Alice" || card.Description != "by Alice · 1,234 views" || card.Published != "2026-10-01" || card.Image == "" {
		t.Fatal(card, err)
	}
	if _, err := s.Load(context.Background(), card.URL); err != nil || calls != 2 {
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
		if card, err := s.Load(context.Background(), "https://youtu.be/abcdefghijk"); err == nil && card.Site == "YouTube" {
			t.Fatal("accepted malformed body")
		}
		s.Close()
	}
}

func TestYouTubeChannelAndPlaylistPages(t *testing.T) {
	for _, path := range []string{"/@creator", "/channel/UCabcdefghijk", "/playlist?list=PLabcdefghijk"} {
		t.Run(path, func(t *testing.T) {
			s := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
				return response(r, `<meta property="og:title" content="Public collection"><meta property="og:description" content="Public channel or playlist"><meta property="og:image" content="https://i.ytimg.com/public.jpg"><meta itemprop="datePublished" content="2026-10-01"><meta itemprop="interactionCount" content="42">`, "text/html"), nil
			})})
			defer s.Close()
			card, err := s.Load(context.Background(), "https://www.youtube.com"+path)
			if err != nil || card.Site != "YouTube" || card.Title != "Public collection" || card.Published != "2026-10-01" || card.Views != 42 || !strings.Contains(card.Description, "42 views") {
				t.Fatal(card, err)
			}
		})
	}
}
