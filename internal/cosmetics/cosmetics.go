// Package cosmetics reads explicitly configured public badge catalogs. It never
// supplies Twitch authority, user state or provider activity writes.
package cosmetics

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const catalogLimit = 4 << 20

var accountID = regexp.MustCompile(`^[0-9]{1,32}$`)
var defaults = map[string]string{"FFZ": "https://api.frankerfacez.com/v1/badges/ids", "Chatterino": "https://api.chatterino.com/badges"}

// Catalog IDs may be decimal JSON integers or strings. Keep exact digits; never
// pass Twitch IDs through float64.
type catalogID string

func (id *catalogID) UnmarshalJSON(raw []byte) error {
	value := string(raw)
	if len(raw) > 0 && raw[0] == '"' {
		if err := json.Unmarshal(raw, &value); err != nil {
			return err
		}
	}
	if !accountID.MatchString(value) {
		return errors.New("invalid cosmetic user ID")
	}
	*id = catalogID(value)
	return nil
}

type Config struct {
	Providers string
	Endpoints map[string]string
}
type Badge struct {
	Provider string `json:"provider"`
	URL      string `json:"url"`
	Title    string `json:"title"`
}
type Result struct {
	Providers []string           `json:"providers"`
	Badges    map[string][]Badge `json:"badges"`
	Errors    []string           `json:"errors"`
}
type cached struct {
	badges map[string][]Badge
	until  time.Time
	failed bool
}
type Service struct {
	providers []string
	endpoints map[string]string
	client    *http.Client
	mu        sync.Mutex
	cache     map[string]cached
	slot      chan struct{}
}

func New(cfg Config) (*Service, error) {
	s := &Service{providers: []string{}, endpoints: make(map[string]string), cache: make(map[string]cached), slot: make(chan struct{}, 1), client: &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
	seen := make(map[string]bool)
	if cfg.Providers != "" {
		for _, name := range strings.Split(cfg.Providers, ",") {
			name = strings.TrimSpace(name)
			endpoint, ok := defaults[name]
			if !ok || seen[name] {
				return nil, errors.New("invalid cosmetic provider list")
			}
			seen[name] = true
			if cfg.Endpoints[name] != "" {
				endpoint = cfg.Endpoints[name]
			}
			s.providers = append(s.providers, name)
			s.endpoints[name] = endpoint
		}
	}
	return s, nil
}
func (s *Service) Close()              { s.client.CloseIdleConnections() }
func (s *Service) Providers() []string { return append([]string{}, s.providers...) }
func (s *Service) Load(ctx context.Context, ids []string) (Result, error) {
	result := Result{Providers: s.Providers(), Badges: make(map[string][]Badge), Errors: []string{}}
	if len(ids) > 100 {
		return result, errors.New("too many public user IDs")
	}
	for _, id := range ids {
		if !accountID.MatchString(id) {
			return result, errors.New("invalid public user ID")
		}
	}
	if len(ids) == 0 || len(s.providers) == 0 {
		return result, nil
	}
	for _, provider := range s.providers {
		entry, err := s.catalog(ctx, provider)
		if err != nil {
			return result, err
		}
		if entry.failed {
			result.Errors = append(result.Errors, provider+" catalog unavailable; last good data may be stale")
		}
		seen := make(map[string]bool)
		for _, id := range ids {
			if seen[id] {
				continue
			}
			seen[id] = true
			if badges := entry.badges[id]; len(badges) > 0 {
				result.Badges[id] = append(result.Badges[id], badges...)
			}
		}
	}
	return result, nil
}
func (s *Service) catalog(ctx context.Context, provider string) (cached, error) {
	s.mu.Lock()
	entry := s.cache[provider]
	s.mu.Unlock()
	if time.Now().Before(entry.until) {
		return entry, nil
	}
	select {
	case s.slot <- struct{}{}:
		defer func() { <-s.slot }()
	default:
		return cached{}, errors.New("cosmetic catalog busy")
	}
	// Another caller may have completed before this slot was acquired.
	s.mu.Lock()
	entry = s.cache[provider]
	s.mu.Unlock()
	if time.Now().Before(entry.until) {
		return entry, nil
	}
	badges, err := s.read(ctx, provider)
	if ctx.Err() != nil {
		return cached{}, ctx.Err()
	}
	entry.until = time.Now().Add(10 * time.Minute)
	entry.failed = err != nil
	if err == nil {
		entry.badges = badges
	} else {
		entry.until = time.Now().Add(time.Minute)
	}
	s.mu.Lock()
	s.cache[provider] = entry
	s.mu.Unlock()
	return entry, nil
}
func (s *Service) read(ctx context.Context, provider string) (map[string][]Badge, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.endpoints[provider], nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	res, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err := res.Body.Close(); err != nil {
			slog.Debug("cosmetic response closed", "error", err)
		}
	}()
	if res.StatusCode != http.StatusOK || res.ContentLength > catalogLimit {
		return nil, errors.New("cosmetic catalog unavailable")
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, catalogLimit+1))
	if err != nil {
		return nil, err
	}
	if len(data) > catalogLimit {
		return nil, errors.New("cosmetic catalog exceeds limit")
	}
	return parseCatalog(provider, data)
}
func image(raw string) (string, error) {
	if strings.HasPrefix(raw, "//") {
		raw = "https:" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || len(raw) > 2048 || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || strings.ContainsAny(raw, "\t\n\r ") {
		return "", errors.New("invalid cosmetic image")
	}
	return u.String(), nil
}
func parseCatalog(provider string, data []byte) (map[string][]Badge, error) {
	var wire struct {
		Badges []struct {
			ID      int               `json:"id"`
			Title   string            `json:"title"`
			Tooltip string            `json:"tooltip"`
			URLs    map[string]string `json:"urls"`
			Image1  string            `json:"image1"`
			Image2  string            `json:"image2"`
			Users   []catalogID       `json:"users"`
		}
		Users map[string][]catalogID `json:"users"`
	}
	if len(data) > catalogLimit || json.Unmarshal(data, &wire) != nil || wire.Badges == nil || len(wire.Badges) > 128 || len(wire.Users) > 128 {
		return nil, errors.New("invalid cosmetic catalog")
	}
	result := make(map[string][]Badge)
	assignments := 0
	seen := make(map[string]bool)
	for _, badge := range wire.Badges {
		var title, raw, key string
		var users []catalogID
		switch provider {
		case "FFZ":
			if badge.ID < 1 {
				return nil, errors.New("invalid FFZ badge ID")
			}
			key = strconv.Itoa(badge.ID)
			title = badge.Title
			raw = badge.URLs["2"]
			if raw == "" {
				raw = badge.URLs["1"]
			}
			users = wire.Users[key]
		case "Chatterino":
			title = badge.Tooltip
			raw = badge.Image2
			if raw == "" {
				raw = badge.Image1
			}
			users = badge.Users
			key = raw
		default:
			return nil, errors.New("unknown cosmetic provider")
		}
		if seen[key] || len(title) == 0 || len(title) > 200 {
			return nil, errors.New("invalid cosmetic badge")
		}
		seen[key] = true
		address, err := image(raw)
		if err != nil {
			return nil, err
		}
		entry := Badge{Provider: provider, URL: address, Title: title}
		for _, value := range users {
			id := string(value)
			assignments++
			if assignments > 100000 || !accountID.MatchString(id) || len(result[id]) >= 8 {
				return nil, errors.New("invalid cosmetic assignments")
			}
			result[id] = append(result[id], entry)
		}
	}
	if provider == "FFZ" {
		for key := range wire.Users {
			if !seen[key] {
				return nil, errors.New("cosmetic assignments reference unknown badge")
			}
		}
	}
	return result, nil
}

// Register serves only public IDs that were requested, never the full assignment catalog.
func (s *Service) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/cosmetics/config", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if err := json.NewEncoder(w).Encode(struct {
			Providers []string `json:"providers"`
		}{s.Providers()}); err != nil {
			return
		}
	})
	mux.HandleFunc("GET /api/cosmetics", func(w http.ResponseWriter, r *http.Request) {
		if len(r.URL.RawQuery) > 4096 {
			http.Error(w, "query exceeds limit", http.StatusBadRequest)
			return
		}
		ids := []string{}
		if raw := r.URL.Query().Get("users"); raw != "" {
			ids = strings.Split(raw, ",")
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		result, err := s.Load(ctx, ids)
		if err != nil {
			http.Error(w, "cosmetic badges unavailable", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if err := json.NewEncoder(w).Encode(result); err != nil {
			return
		}
	})
}
