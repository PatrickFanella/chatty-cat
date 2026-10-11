package preview

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func response(r *http.Request, body, kind string) *http.Response {
	return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{kind}}, Body: io.NopCloser(strings.NewReader(body)), Request: r}
}
func TestTarget(t *testing.T) {
	for _, raw := range []string{"file:///etc/passwd", "https://user:pass@github.com", "http://localhost/", "http://127.0.0.1/", "http://10.0.0.1/", "http://100.64.0.1/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[64:ff9b::7f00:1]/", "https://service.local/", "http://192.0.2.1/", "https://github.com:8080/", strings.Repeat("x", 2049)} {
		t.Run(raw[:min(len(raw), 60)], func(t *testing.T) {
			if _, err := Target(raw); err == nil {
				t.Fatal("unsafe destination accepted")
			}
		})
	}
	for _, raw := range []string{"https://github.com/openai#fragment", "https://8.8.8.8/", "https://[2606:4700:4700::1111]/"} {
		t.Run(raw, func(t *testing.T) {
			u, err := Target(raw)
			if err != nil || u.Fragment != "" {
				t.Fatalf("target=%v err=%v", u, err)
			}
		})
	}
}
func TestPublicDial(t *testing.T) {
	tests := []struct {
		name       string
		address    string
		ips        []netip.Addr
		resolveErr bool
		wantErr    bool
		wantDial   bool
	}{
		{"private DNS", "example.com:443", []netip.Addr{netip.MustParseAddr("10.0.0.1")}, false, true, false},
		{"mixed DNS", "example.com:443", []netip.Addr{netip.MustParseAddr("8.8.8.8"), netip.MustParseAddr("127.0.0.1")}, false, true, false},
		{"pinned public", "example.com:443", []netip.Addr{netip.MustParseAddr("8.8.8.8")}, false, false, true},
		{"empty DNS", "example.com:443", nil, false, true, false}, {"DNS error", "example.com:443", nil, true, true, false}, {"bad port", "example.com:1234", nil, false, true, false}, {"bad address", "oops", nil, false, true, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dialed := false
			lookup := func(context.Context, string, string) ([]netip.Addr, error) {
				if tc.resolveErr {
					return nil, errors.New("DNS failed")
				}
				return tc.ips, nil
			}
			connect := func(_ context.Context, _ string, address string) (net.Conn, error) {
				dialed = true
				if address != "8.8.8.8:443" {
					t.Fatalf("unpinned address %s", address)
				}
				a, b := net.Pipe()
				if err := b.Close(); err != nil {
					t.Fatal(err)
				}
				return a, nil
			}
			conn, err := dialPublic(context.Background(), "tcp", tc.address, lookup, connect)
			if conn != nil {
				if err := conn.Close(); err != nil {
					t.Fatal(err)
				}
			}
			if (err != nil) != tc.wantErr || dialed != tc.wantDial {
				t.Fatalf("err=%v dialed=%v", err, dialed)
			}
		})
	}
	_, err := dialPublic(context.Background(), "tcp", "example.com:443", func(context.Context, string, string) ([]netip.Addr, error) {
		return []netip.Addr{netip.MustParseAddr("8.8.8.8")}, nil
	}, func(context.Context, string, string) (net.Conn, error) { return nil, errors.New("failed") })
	if err == nil {
		t.Fatal("dial failure ignored")
	}
}
func TestMetadata(t *testing.T) {
	service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		return response(r, `<head><title>Fallback</title><meta property="og:title" content="Hello &amp; world"><meta name="description" content=" A   description "><meta property="og:image" content="/image.png"><meta name="author" content="Writer"><meta property="article:published_time" content="today"><meta property="og:site_name" content="Site"><link rel="icon" href="/icon.ico"></head><meta property="og:title" content="Body should not count">`, "text/html; charset=utf-8"), nil
	})})
	defer service.Close()
	card, err := service.Load(context.Background(), "https://example.com/page")
	if err != nil {
		t.Fatal(err)
	}
	if card.Title != "Hello & world" || card.Description != "A description" || card.Image != "https://example.com/image.png" || card.Site != "Site" || card.Author != "Writer" || card.Icon != "https://example.com/icon.ico" || card.Published != "today" {
		t.Fatalf("card=%+v", card)
	}
}
func TestBoundedParsingAndAssets(t *testing.T) {
	tests := []struct{ name, body, kind, title string }{{"non HTML", "never parsed", "video/mp4", "movie.mp4"}, {"title fallback", "<head><title>Title only</title></head>", "text/html", "Title only"}, {"bounded", strings.Repeat(" ", 128<<10) + `<meta property="og:title" content="Too late">`, "text/html", "example.com"}, {"missing metadata", "<head></head>", "text/html", "example.com"}, {"bad content type", "", "invalid;broken", "movie.mp4"}}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) { return response(r, tc.body, tc.kind), nil })})
			defer service.Close()
			card, err := service.Load(context.Background(), "https://example.com/movie.mp4")
			if err != nil || card.Title != tc.title {
				t.Fatalf("card=%+v err=%v", card, err)
			}
		})
	}
	base, err := Target("https://example.com")
	if err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{"javascript:alert(1)", "http://127.0.0.1/", ":bad", ""} {
		if asset(base, raw) != "" {
			t.Fatalf("unsafe asset %q", raw)
		}
	}
	if clean(strings.Repeat("🌟", 20), 3) != "🌟🌟🌟" {
		t.Fatal("unicode bound failed")
	}
}
func TestCacheAndCoalescing(t *testing.T) {
	var calls atomic.Int32
	started := make(chan struct{})
	release := make(chan struct{})
	service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		if calls.Add(1) == 1 {
			close(started)
			<-release
		}
		return response(r, "<title>Cached</title>", "text/html"), nil
	})})
	defer service.Close()
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		if _, err := service.Load(context.Background(), "https://example.com"); err != nil {
			t.Error(err)
		}
	}()
	<-started
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := service.Load(ctx, "https://example.com"); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		if _, err := service.Load(context.Background(), "https://example.com"); err != nil {
			t.Error(err)
		}
	}()
	close(release)
	wg.Wait()
	if _, err := service.Load(context.Background(), "https://example.com"); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 {
		t.Fatal("duplicate fetch")
	}
	service.mu.Lock()
	value := service.cache["https://example.com"]
	value.until = time.Now().Add(-time.Second)
	service.cache["https://example.com"] = value
	service.mu.Unlock()
	if _, err := service.Load(context.Background(), "https://example.com"); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 2 {
		t.Fatal("cache did not expire")
	}
}
func TestFailuresAndLimits(t *testing.T) {
	service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		if strings.Contains(r.URL.Path, "network") {
			return nil, errors.New("network failed")
		}
		result := response(r, "", "text/html")
		result.StatusCode = 500
		return result, nil
	})})
	defer service.Close()
	for _, raw := range []string{"https://example.com/failure", "https://example.com/network", "file:///bad"} {
		if _, err := service.Load(context.Background(), raw); err == nil {
			t.Fatal("failure accepted")
		}
	}
	for range cap(service.slots) {
		service.slots <- struct{}{}
	}
	if _, err := service.Load(context.Background(), "https://example.com/full"); err == nil {
		t.Fatal("capacity ignored")
	}
	for range cap(service.slots) {
		<-service.slots
	}
	for i := range 260 {
		raw := "https://example.com/" + strings.Repeat("a", i)
		if _, err := service.Load(context.Background(), raw); err == nil {
			t.Fatal("upstream failure accepted")
		}
	}
	if len(service.cache) > 256 {
		t.Fatal("unbounded cache")
	}
	client := publicClient()
	defer client.CloseIdleConnections()
	request, err := http.NewRequest(http.MethodGet, "http://localhost", nil)
	if err != nil {
		t.Fatal(err)
	}
	if client.CheckRedirect(request, nil) == nil {
		t.Fatal("private redirect accepted")
	}
	request.URL.Host = "example.com"
	if client.CheckRedirect(request, make([]*http.Request, 5)) == nil {
		t.Fatal("redirect limit ignored")
	}
	if client.CheckRedirect(request, nil) != nil {
		t.Fatal("public redirect rejected")
	}
}
func TestRateLimitAndBudgetBounds(t *testing.T) {
	var calls atomic.Int32
	service := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		return response(r, "<title>Title</title>", "text/html"), nil
	})})
	defer service.Close()
	for i := range 30 {
		if _, err := service.LoadFor(context.Background(), "https://example.com/"+strings.Repeat("a", i), "one"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := service.LoadFor(context.Background(), "https://example.com/extra", "one"); err == nil {
		t.Fatal("rate exceeded")
	}
	if _, err := service.LoadFor(context.Background(), "https://example.com/", "one"); err != nil {
		t.Fatal("cache hit rate limited")
	}
	for i := range 270 {
		if _, err := service.LoadFor(context.Background(), "https://example.com/unique"+strings.Repeat("a", i), strings.Repeat("b", i+1)); err != nil {
			t.Fatal(err)
		}
	}
	if len(service.budgets) > 256 || len(service.cache) > 256 {
		t.Fatal("unbounded state")
	}
}
