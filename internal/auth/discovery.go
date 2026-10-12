package auth

import (
	"encoding/json"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// Discovery is an explicit, account-bound read. Each click returns one page.
type discoveryItem struct {
	ID       string `json:"id"`
	Login    string `json:"login"`
	Name     string `json:"name"`
	Title    string `json:"title,omitempty"`
	Category string `json:"category,omitempty"`
	Viewers  int    `json:"viewers,omitempty"`
}

func validCursor(value string) bool {
	return len(value) <= 512 && strings.IndexFunc(value, unicode.IsControl) < 0
}
func discoveryText(value string, limit int) bool {
	return utf8.ValidString(value) && utf8.RuneCountInString(value) <= limit && strings.IndexFunc(value, unicode.IsControl) < 0
}
func (s *Service) discovery(w http.ResponseWriter, r *http.Request) {
	if !s.sameHost(r) {
		http.Error(w, "Invalid request host", http.StatusForbidden)
		return
	}
	q := r.URL.Query()
	for key, values := range q {
		if (key != "kind" && key != "channel" && key != "after") || len(values) != 1 {
			http.Error(w, "Invalid discovery query", http.StatusBadRequest)
			return
		}
	}
	kind, channel, after := q.Get("kind"), q.Get("channel"), q.Get("after")
	if (kind != "followed" && kind != "live" && kind != "chatters") || !validCursor(after) || (kind == "chatters" && !channelPattern.MatchString(channel)) || (kind != "chatters" && channel != "") {
		http.Error(w, "Invalid discovery query", http.StatusBadRequest)
		return
	}
	p := s.lookup(r)
	if p == nil {
		http.Error(w, "Log in to load channel discovery", http.StatusUnauthorized)
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if !s.check(r.Context(), p, time.Now()) {
		http.Error(w, "Session expired; log in again", http.StatusUnauthorized)
		return
	}
	scope := "user:read:follows"
	if kind == "chatters" {
		scope = "moderator:read:chatters"
	}
	if !slices.Contains(p.user.Scopes, scope) {
		http.Error(w, "Grant "+scope+" to load this list", http.StatusForbidden)
		return
	}
	now := time.Now()
	if now.Sub(p.discoveryWindow) >= time.Minute {
		p.discoveryWindow = now
		p.discoveryRequests = 0
	}
	if now.Before(p.discoveryRetryAt) || p.discoveryRequests >= 20 {
		delay := max(60, int(time.Until(p.discoveryRetryAt).Seconds())+1)
		w.Header().Set("Retry-After", strconv.Itoa(delay))
		http.Error(w, "Discovery rate limit; wait before refreshing", http.StatusTooManyRequests)
		return
	}
	p.discoveryRequests++
	params := url.Values{"first": {"100"}, "user_id": {p.user.UserID}}
	path := "/channels/followed"
	if after != "" {
		params.Set("after", after)
	}
	if kind == "live" {
		path = "/streams/followed"
	}
	if kind == "chatters" {
		data, status, ok := s.helix(r.Context(), p, http.MethodGet, "/users?login="+url.QueryEscape(channel), nil)
		if !ok || status != 200 {
			s.discoveryError(w, status, p)
			return
		}
		var users struct {
			Data []struct {
				ID string `json:"id"`
			} `json:"data"`
		}
		if json.Unmarshal(data, &users) != nil || len(users.Data) != 1 || !numericID(users.Data[0].ID) {
			http.Error(w, "Channel unavailable", http.StatusNotFound)
			return
		}
		params.Del("user_id")
		params.Set("broadcaster_id", users.Data[0].ID)
		params.Set("moderator_id", p.user.UserID)
		path = "/chat/chatters"
	}
	data, status, ok := s.helix(r.Context(), p, http.MethodGet, path+"?"+params.Encode(), nil)
	if !ok || status != 200 {
		s.discoveryError(w, status, p)
		return
	}
	var page struct {
		Data []struct {
			BroadcasterID    string `json:"broadcaster_id"`
			BroadcasterLogin string `json:"broadcaster_login"`
			BroadcasterName  string `json:"broadcaster_name"`
			UserID           string `json:"user_id"`
			UserLogin        string `json:"user_login"`
			UserName         string `json:"user_name"`
			Title            string `json:"title"`
			Category         string `json:"game_name"`
			Viewers          int    `json:"viewer_count"`
		} `json:"data"`
		Pagination struct {
			Cursor string `json:"cursor"`
		} `json:"pagination"`
		Total int `json:"total"`
	}
	if json.Unmarshal(data, &page) != nil || page.Data == nil || len(page.Data) > 100 || !validCursor(page.Pagination.Cursor) || page.Total < 0 {
		http.Error(w, "Invalid discovery response", http.StatusBadGateway)
		return
	}
	items := make([]discoveryItem, 0, len(page.Data))
	for _, row := range page.Data {
		item := discoveryItem{ID: row.BroadcasterID, Login: row.BroadcasterLogin, Name: row.BroadcasterName}
		if kind != "followed" {
			item.ID = row.UserID
			item.Login = row.UserLogin
			item.Name = row.UserName
		}
		if !numericID(item.ID) || !channelPattern.MatchString(item.Login) || !discoveryText(item.Name, 100) || !discoveryText(row.Title, 500) || !discoveryText(row.Category, 100) || row.Viewers < 0 {
			http.Error(w, "Invalid discovery response", http.StatusBadGateway)
			return
		}
		if kind == "live" {
			item.Title = row.Title
			item.Category = row.Category
			item.Viewers = row.Viewers
		}
		items = append(items, item)
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]any{"kind": kind, "channel": channel, "accountID": p.user.UserID, "items": items, "after": page.Pagination.Cursor, "total": page.Total, "observedAt": time.Now().UnixMilli()}); err != nil {
		return
	}
}
func numericID(value string) bool {
	if len(value) == 0 || len(value) > 30 {
		return false
	}
	for _, c := range value {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}
func (s *Service) discoveryError(w http.ResponseWriter, status int, p *session) {
	switch status {
	case 401:
		http.Error(w, "Session expired; log in again", http.StatusUnauthorized)
	case 403:
		http.Error(w, "Missing Twitch read permission or broadcaster/moderator role", http.StatusForbidden)
	case 429:
		w.Header().Set("Retry-After", strconv.Itoa(max(60, int(time.Until(p.discoveryRetryAt).Seconds())+1)))
		http.Error(w, "Twitch rate limit; wait before refreshing", http.StatusTooManyRequests)
	default:
		http.Error(w, "Twitch discovery unavailable; try again later", http.StatusBadGateway)
	}
}
