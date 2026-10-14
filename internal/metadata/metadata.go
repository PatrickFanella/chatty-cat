// Package metadata normalizes public emote, badge and stream providers.
package metadata

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Emote is the winning provider entry for one channel-specific emote code.
type Emote struct {
	Code      string `json:"code"`
	Unlisted  bool   `json:"unlisted,omitempty"`
	URL       string `json:"url"`
	StaticURL string `json:"staticUrl"`
	Source    string `json:"source"`
	Animated  bool   `json:"animated"`
	ZeroWidth bool   `json:"zeroWidth"`
}

// EmoteSet keeps provider/scope provenance so disabling a winner exposes the next source.
type EmoteSet struct {
	Provider string           `json:"provider"`
	Scope    string           `json:"scope"`
	Emotes   map[string]Emote `json:"emotes"`
}

// Badge retains presentation metadata for a specific badge version.
type Badge struct {
	URL         string `json:"url"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

// Stream contains the unauthenticated stream status fields used by the header.
type Stream struct {
	Uptime  string `json:"uptime"`
	Viewers string `json:"viewers"`
	Title   string `json:"title"`
	Game    string `json:"game"`
}

type SevenTVContext struct {
	UserID       string `json:"userID"`
	ChannelSetID string `json:"channelSetID"`
	GlobalSetID  string `json:"globalSetID"`
}

// Channel contains metadata for one room; Errors identifies partial failures.
type Channel struct {
	SevenTV       *SevenTVContext             `json:"sevenTV,omitempty"`
	FFZRoleBadges map[string]Badge            `json:"ffzRoleBadges,omitempty"`
	BroadcasterID string                      `json:"broadcasterID,omitempty"`
	EmoteSets     []EmoteSet                  `json:"emoteSets"`
	LastVod       *Vod                        `json:"lastVod,omitempty"`
	Channel       string                      `json:"channel"`
	EmoteUse      map[string]int64            `json:"emoteUse"`
	Emotes        map[string]Emote            `json:"emotes"`
	Badges        map[string]map[string]Badge `json:"badges"`
	Stream        Stream                      `json:"stream"`
	Errors        []string                    `json:"errors"`
}

// Endpoints allows deterministic local-provider integration tests.
type Endpoints struct{ SevenTV, BTTV, FFZ, IVR, DecAPI, StreamElements string }

// DefaultEndpoints returns the public services used by the original relay.
func DefaultEndpoints() Endpoints {
	return Endpoints{SevenTV: "https://7tv.io/v3", BTTV: "https://api.betterttv.net/3/cached", FFZ: "https://api.frankerfacez.com/v1", IVR: "https://api.ivr.fi/v2/twitch", DecAPI: "https://decapi.me/twitch", StreamElements: "https://api.streamelements.com/kappa/v2/chatstats"}
}

type cacheEntry struct {
	data    []byte
	expires time.Time
	err     error
}
type flight struct {
	done chan struct{}
	data []byte
	err  error
}

// Service caches and coalesces public metadata requests, with bounded I/O.
type PublicReader func(context.Context, string) ([]byte, error)

type Service struct {
	publicRead PublicReader
	client     *http.Client
	endpoints  Endpoints
	mu         sync.Mutex
	cache      map[string]cacheEntry
	flights    map[string]*flight
	permits    chan struct{}
	cacheBytes int
	refreshes  map[string]time.Time
}

// New constructs a provider service. Empty endpoints select production defaults.
func New(client *http.Client, endpoints Endpoints, readers ...PublicReader) *Service {
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	if endpoints == (Endpoints{}) {
		endpoints = DefaultEndpoints()
	}
	var read PublicReader
	if len(readers) > 0 {
		read = readers[0]
	}
	return &Service{publicRead: read, client: client, endpoints: endpoints, refreshes: map[string]time.Time{}, cache: make(map[string]cacheEntry), flights: make(map[string]*flight), permits: make(chan struct{}, 8)}
}

// Expire only a selected provider URL, after any older fetch finishes. Retain its
// last good bytes for failure fallback and bound forced reads independently of views.
func (s *Service) expire(ctx context.Context, address string) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		s.mu.Lock()
		now := time.Now()
		if now.Before(s.refreshes[address]) {
			s.mu.Unlock()
			return nil
		}
		if running := s.flights[address]; running != nil {
			s.mu.Unlock()
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-running.done:
				continue
			}
		}
		if len(s.refreshes) >= 256 {
			for key, until := range s.refreshes {
				if !now.Before(until) {
					delete(s.refreshes, key)
				}
			}
			if len(s.refreshes) >= 256 {
				s.mu.Unlock()
				return errors.New("provider refresh capacity reached")
			}
		}
		s.refreshes[address] = now.Add(30 * time.Second)
		if old, ok := s.cache[address]; ok {
			old.expires = time.Time{}
			s.cache[address] = old
		}
		s.mu.Unlock()
		return nil
	}
}

func (s *Service) get(ctx context.Context, address string, ttl time.Duration) ([]byte, error) {
	s.mu.Lock()
	old := s.cache[address]
	if time.Now().Before(old.expires) {
		s.mu.Unlock()
		return old.data, old.err
	}
	if running := s.flights[address]; running != nil {
		s.mu.Unlock()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-running.done:
			return running.data, running.err
		}
	}
	running := &flight{done: make(chan struct{})}
	s.flights[address] = running
	s.mu.Unlock()
	data, err := s.fetch(ctx, address)
	s.mu.Lock()
	// Cache transient failures briefly; keep previous successful data for fallback.
	entry := cacheEntry{data: data, err: err, expires: time.Now().Add(ttl)}
	if err != nil {
		entry.data = old.data
		entry.expires = time.Now().Add(30 * time.Second)
	}
	if ctx.Err() == nil {
		if previous, ok := s.cache[address]; ok {
			s.cacheBytes -= len(previous.data)
			delete(s.cache, address)
		}
		for len(s.cache) >= 256 || s.cacheBytes+len(entry.data) > 32<<20 {
			for key, candidate := range s.cache {
				s.cacheBytes -= len(candidate.data)
				delete(s.cache, key)
				break
			}
		}
		s.cache[address] = entry
		s.cacheBytes += len(entry.data)
	}
	running.data, running.err = entry.data, entry.err
	delete(s.flights, address)
	close(running.done)
	s.mu.Unlock()
	return entry.data, entry.err
}

func (s *Service) fetch(ctx context.Context, address string) ([]byte, error) {
	select {
	case s.permits <- struct{}{}:
		defer func() { <-s.permits }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	if strings.HasPrefix(address, "helix:") {
		if s.publicRead == nil {
			return nil, errors.New("public Twitch metadata unavailable")
		}
		return s.publicRead(ctx, strings.TrimPrefix(address, "helix:"))
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, fmt.Errorf("provider request: %w", err)
	}
	req.Header.Set("Accept", "application/json, text/plain")
	res, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("provider fetch: %w", err)
	}
	defer func() {
		if err := res.Body.Close(); err != nil {
			slog.Debug("provider body closed", "error", err)
		}
	}()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("provider status %d", res.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, (8<<20)+1))
	if err != nil {
		return nil, fmt.Errorf("read provider: %w", err)
	}
	if len(data) > 8<<20 {
		return nil, errors.New("provider response too large")
	}
	if !strings.HasPrefix(address, s.endpoints.DecAPI+"/") && !json.Valid(data) {
		return nil, errors.New("provider returned invalid JSON")
	}
	return data, nil
}

var channelPattern = regexp.MustCompile(`^[a-z0-9_]{1,25}$`)
var idPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)

// Load combines globals then channel sets in the original provider precedence.
// A failed provider leaves the others available and names the missing source.
func (s *Service) Load(ctx context.Context, channel string) (Channel, error) {
	return s.load(ctx, channel, nil)
}

// Refresh bypasses only explicitly selected 7TV/BTTV provider caches, at most once per URL per 30 seconds.
func (s *Service) Refresh(ctx context.Context, channel string, providers []string) (Channel, error) {
	selected := map[string]bool{}
	if len(providers) < 1 || len(providers) > 2 {
		return Channel{}, errors.New("invalid provider refresh selection")
	}
	for _, provider := range providers {
		if provider != "7TV" && provider != "BTTV" || selected[provider] {
			return Channel{}, errors.New("invalid provider refresh selection")
		}
		selected[provider] = true
	}
	return s.load(ctx, channel, selected)
}
func (s *Service) load(ctx context.Context, channel string, refresh map[string]bool) (Channel, error) {
	result := Channel{Channel: channel, EmoteUse: make(map[string]int64), Emotes: make(map[string]Emote), Badges: make(map[string]map[string]Badge), Errors: []string{}}
	if !channelPattern.MatchString(channel) {
		return result, errors.New("invalid channel")
	}
	var mu sync.Mutex
	get := func(name, address string, ttl time.Duration) []byte {
		if refresh[strings.SplitN(name, " ", 2)[0]] {
			if err := s.expire(ctx, address); err != nil {
				mu.Lock()
				result.Errors = append(result.Errors, name+" refresh unavailable")
				mu.Unlock()
			}
		}
		data, err := s.get(ctx, address, ttl)
		if err != nil {
			mu.Lock()
			result.Errors = append(result.Errors, name)
			mu.Unlock()
		}
		return data
	}
	// User ID is a dependency for channel lookups, but not for global providers.
	var userData, stvGlobal, bttvGlobal, ffzGlobal, badgesGlobal, twitchGlobal []byte
	var wg sync.WaitGroup
	task := func(fn func()) { wg.Add(1); go func() { defer wg.Done(); fn() }() }
	const emoteTTL = 10 * time.Minute
	if s.publicRead != nil {
		task(func() { twitchGlobal = get("Twitch global emotes", "helix:/chat/emotes/global", emoteTTL) })
	}
	task(func() { userData = get("user", s.endpoints.IVR+"/user?login="+channel, emoteTTL) })
	task(func() { stvGlobal = get("7TV global", s.endpoints.SevenTV+"/emote-sets/global", emoteTTL) })
	task(func() { bttvGlobal = get("BTTV global", s.endpoints.BTTV+"/emotes/global", emoteTTL) })
	task(func() { ffzGlobal = get("FFZ global", s.endpoints.FFZ+"/set/global", emoteTTL) })
	task(func() { badgesGlobal = get("badges global", s.endpoints.IVR+"/badges/global", emoteTTL) })
	var uptime, viewers, title, game, usage []byte
	if s.endpoints.StreamElements != "" {
		task(func() { usage = get("StreamElements usage", s.endpoints.StreamElements+"/"+channel+"/stats", emoteTTL) })
	}
	task(func() { uptime = get("stream uptime", s.endpoints.DecAPI+"/uptime/"+channel, time.Minute) })
	task(func() { viewers = get("stream viewers", s.endpoints.DecAPI+"/viewercount/"+channel, time.Minute) })
	task(func() { title = get("stream title", s.endpoints.DecAPI+"/title/"+channel, time.Minute) })
	task(func() { game = get("stream category", s.endpoints.DecAPI+"/game/"+channel, time.Minute) })
	wg.Wait()
	var user struct {
		ID string `json:"id"`
	}
	var users []struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(userData, &users) == nil && len(users) > 0 {
		user.ID = users[0].ID
	} else if err := json.Unmarshal(userData, &user); err != nil && len(userData) > 0 {
		result.Errors = append(result.Errors, "user data")
	}
	if !idPattern.MatchString(user.ID) && s.publicRead != nil {
		data := get("Twitch user", "helix:/users?login="+channel, emoteTTL)
		var response struct {
			Data []struct {
				ID    string `json:"id"`
				Login string `json:"login"`
			}
		}
		if json.Unmarshal(data, &response) == nil && len(response.Data) == 1 && response.Data[0].Login == channel && idPattern.MatchString(response.Data[0].ID) {
			user.ID = response.Data[0].ID
		}
	}
	if user.ID != "" {
		if _, err := strconv.ParseUint(user.ID, 10, 64); err == nil {
			result.BroadcasterID = user.ID
		}
	}
	var stvUser, bttvUser, ffzRoom, ffzAnim, badgesChan, vodData, twitchChannel []byte
	task(func() { ffzRoom = get("FFZ channel", s.endpoints.FFZ+"/room/"+channel, emoteTTL) })
	if idPattern.MatchString(user.ID) {
		if s.publicRead != nil {
			task(func() {
				twitchChannel = get("Twitch channel emotes", "helix:/chat/emotes?broadcaster_id="+url.QueryEscape(user.ID), emoteTTL)
			})
			task(func() {
				vodData = get("Twitch last VOD", "helix:/videos?user_id="+url.QueryEscape(user.ID)+"&type=archive&sort=time&first=1", time.Minute)
			})
		}
		task(func() { stvUser = get("7TV channel", s.endpoints.SevenTV+"/users/twitch/"+user.ID, emoteTTL) })
		task(func() { bttvUser = get("BTTV channel", s.endpoints.BTTV+"/users/twitch/"+user.ID, emoteTTL) })
		task(func() {
			ffzAnim = get("FFZ animated", s.endpoints.BTTV+"/frankerfacez/users/twitch/"+user.ID, emoteTTL)
		})
		task(func() { badgesChan = get("badges channel", s.endpoints.IVR+"/badges/channel?id="+user.ID, emoteTTL) })
	}
	wg.Wait()
	decode := func(name string, data []byte, target any) bool {
		if len(data) == 0 {
			return false
		}
		if err := json.Unmarshal(data, target); err != nil {
			result.Errors = append(result.Errors, name+" data")
			return false
		}
		return true
	}
	if len(usage) > 0 {
		counts, err := parseUsage(usage)
		if err != nil {
			result.Errors = append(result.Errors, "StreamElements usage data")
		} else {
			result.EmoteUse = counts
		}
	}
	if len(vodData) > 0 {
		vod, err := parseVod(vodData, user.ID)
		if err != nil {
			result.Errors = append(result.Errors, "Twitch last VOD data")
		} else {
			result.LastVod = vod
		}
	}
	var global7 sevenSet
	var channel7 struct {
		Set  sevenSet `json:"emote_set"`
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	var globalB []bttvEmote
	var channelB struct {
		Channel []bttvEmote `json:"channelEmotes"`
		Shared  []bttvEmote `json:"sharedEmotes"`
	}
	var globalF, channelF ffzSets
	decode("7TV global", stvGlobal, &global7)
	decode("BTTV global", bttvGlobal, &globalB)
	decode("FFZ global", ffzGlobal, &globalF)
	decode("7TV channel", stvUser, &channel7)
	decode("BTTV channel", bttvUser, &channelB)
	decode("FFZ channel", ffzRoom, &channelF)
	seven := SevenTVContext{}
	if idPattern.MatchString(global7.ID) {
		seven.GlobalSetID = global7.ID
	}
	if idPattern.MatchString(channel7.Set.ID) {
		seven.ChannelSetID = channel7.Set.ID
	}
	if idPattern.MatchString(channel7.User.ID) {
		seven.UserID = channel7.User.ID
	}
	if seven != (SevenTVContext{}) {
		result.SevenTV = &seven
	}
	result.FFZRoleBadges = ffzRoleBadges(channelF)
	sets := []EmoteSet{
		{Provider: "7TV", Scope: "global", Emotes: make(map[string]Emote)},
		{Provider: "BTTV", Scope: "global", Emotes: make(map[string]Emote)},
		{Provider: "FFZ", Scope: "global", Emotes: make(map[string]Emote)},
		{Provider: "7TV", Scope: "channel", Emotes: make(map[string]Emote)},
		{Provider: "BTTV", Scope: "channel", Emotes: make(map[string]Emote)},
		{Provider: "FFZ", Scope: "channel", Emotes: make(map[string]Emote)},
		{Provider: "Twitch", Scope: "global", Emotes: make(map[string]Emote)},
		{Provider: "Twitch", Scope: "channel", Emotes: make(map[string]Emote)},
	}
	add7(sets[0].Emotes, global7)
	addB(sets[1].Emotes, globalB)
	addF(sets[2].Emotes, globalF)
	add7(sets[3].Emotes, channel7.Set)
	addB(sets[4].Emotes, append(channelB.Channel, channelB.Shared...))
	addF(sets[5].Emotes, channelF)
	var animated []struct {
		Code     string            `json:"code"`
		Animated bool              `json:"animated"`
		Images   map[string]string `json:"images"`
	}
	decode("FFZ animated", ffzAnim, &animated)
	for _, e := range animated {
		if e.Animated {
			u := safeImage(first(e.Images["2x"], e.Images["1x"]))
			if u != "" {
				old := sets[5].Emotes[e.Code]
				old.Code = e.Code
				old.URL = u
				old.Source = "FFZ animated"
				old.Animated = true
				old.ZeroWidth = false
				sets[5].Emotes[e.Code] = old
			}
		}
	}
	var globalBadges, channelBadges []badgeSet
	decode("badges global", badgesGlobal, &globalBadges)
	decode("badges channel", badgesChan, &channelBadges)
	for _, set := range append(globalBadges, channelBadges...) {
		if result.Badges[set.ID] == nil {
			result.Badges[set.ID] = make(map[string]Badge)
		}
		for _, v := range set.Versions {
			if u := safeImage(first(v.Double, v.Single)); u != "" {
				result.Badges[set.ID][v.ID] = Badge{URL: u, Title: v.Title, Description: v.Description}
			}
		}
	}
	for i, entry := range []struct {
		name string
		data []byte
	}{{"Twitch global emotes", twitchGlobal}, {"Twitch channel emotes", twitchChannel}} {
		if len(entry.data) > 0 {
			if err := addTwitch(sets[6+i].Emotes, entry.data); err != nil {
				result.Errors = append(result.Errors, entry.name+" data")
			}
		}
	}
	for i := range sets {
		keys := make([]string, 0, len(sets[i].Emotes))
		for code := range sets[i].Emotes {
			keys = append(keys, code)
		}
		sort.Strings(keys)
		bounded := make(map[string]Emote)
		for _, code := range keys {
			e := sets[i].Emotes[code]
			if len(bounded) >= 2048 {
				result.Errors = append(result.Errors, sets[i].Provider+" "+sets[i].Scope+" truncated")
				break
			}
			if len(code) == 0 || len(code) > 100 || strings.ContainsAny(code, " \t\r\n") || len(e.URL) > 2048 || len(e.StaticURL) > 2048 {
				continue
			}
			bounded[code] = e
			result.Emotes[code] = e
		}
		sets[i].Emotes = bounded
	}
	result.EmoteSets = sets
	result.Stream = Stream{Uptime: strings.TrimSpace(string(uptime)), Viewers: strings.TrimSpace(string(viewers)), Title: strings.TrimSpace(string(title)), Game: strings.TrimSpace(string(game))}
	sort.Strings(result.Errors)
	if err := ctx.Err(); err != nil {
		return result, err
	}
	return result, nil
}

type sevenSet struct {
	ID     string `json:"id"`
	Emotes []struct {
		ID, Name string
		Flags    int
		Data     struct {
			Animated bool
			Listed   bool
			Flags    int64
		}
	} `json:"emotes"`
}
type bttvEmote struct {
	ID        string `json:"id"`
	Code      string `json:"code"`
	Animated  bool   `json:"animated"`
	ImageType string `json:"imageType"`
}
type ffzSets struct {
	Room struct {
		Moderator map[string]string `json:"mod_urls"`
		VIP       map[string]string `json:"vip_badge"`
	} `json:"room"`
	Sets map[string]struct {
		Emotes []struct {
			Name     string            `json:"name"`
			URLs     map[string]string `json:"urls"`
			Animated map[string]string `json:"animated"`
		} `json:"emoticons"`
	} `json:"sets"`
}

func ffzRoleBadges(sets ffzSets) map[string]Badge {
	badges := make(map[string]Badge)
	for role, images := range map[string]map[string]string{"moderator": sets.Room.Moderator, "vip": sets.Room.VIP} {
		for _, scale := range []string{"2", "1", "4"} {
			raw := images[scale]
			if len(raw) > 2048 || strings.ContainsAny(raw, " \t\r\n") {
				continue
			}
			if u := safeImage(raw); u != "" {
				title := "Moderator"
				if role == "vip" {
					title = "VIP"
				}
				badges[role] = Badge{URL: u, Title: title, Description: "FFZ artwork for native Twitch " + role + " badge"}
				break
			}
		}
	}
	return badges
}

type badgeSet struct {
	ID       string `json:"set_id"`
	Versions []struct {
		ID          string `json:"id"`
		Double      string `json:"image_url_2x"`
		Single      string `json:"image_url_1x"`
		Title       string `json:"title"`
		Description string `json:"description"`
	} `json:"versions"`
}

func add7(out map[string]Emote, set sevenSet) {
	for _, e := range set.Emotes {
		if idPattern.MatchString(e.ID) && e.Name != "" && e.Data.Flags&(1<<24) == 0 {
			out[e.Name] = Emote{Code: e.Name, URL: "https://cdn.7tv.app/emote/" + e.ID + "/2x.webp", StaticURL: "https://cdn.7tv.app/emote/" + e.ID + "/2x_static.webp", Source: "7TV", Unlisted: !e.Data.Listed, Animated: e.Data.Animated, ZeroWidth: e.Flags&1 != 0}
		}
	}
}
func addB(out map[string]Emote, list []bttvEmote) {
	for _, e := range list {
		if idPattern.MatchString(e.ID) && e.Code != "" {
			out[e.Code] = Emote{Code: e.Code, URL: "https://cdn.betterttv.net/emote/" + e.ID + "/2x", StaticURL: "https://cdn.betterttv.net/emote/" + e.ID + "/static/2x", Source: "BTTV", Animated: e.Animated || e.ImageType == "gif"}
		}
	}
}
func addF(out map[string]Emote, sets ffzSets) {
	keys := make([]string, 0, len(sets.Sets))
	for key := range sets.Sets {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		for _, e := range sets.Sets[key].Emotes {
			u := safeImage(first(e.URLs["2"], e.URLs["1"]))
			animated := safeImage(first(e.Animated["2"], e.Animated["1"]))
			if u != "" && e.Name != "" {
				out[e.Name] = Emote{Code: e.Name, URL: first(animated, u), StaticURL: u, Source: "FFZ", Animated: animated != ""}
			}
		}
	}
}
func first(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
func safeImage(value string) string {
	if strings.HasPrefix(value, "//") {
		value = "https:" + value
	}
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil {
		return ""
	}
	return u.String()
}
