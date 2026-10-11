package server

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/PatrickFanella/hasanabi.neocities.org/rebuild/internal/preview"
)

type previewTransport func(*http.Request) (*http.Response, error)

func (f previewTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestPreviewHandler(t *testing.T) {
	for _, tc := range []struct {
		name, url, origin, site string
		status                  int
		closed, full, fail      bool
	}{
		{name: "public", url: "https://example.com", status: 200}, {name: "private", url: "http://127.0.0.1", status: 400}, {name: "cross origin", url: "https://example.com", origin: "https://other.com", status: 403}, {name: "cross site", url: "https://example.com", site: "cross-site", status: 403}, {name: "bad origin", url: "https://example.com", origin: ":bad", status: 403}, {name: "origin allowed", url: "https://example.com", origin: "http://example.com", status: 200}, {name: "upstream error", url: "https://example.com", status: 502, fail: true}, {name: "shutdown", url: "https://example.com", status: 503, closed: true}, {name: "capacity", url: "https://example.com", status: 503, full: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := New(Config{})
			s.previews.Close()
			s.previews = preview.New(&http.Client{Transport: previewTransport(func(r *http.Request) (*http.Response, error) {
				if tc.fail {
					return nil, errors.New("failed")
				}
				return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"text/html"}}, Body: io.NopCloser(strings.NewReader("<title>Fixture title</title>")), Request: r}, nil
			})})
			defer s.Close()
			if tc.closed {
				s.closing = true
			}
			if tc.full {
				for range cap(s.previewSlots) {
					s.previewSlots <- struct{}{}
				}
			}
			r := httptest.NewRequest(http.MethodGet, "http://example.com/api/preview?url="+tc.url, nil)
			r.Header.Set("Origin", tc.origin)
			r.Header.Set("Sec-Fetch-Site", tc.site)
			w := httptest.NewRecorder()
			s.Handler().ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
			}
			if tc.status == 200 && (!strings.Contains(w.Body.String(), "Fixture title") || w.Header().Get("Content-Type") != "application/json") {
				t.Fatal("invalid preview response")
			}
		})
	}
}
