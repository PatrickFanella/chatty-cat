package preview

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestProviderCards(t *testing.T) {
	for _, tc := range []struct{ target, endpoint, body, site, title, description string }{
		{"https://git.subcult.tv/subculture-collective/chatty-cat", "https://git.subcult.tv/api/v1/repos/subculture-collective/chatty-cat", `{"full_name":"subculture-collective/chatty-cat","description":"Rebuild","stars_count":2,"created_at":"2026-10-10T12:00:00Z","updated_at":"2026-10-11T13:00:00Z"}`, "Gitea", "subculture-collective/chatty-cat", "Rebuild · 2 stars · started 2026-10-10 · updated 2026-10-11"},
		{"https://github.com/octocat/Hello-World/issues", "https://api.github.com/repos/octocat/Hello-World", `{"full_name":"octocat/Hello-World","description":"Example repo","stargazers_count":1234,"owner":{"avatar_url":"https://avatars.githubusercontent.com/u/1"},"token":"do-not-forward"}`, "GitHub", "octocat/Hello-World", "Example repo · 1,234 stars"},
		{"https://news.ycombinator.com/item?id=8863", "https://hacker-news.firebaseio.com/v0/item/8863.json", `{"id":8863,"title":"Hello &amp; world","by":"author","score":117,"descendants":71,"time":1175714200,"url":"https://www.example.com/article"}`, "Hacker News", "Hello & world", "117 points · 71 comments · example.com"},
		{"https://en.wikipedia.org/wiki/Earth", "https://en.wikipedia.org/api/rest_v1/page/summary/Earth", `{"type":"standard","title":"Earth","extract":"Our home planet.","thumbnail":{"source":"https://upload.wikimedia.org/earth.jpg"}}`, "Wikipedia", "Earth", "Our home planet."},
		{"https://youtu.be/dQw4w9WgXcQ?t=12", "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ", `{"type":"video","title":"A video","author_name":"Creator","thumbnail_url":"https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg","html":"<script>never return</script>"}`, "YouTube", "A video", "by Creator"},
	} {
		t.Run(tc.site, func(t *testing.T) {
			calls := 0
			service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
				calls++
				if tc.site == "YouTube" && r.URL.Path == "/watch" {
					return response(r, `<title>Page</title>`, "text/html"), nil
				}
				if r.URL.String() != tc.endpoint {
					t.Fatalf("unexpected request %s", r.URL)
				}
				if r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
					t.Fatal("public request carries credentials")
				}
				return response(r, tc.body, "application/json"), nil
			})})
			defer service.Close()
			card, err := service.Load(context.Background(), tc.target)
			if err != nil {
				t.Fatal(err)
			}
			if card.URL != tc.target || card.Site != tc.site || card.Title != tc.title || card.Description != tc.description {
				t.Fatalf("unexpected card %+v", card)
			}
			if _, err := service.Load(context.Background(), tc.target); err != nil || calls != func() int {
				if tc.site == "YouTube" {
					return 2
				}
				return 1
			}() {
				t.Fatal("provider result was not cached")
			}
		})
	}
}

func TestWikipediaRedirectAndUnicode(t *testing.T) {
	service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.EscapedPath() != "/api/rest_v1/page/summary/Caf%C3%A9%2FHistory" {
			t.Fatalf("article title was not encoded as one path segment: %s", r.URL)
		}
		return response(r, `{"type":"standard","title":"Café history","extract":"Summary","content_urls":{"desktop":{"page":"https://fr.wikipedia.org/wiki/Caf%C3%A9_history"}},"thumbnail":{"source":"http://127.0.0.1/private"}}`, "application/json"), nil
	})})
	defer service.Close()
	card, err := service.Load(context.Background(), "https://fr.wikipedia.org/wiki/Caf%C3%A9/History")
	if err != nil || card.URL != "https://fr.wikipedia.org/wiki/Caf%C3%A9_history" || card.Image != "" {
		t.Fatalf("redirect/asset validation failed: %+v %v", card, err)
	}
}

func TestVideoAndArticleFallbacks(t *testing.T) {
	for _, tc := range []struct{ target, body string }{
		{"https://www.youtube.com/watch?v=dQw4w9WgXcQ", `{"type":"video","title":""}`},
		{"https://www.youtube.com/shorts/dQw4w9WgXcQ", `{"type":"rich","title":"Invalid type"}`},
		{"https://en.wikipedia.org/wiki/Earth", `{"type":"not_found","title":"Not found"}`},
		{"https://en.wikipedia.org/wiki/Earth", `null`},
	} {
		t.Run(tc.target+tc.body, func(t *testing.T) {
			service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
				if r.URL.Path == "/oembed" || strings.HasPrefix(r.URL.Path, "/api/rest_v1/") {
					return response(r, tc.body, "application/json"), nil
				}
				return response(r, `<title>HTML fallback</title>`, "text/html"), nil
			})})
			defer service.Close()
			card, err := service.Load(context.Background(), tc.target)
			if err != nil || card.Title != "HTML fallback" {
				t.Fatalf("fallback failed: %+v %v", card, err)
			}
		})
	}
}

func TestProviderRouteBoundaries(t *testing.T) {
	for _, raw := range []string{
		"https://youtube.com.evil.net/watch?v=dQw4w9WgXcQ",
		"https://www.youtube.com/@creator", "https://www.youtube.com/watch?v=invalid",
		"https://youtu.be/dQw4w9WgXcQ/more", "https://youtu.be/",
		"https://en.wikipedia.org.evil.net/wiki/Earth", "https://en.wikipedia.org/wiki/",
		"https://en.wikipedia.org/w/index.php?title=Earth", "https://en.m.wikipedia.org/wiki/Earth",
	} {
		t.Run(raw, func(t *testing.T) {
			service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
				if r.URL.String() != raw {
					t.Fatalf("unexpected provider request: %s", r.URL)
				}
				return response(r, `<title>Generic</title>`, "text/html"), nil
			})})
			defer service.Close()
			card, err := service.Load(context.Background(), raw)
			if err != nil || card.Title != "Generic" {
				t.Fatalf("generic route failed: %+v %v", card, err)
			}
		})
	}
}

func TestProviderFallback(t *testing.T) {
	for _, body := range []string{`null`, `{"full_name":"different/repo"}`, `{"full_name":"octocat/Hello-World","stargazers_count":"invalid"}`, strings.Repeat("x", 512*1024+1)} {
		service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
			if r.URL.Host == "api.github.com" {
				return response(r, body, "application/json"), nil
			}
			return response(r, `<title>Usable fallback</title>`, "text/html"), nil
		})})
		card, err := service.Load(context.Background(), "https://github.com/octocat/Hello-World")
		service.Close()
		if err != nil || card.Title != "Usable fallback" {
			t.Fatalf("fallback failed: %+v %v", card, err)
		}
	}
}

func TestHackerNewsInvalidFallback(t *testing.T) {
	for _, body := range []string{`null`, `{"id":999,"title":"Wrong item"}`, `{"id":8863,"title":"Deleted","deleted":true}`, `{"id":8863,"title":"Dead","dead":true}`, `{"id":8863,"title":"Invalid score","score":"unknown"}`} {
		service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
			if r.URL.Host == "hacker-news.firebaseio.com" {
				return response(r, body, "application/json"), nil
			}
			return response(r, `<title>HTML remains usable</title>`, "text/html"), nil
		})})
		card, err := service.Load(context.Background(), "https://news.ycombinator.com/item?id=8863")
		service.Close()
		if err != nil || card.Title != "HTML remains usable" {
			t.Fatalf("fallback failed: %+v %v", card, err)
		}
	}
}

func TestProviderOptionalFields(t *testing.T) {
	service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		return response(r, `{"full_name":"owner/repo","stargazers_count":1,"owner":{"avatar_url":"http://127.0.0.1/private"}}`, "application/json"), nil
	})})
	defer service.Close()
	card, err := service.Load(context.Background(), "https://github.com/owner/repo")
	if err != nil || card.Description != "1 star" || card.Image != "" {
		t.Fatalf("optional fields failed: %+v %v", card, err)
	}
}
