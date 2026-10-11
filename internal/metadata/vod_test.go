package metadata

import (
	"strings"
	"testing"
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
