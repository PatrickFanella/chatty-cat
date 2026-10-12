package preview

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func TestTwitterPreview(t *testing.T) {
	calls := 0
	body := `{"code":200,"tweet":{"id":"123","text":"<script>hello</script>","created_timestamp":1658050558,"author":{"screen_name":"alice","avatar_url":"https://pbs.twimg.com/avatar.png"},"media":{"photos":[{"url":"https://pbs.twimg.com/photo.png","altText":"Photo"},{"url":"https://evil.test/a.png"}],"videos":[{"url":"https://video.twimg.com/v.mp4","thumbnail_url":"https://pbs.twimg.com/thumb.png","type":"gif","width":640,"height":480}]},"quote":{"text":"Quoted text","media":{"photos":[{"url":"https://pbs.twimg.com/quote.png"}]}}}}`
	service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.String() != "https://api.fxtwitter.com/status/123" || !strings.Contains(r.UserAgent(), "chatty-cat") {
			t.Error(r.URL, r.UserAgent())
		}
		return response(r, body, "application/json"), nil
	})})
	defer service.Close()
	card, err := service.Load(context.Background(), "https://x.com/alice/status/123")
	if err != nil {
		t.Fatal(err)
	}
	if card.Author != "alice" || card.Social == nil || len(card.Social.Photos) != 2 || len(card.Social.Videos) != 1 || card.Social.Quote != "Quoted text" || card.TTL != 600 || card.Published != "2022-07-17T09:35:58Z" {
		t.Fatal(card)
	}
	if _, err := service.Load(context.Background(), "https://x.com/alice/status/123"); err != nil || calls != 1 {
		t.Fatal(err, calls)
	}
	for _, raw := range []string{"https://x.com/alice", "https://x.com.evil.test/alice/status/123", "https://x.com/alice/status/not-number", "https://x.com/alice/status/123/other"} {
		u, _ := url.Parse(raw)
		if twitterID(u) != "" {
			t.Fatal(raw)
		}
	}
	for _, raw := range []string{"https://twitter.com/alice/status/123", "https://mobile.x.com/alice/status/123/photo/1"} {
		u, _ := url.Parse(raw)
		if twitterID(u) != "123" {
			t.Fatal(raw)
		}
	}
}
func TestTwitterPreviewFailures(t *testing.T) {
	for _, body := range []string{`{`, `{"code":404}`, `{"code":200,"tweet":{"id":"other","author":{"screen_name":"alice"}}}`, `{"code":200,"tweet":{"id":"123","text":"hi","author":{"screen_name":"bad!"}}}`, `{"code":200,"tweet":{"id":"123","text":"","author":{"screen_name":"alice"}}}`, strings.Repeat("x", 128*1024+1)} {
		t.Run(body[:min(len(body), 35)], func(t *testing.T) {
			service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) { return response(r, body, "application/json"), nil })})
			defer service.Close()
			if _, err := service.Load(context.Background(), "https://x.com/alice/status/123"); err == nil {
				t.Fatal("accepted invalid response")
			}
		})
	}
	for _, code := range []int{401, 404, 429, 500} {
		service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
			res := response(r, "{}", "application/json")
			res.StatusCode = code
			return res, nil
		})})
		if _, err := service.Load(context.Background(), "https://x.com/alice/status/123"); err == nil {
			t.Fatal(code)
		}
		service.Close()
	}
	service := New(&http.Client{Transport: roundTrip(func(*http.Request) (*http.Response, error) { return nil, errors.New("offline") })})
	defer service.Close()
	if _, err := service.Load(context.Background(), "https://x.com/alice/status/123"); err == nil {
		t.Fatal("offline accepted")
	}
	for _, raw := range []string{"javascript:evil", "https://user:pass@pbs.twimg.com/a", "https://pbs.twimg.com:444/a", "https://pbs.twimg.com.evil.test/a", "https://pbs.twimg.com/" + strings.Repeat("a", 2048)} {
		if socialAsset(raw, "pbs.twimg.com") != "" {
			t.Fatal(raw)
		}
	}
}
