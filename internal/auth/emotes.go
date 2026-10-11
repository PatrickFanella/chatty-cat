package auth

import (
	"encoding/json"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type accountEmote struct {
	Code      string `json:"code"`
	URL       string `json:"url"`
	StaticURL string `json:"staticUrl"`
	Source    string `json:"source"`
	Animated  bool   `json:"animated"`
	ZeroWidth bool   `json:"zeroWidth"`
}

// Each request returns one bounded page; the browser never supplies a user ID.
func (s *Service) emotes(w http.ResponseWriter, r *http.Request) {
	if !s.sameHost(r) {
		http.Error(w, "Invalid request host", http.StatusForbidden)
		return
	}
	query := r.URL.Query()
	for key := range query {
		if key != "channel" && key != "after" {
			http.Error(w, "Invalid emote query", http.StatusBadRequest)
			return
		}
	}
	channel, after := query.Get("channel"), query.Get("after")
	if (channel != "" && !channelPattern.MatchString(channel)) || len(after) > 512 || strings.IndexFunc(after, unicode.IsControl) >= 0 {
		http.Error(w, "Invalid emote query", http.StatusBadRequest)
		return
	}
	p := s.lookup(r)
	if p == nil {
		http.Error(w, "Log in to load account emotes", http.StatusUnauthorized)
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if !s.check(r.Context(), p, time.Now()) {
		http.Error(w, "Session expired; log in again", http.StatusUnauthorized)
		return
	}
	if !slices.Contains(p.user.Scopes, "user:read:emotes") {
		http.Error(w, "Sign out and log in again to enable account emotes", http.StatusForbidden)
		return
	}
	if time.Since(p.emoteWindow) >= time.Minute {
		p.emoteWindow = time.Now()
		p.emoteRequests = 0
	}
	if p.emoteRequests >= 60 {
		w.Header().Set("Retry-After", "60")
		http.Error(w, "Account emotes are busy; try again shortly", http.StatusTooManyRequests)
		return
	}
	p.emoteRequests++
	params := url.Values{"user_id": {p.user.UserID}}
	if after != "" {
		params.Set("after", after)
	}
	if channel != "" {
		data, status, ok := s.helix(r.Context(), p, http.MethodGet, "/users?login="+url.QueryEscape(channel), nil)
		if !ok || status != http.StatusOK {
			http.Error(w, "Channel lookup unavailable", http.StatusBadGateway)
			return
		}
		var users struct{ Data []struct{ ID, Login string } }
		if json.Unmarshal(data, &users) != nil || len(users.Data) != 1 || users.Data[0].Login != channel || users.Data[0].ID == "" {
			http.Error(w, "Channel not found", http.StatusNotFound)
			return
		}
		params.Set("broadcaster_id", users.Data[0].ID)
	}
	data, status, ok := s.helix(r.Context(), p, http.MethodGet, "/chat/emotes/user?"+params.Encode(), nil)
	if !ok || status != http.StatusOK {
		code := http.StatusBadGateway
		if status == http.StatusUnauthorized || status == http.StatusForbidden || status == http.StatusTooManyRequests {
			code = status
		}
		http.Error(w, "Twitch account emotes unavailable; try again or log in again", code)
		return
	}
	var page struct {
		Data []struct {
			ID     string   `json:"id"`
			Name   string   `json:"name"`
			Format []string `json:"format"`
			Scale  []string `json:"scale"`
			Theme  []string `json:"theme_mode"`
		} `json:"data"`
		Pagination struct {
			Cursor string `json:"cursor"`
		} `json:"pagination"`
	}
	if json.Unmarshal(data, &page) != nil || len(page.Data) > 1000 || len(page.Pagination.Cursor) > 512 || strings.IndexFunc(page.Pagination.Cursor, unicode.IsControl) >= 0 {
		http.Error(w, "Invalid emote response", http.StatusBadGateway)
		return
	}
	result := make([]accountEmote, 0, len(page.Data))
	for _, e := range page.Data {
		if !messageIDPattern.MatchString(e.ID) || e.Name == "" || !utf8.ValidString(e.Name) || utf8.RuneCountInString(e.Name) > 100 || strings.IndexFunc(e.Name, unicode.IsSpace) >= 0 || strings.IndexFunc(e.Name, unicode.IsControl) >= 0 {
			continue
		}
		scale, theme := "1.0", "dark"
		if slices.Contains(e.Scale, "2.0") {
			scale = "2.0"
		}
		if !slices.Contains(e.Theme, "dark") && slices.Contains(e.Theme, "light") {
			theme = "light"
		}
		base := "https://static-cdn.jtvnw.net/emoticons/v2/" + e.ID + "/"
		static := base + "static/" + theme + "/" + scale
		animated := slices.Contains(e.Format, "animated")
		image := static
		if animated {
			image = base + "animated/" + theme + "/" + scale
		}
		result = append(result, accountEmote{e.Name, image, static, "Twitch", animated, false})
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(struct {
		Emotes []accountEmote `json:"emotes"`
		After  string         `json:"after"`
	}{result, page.Pagination.Cursor}); err != nil {
		return
	}
}
