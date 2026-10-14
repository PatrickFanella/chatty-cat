package metadata

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestLoadPrecedenceAndBadges(t *testing.T) {
	responses := map[string]string{
		"/se/room/stats":                      `{"bttvEmotes":[{"emote":"Shared","amount":42}]}`,
		"/ivr/user":                           `[{"id":"123"}]`,
		"/7tv/emote-sets/global":              `{"id":"global-set","emotes":[{"id":"global","name":"Shared","flags":1,"data":{"animated":true}},{"id":"overlay","name":"Overlay","flags":1}]}`,
		"/bttv/emotes/global":                 `[{"id":"bglobal","code":"Shared","imageType":"gif"}]`,
		"/ffz/set/global":                     `{"sets":{"1":{"emoticons":[{"name":"Shared","urls":{"2":"//cdn.frankerfacez.com/emote/1/2"}}]}}}`,
		"/7tv/users/twitch/123":               `{"user":{"id":"owner-7tv"},"emote_set":{"id":"channel-set","emotes":[{"id":"channel","name":"Shared","flags":1,"data":{"animated":true}},{"id":"channel7","name":"Channel7"}]}}`,
		"/bttv/users/twitch/123":              `{"channelEmotes":[{"id":"channelB","code":"Shared"}],"sharedEmotes":[{"id":"sharedB","code":"SharedB","imageType":"gif"}]}`,
		"/ffz/room/room":                      `{"room":{"mod_urls":{"2":"//cdn.frankerfacez.com/room-badge/mod/2"},"vip_badge":{"1":"https://cdn.frankerfacez.com/room-badge/vip/1"}},"sets":{"2":{"emoticons":[{"name":"Shared","urls":{"2":"https://cdn.frankerfacez.com/emote/2/2"}},{"name":"Anim","urls":{"2":"https://cdn.frankerfacez.com/emote/3/2"}}]}}}`,
		"/bttv/frankerfacez/users/twitch/123": `[{"code":"Anim","animated":true,"images":{"2x":"https://cdn.betterttv.net/frankerfacez_emote/3/2"}}]`,
		"/ivr/badges/global":                  `[{"set_id":"subscriber","versions":[{"id":"1","image_url_2x":"https://badges.example/global","title":"Global"},{"id":"2","image_url_1x":"https://badges.example/2","title":"Two"}]}]`,
		"/ivr/badges/channel":                 `[{"set_id":"subscriber","versions":[{"id":"1","image_url_2x":"https://badges.example/channel","title":"Channel","description":"Subscriber"}]}]`,
		"/decapi/uptime/room":                 " 2 hours ", "/decapi/viewercount/room": "1234", "/decapi/title/room": "A stream title", "/decapi/game/room": " Just Chatting ",
	}
	var calls atomic.Int32
	host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		data, ok := responses[r.URL.Path]
		if !ok {
			t.Errorf("unexpected path: %s", r.URL)
			http.NotFound(w, r)
			return
		}
		if _, err := w.Write([]byte(data)); err != nil {
			t.Error(err)
		}
	}))
	defer host.Close()
	s := New(host.Client(), testEndpoints(host.URL), func(_ context.Context, path string) ([]byte, error) {
		calls.Add(1)
		if path == "/chat/emotes/global" || path == "/chat/emotes?broadcaster_id=123" {
			return []byte(`{"data":[{"id":"emotesv2_test","name":"Native","format":["static","animated"]}]}`), nil
		}
		if path != "/videos?user_id=123&type=archive&sort=time&first=1" {
			t.Errorf("unexpected public read %s", path)
		}
		return []byte(`{"data":[{"id":"999","user_id":"123","created_at":"2026-10-10T12:00:00Z","duration":"1h","title":"Previous stream","type":"archive"}]}`), nil
	})
	got, err := s.Load(context.Background(), "room")
	if err != nil {
		t.Fatal(err)
	}
	if got.SevenTV == nil || got.SevenTV.GlobalSetID != "global-set" || got.SevenTV.ChannelSetID != "channel-set" || got.SevenTV.UserID != "owner-7tv" {
		t.Fatal("7TV public event context missing", got.SevenTV)
	}
	if got.BroadcasterID != "123" {
		t.Fatal("public room ID missing")
	}
	if got.FFZRoleBadges["moderator"].URL != "https://cdn.frankerfacez.com/room-badge/mod/2" || got.FFZRoleBadges["vip"].Title != "VIP" {
		t.Fatal("FFZ role artwork missing")
	}
	if len(got.EmoteSets) != 8 || got.EmoteSets[0].Scope != "global" || got.EmoteSets[3].Scope != "channel" {
		t.Fatalf("provider scopes missing: %+v", got.EmoteSets)
	}
	if got.EmoteSets[0].Emotes["Shared"].Source != "7TV" || got.EmoteSets[2].Emotes["Shared"].Source != "FFZ" || got.EmoteSets[5].Emotes["Shared"].Source != "FFZ" {
		t.Fatal("disabled winner must not erase lower precedence providers")
	}
	if got.EmoteSets[5].Emotes["Anim"].StaticURL != "https://cdn.frankerfacez.com/emote/3/2" {
		t.Fatal("static fallback lost")
	}
	if got.Emotes["Native"].Source != "Twitch" || !got.Emotes["Native"].Animated {
		t.Fatalf("native catalog: %+v", got.Emotes["Native"])
	}
	if got.LastVod == nil || got.LastVod.End != "2026-10-10T13:00:00Z" {
		t.Fatalf("VOD: %+v", got.LastVod)
	}
	if got.EmoteUse["Shared"] != 42 {
		t.Fatalf("usage seeds: %v", got.EmoteUse)
	}
	if len(got.Errors) > 0 {
		t.Fatalf("provider errors: %v", got.Errors)
	}
	if got.Emotes["Shared"].Source != "FFZ" || got.Emotes["Shared"].ZeroWidth || got.Emotes["Shared"].Animated {
		t.Fatalf("stale winner flags: %#v", got.Emotes["Shared"])
	}
	if !got.Emotes["Overlay"].ZeroWidth || got.Emotes["Channel7"].Source != "7TV" || !got.Emotes["SharedB"].Animated {
		t.Fatalf("missing emotes: %#v", got.Emotes)
	}
	if got.Emotes["Anim"].Source != "FFZ animated" || !got.Emotes["Anim"].Animated || got.Emotes["Anim"].StaticURL != "https://cdn.frankerfacez.com/emote/3/2" {
		t.Fatalf("animation: %#v", got.Emotes["Anim"])
	}
	if got.Badges["subscriber"]["1"].Title != "Channel" || got.Badges["subscriber"]["2"].Title != "Two" {
		t.Fatalf("badge merge: %#v", got.Badges)
	}
	if got.Stream.Uptime != "2 hours" || got.Stream.Viewers != "1234" || got.Stream.Title != "A stream title" || got.Stream.Game != "Just Chatting" {
		t.Fatalf("stream: %#v", got.Stream)
	}
	before := calls.Load()
	if _, err := s.Load(context.Background(), "room"); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != before {
		t.Fatal("repeat load did not use cache")
	}
}

func testEndpoints(base string) Endpoints {
	return Endpoints{SevenTV: base + "/7tv", BTTV: base + "/bttv", FFZ: base + "/ffz", IVR: base + "/ivr", DecAPI: base + "/decapi", StreamElements: base + "/se"}
}

func TestPartialFailureAndInvalidChannel(t *testing.T) {
	host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/7tv/emote-sets/global" {
			if _, err := w.Write([]byte(`{"emotes":[{"id":"good","name":"Good"}]}`)); err != nil {
				t.Error(err)
			}
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer host.Close()
	s := New(host.Client(), testEndpoints(host.URL))
	got, err := s.Load(context.Background(), "room")
	if err != nil {
		t.Fatal(err)
	}
	if got.Emotes["Good"].URL == "" || len(got.Errors) == 0 {
		t.Fatalf("partial failure erased good data: %#v", got)
	}
	if _, err := s.Load(context.Background(), "room/../other"); err == nil {
		t.Fatal("invalid channel accepted")
	}
}

func TestCoalescingAndCancellation(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			close(entered)
		}
		select {
		case <-release:
		case <-r.Context().Done():
			return
		}
		if _, err := w.Write([]byte(`{"ok":true}`)); err != nil {
			t.Error(err)
		}
	}))
	defer host.Close()
	s := New(host.Client(), testEndpoints(host.URL))
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		if _, err := s.get(context.Background(), host.URL+"/test", time.Minute); err != nil {
			t.Error(err)
		}
	}()
	<-entered
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := s.get(ctx, host.URL+"/test", time.Minute); err == nil {
		t.Fatal("cancelled waiter did not return")
	}
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.get(context.Background(), host.URL+"/test", time.Minute); err != nil {
				t.Error(err)
			}
		}()
	}
	close(release)
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("coalesced calls: %d", calls.Load())
	}
}

func TestFailedRefreshUsesStaleData(t *testing.T) {
	var fail atomic.Bool
	host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if fail.Load() {
			if _, err := w.Write([]byte("<html>provider error</html>")); err != nil {
				t.Error(err)
			}
			return
		}
		if _, err := w.Write([]byte(`{"ok":true}`)); err != nil {
			t.Error(err)
		}
	}))
	defer host.Close()
	s := New(host.Client(), testEndpoints(host.URL))
	address := host.URL + "/test"
	if _, err := s.get(context.Background(), address, time.Minute); err != nil {
		t.Fatal(err)
	}
	s.mu.Lock()
	old := s.cache[address]
	old.expires = time.Now().Add(-time.Second)
	s.cache[address] = old
	s.mu.Unlock()
	fail.Store(true)
	data, err := s.get(context.Background(), address, time.Minute)
	if err == nil || string(data) != `{"ok":true}` {
		t.Fatalf("stale fallback: %s %v", data, err)
	}
}

func TestImageValidation(t *testing.T) {
	for _, tt := range []struct{ in, out string }{
		{"//cdn.example/image", "https://cdn.example/image"}, {"https://cdn.example/image", "https://cdn.example/image"},
		{"javascript:alert(1)", ""}, {"http://cdn.example/image", ""}, {"https://user:password@cdn.example/image", ""}, {"not a URL", ""},
	} {
		if got := safeImage(tt.in); got != tt.out {
			t.Errorf("%q: %q", tt.in, got)
		}
	}
}

func TestResponseLimits(t *testing.T) {
	for _, tt := range []struct {
		name, body string
		status     int
	}{
		{"bad status", "", 503}, {"invalid JSON", "nope", 200}, {"oversized", strings.Repeat("x", (8<<20)+1), 200},
	} {
		t.Run(tt.name, func(t *testing.T) {
			host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.status)
				if _, err := w.Write([]byte(tt.body)); err != nil {
					t.Log(err)
				}
			}))
			defer host.Close()
			s := New(host.Client(), testEndpoints(host.URL))
			if _, err := s.get(context.Background(), host.URL+"/test", time.Minute); err == nil {
				t.Fatal("invalid response accepted")
			}
		})
	}
}

func TestFFZRoleImagesRejectUnsafeAndUseSafeFallback(t *testing.T) {
	var sets ffzSets
	sets.Room.Moderator = map[string]string{"2": "javascript:alert(1)", "1": "//cdn.frankerfacez.com/role/1"}
	sets.Room.VIP = map[string]string{"2": "https://cdn.example/" + strings.Repeat("a", 2048), "1": "https://user:pass@cdn.example/vip"}
	badges := ffzRoleBadges(sets)
	if len(badges) != 1 || badges["moderator"].URL != "https://cdn.frankerfacez.com/role/1" {
		t.Fatal("unsafe FFZ role image or missing safe fallback")
	}
}

func TestSevenTVVisibilityMetadata(t *testing.T) {
	var set sevenSet
	if err := json.Unmarshal([]byte(`{"emotes":[{"id":"listed","name":"Listed","data":{"listed":true}},{"id":"unlisted","name":"Unlisted","data":{"listed":false}},{"id":"disallowed","name":"Disallowed","data":{"listed":true,"flags":16777216}}]}`), &set); err != nil {
		t.Fatal(err)
	}
	emotes := make(map[string]Emote)
	add7(emotes, set)
	if emotes["Listed"].Unlisted || !emotes["Unlisted"].Unlisted || emotes["Disallowed"].Code != "" {
		t.Fatal("7TV visibility flags lost")
	}
}

func TestOptionalProviderRefreshRetainsOtherCachesAndLimitsRepeatedReads(t *testing.T) {
	var version atomic.Int32
	version.Store(1)
	var seven, other atomic.Int32
	host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/7tv/") {
			seven.Add(1)
			_, _ = fmt.Fprintf(w, `{"id":"global-set","emotes":[{"id":"emote%d","name":"Version%d","data":{"listed":true}}]}`, version.Load(), version.Load())
			return
		}
		other.Add(1)
		if r.URL.Path == "/ivr/user" {
			_, _ = w.Write([]byte(`[{"id":"123"}]`))
			return
		}
		if strings.Contains(r.URL.Path, "/badges/") || strings.Contains(r.URL.Path, "/bttv/") {
			_, _ = w.Write([]byte(`[]`))
			return
		}
		_, _ = w.Write([]byte(`{}`))
	}))
	defer host.Close()
	service := New(host.Client(), testEndpoints(host.URL))
	first, err := service.Load(context.Background(), "room")
	if err != nil || first.Emotes["Version1"].Code == "" {
		t.Fatal("initial provider metadata")
	}
	reads := other.Load()
	version.Store(2)
	fresh, err := service.Refresh(context.Background(), "room", []string{"7TV"})
	if err != nil || fresh.Emotes["Version2"].Code == "" || other.Load() != reads || seven.Load() != 4 {
		t.Fatal("selected refresh did not preserve other caches", seven.Load(), other.Load(), reads)
	}
	version.Store(3)
	limited, err := service.Refresh(context.Background(), "room", []string{"7TV"})
	if err != nil || limited.Emotes["Version2"].Code == "" || seven.Load() != 4 {
		t.Fatal("refresh bypassed cooldown")
	}
	if _, err := service.Refresh(context.Background(), "room", []string{"https://other.example"}); err == nil {
		t.Fatal("arbitrary refresh source accepted")
	}
}

func TestProviderRefreshWaitsForOlderInFlightData(t *testing.T) {
	started, finish := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	host := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) == 1 {
			close(started)
			<-finish
			_, _ = w.Write([]byte(`{"version":1}`))
			return
		}
		_, _ = w.Write([]byte(`{"version":2}`))
	}))
	defer host.Close()
	service := New(host.Client(), Endpoints{})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	old := make(chan []byte, 1)
	go func() { data, _ := service.get(ctx, host.URL, time.Minute); old <- data }()
	<-started
	fresh := make(chan []byte, 1)
	go func() {
		if err := service.expire(ctx, host.URL); err != nil {
			fresh <- nil
			return
		}
		data, _ := service.get(ctx, host.URL, time.Minute)
		fresh <- data
	}()
	close(finish)
	<-old
	if got := string(<-fresh); got != `{"version":2}` || calls.Load() != 2 {
		t.Fatal("older flight restored stale provider data", got, calls.Load())
	}
}
