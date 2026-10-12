package preview

import (
	"context"
	"net/http"
	"testing"
)

func TestNitterCandidatesAndReachability(t *testing.T) {
	raw := `<table><tr><td><a href="https://127.0.0.1/">private</a><span aria-label="healthy"></span></td><td data-name="average">1 ms</td></tr><tr><td><a href="https://slow.example.net/">slow</a><span aria-label="healthy"></span></td><td data-name="average">200 ms</td></tr><tr><td><a href="https://fast.example.net/">fast</a><span aria-label="healthy"></span></td><td data-name="average">100 ms</td></tr><tr><td><a href="https://bad.example.net/">bad</a></td><td data-name="average">10 ms</td></tr></table>`
	candidates := nitterCandidates([]byte(raw))
	if len(candidates) != 2 || candidates[0].host != "https://fast.example.net" {
		t.Fatal(candidates)
	}
	calls := 0
	s := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		switch r.URL.Host {
		case "status.d420.de":
			return response(r, raw, "text/html"), nil
		case "fast.example.net":
			return response(r, "<title>Nitter</title>", "text/html"), nil
		default:
			t.Fatal(r.URL)
			return nil, nil
		}
	})})
	defer s.Close()
	if host := s.Nitter(context.Background()); host != "https://fast.example.net" {
		t.Fatal(host)
	}
	_ = s.Nitter(context.Background())
	if calls != 2 {
		t.Fatal("selection did not cache")
	}
}
