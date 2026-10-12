package metadata

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestVodTiming(t *testing.T) {
	raw := `{"data":[{"id":"12345","user_id":"123","created_at":"2026-10-10T12:00:00Z","duration":"2h3m4s","title":"A stream","type":"archive"}]}`
	got, err := parseVod([]byte(raw), "123")
	if err != nil || got.End != "2026-10-10T14:03:04Z" || got.URL != "https://www.twitch.tv/videos/12345" {
		t.Fatalf("%+v %v", got, err)
	}
	for _, bad := range []string{strings.Replace(raw, "2h3m4s", "999h", 1), strings.Replace(raw, "2h3m4s", "3m60s", 1), strings.Replace(raw, "archive", "highlight", 1), strings.Replace(raw, "12345", "../evil", 1), strings.Replace(raw, "2026-10-10", "9999-01-01", 1)} {
		if _, err := parseVod([]byte(bad), "123"); err == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
	if _, err := parseVod([]byte(raw), "other"); err == nil {
		t.Fatal("accepted other channel")
	}
	if vod, err := parseVod([]byte(`{"data":[]}`), "123"); err != nil || vod != nil {
		t.Fatal("empty archive response")
	}
}

func TestVerifyVodOwnershipAvailabilityAndNoStaleFallback(t *testing.T) {
	ctx := context.Background()
	calls := 0
	read := func(_ context.Context, path string) ([]byte, error) {
		if path == "/users?login=alice" {
			return []byte(`{"data":[{"id":"123","login":"alice"}]}`), nil
		}
		calls++
		switch path {
		case "/videos?id=12345":
			return []byte(`{"data":[{"id":"12345","user_id":"123","created_at":"2026-10-10T12:00:00Z","duration":"2h3m4s","title":"A stream","type":"archive","access_token":"discard"}]}`), nil
		case "/videos?id=1":
			return []byte(`{"data":[]}`), nil
		case "/videos?id=4":
			return []byte(`{"data":[{"id":"999","user_id":"123","created_at":"2026-10-10T12:00:00Z","duration":"2h","type":"archive"}]}`), nil
		case "/videos?id=2":
			return []byte(`{"data":[{"id":"2","user_id":"other","created_at":"2026-10-10T12:00:00Z","duration":"2h","type":"archive"}]}`), nil
		default:
			return nil, errors.New("provider failed")
		}
	}
	service := New(nil, Endpoints{}, read)
	vod, err := service.VerifyVod(ctx, "alice", "12345")
	if err != nil || vod == nil {
		t.Fatal(vod, err)
	}
	if _, err = service.VerifyVod(ctx, "alice", "12345"); err != nil || calls != 1 {
		t.Fatal("verification not cached", calls, err)
	}
	if vod, err = service.VerifyVod(ctx, "alice", "1"); err != nil || vod != nil {
		t.Fatal(vod, err)
	}
	for _, id := range []string{"2", "3", "4", "bad!"} {
		if _, err = service.VerifyVod(ctx, "alice", id); err == nil {
			t.Fatal("accepted", id)
		}
	}
	service.mu.Lock()
	entry := service.cache["helix:/videos?id=12345"]
	entry.expires = time.Time{}
	service.cache["helix:/videos?id=12345"] = entry
	service.publicRead = func(_ context.Context, _ string) ([]byte, error) { return nil, errors.New("provider failed") }
	service.mu.Unlock()
	if vod, err = service.VerifyVod(ctx, "alice", "12345"); err == nil || vod != nil {
		t.Fatal("accepted stale fallback", vod, err)
	}
}
