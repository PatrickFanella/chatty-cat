package auth

import (
	"encoding/json"
	"net/http"
	"net/url"
	"slices"
	"time"
)

type moderationContext struct {
	Account       string         `json:"account"`
	Channel       string         `json:"channel"`
	BroadcasterID string         `json:"broadcasterID"`
	Target        string         `json:"target"`
	TargetID      string         `json:"targetID"`
	Role          string         `json:"role"`
	RoleDetail    string         `json:"roleDetail"`
	At            int64          `json:"at"`
	Settings      map[string]any `json:"settings"`
	TargetState   string         `json:"targetState"`
	TargetKind    string         `json:"targetKind"`
	ShieldState   string         `json:"shieldState"`
}

func (s *Service) moderationContext(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	for key, values := range q {
		if (key != "channel" && key != "user" && key != "identity") || len(values) != 1 {
			http.Error(w, "Invalid moderation context query", http.StatusBadRequest)
			return
		}
	}
	channel, target := q.Get("channel"), q.Get("user")
	idMode := q.Get("identity") == "id"
	if q.Get("identity") != "" && !idMode {
		http.Error(w, "Invalid target identity mode", http.StatusBadRequest)
		return
	}
	if idMode && (!numericID(target) || target[0] == '0') {
		http.Error(w, "Use a positive numeric user ID", http.StatusBadRequest)
		return
	}
	if !s.sameHost(r) || !channelPattern.MatchString(channel) || (!idMode && !channelPattern.MatchString(target)) {
		http.Error(w, "Choose a valid channel and user", http.StatusBadRequest)
		return
	}
	p := s.lookup(r)
	if p == nil {
		http.Error(w, "Log in for moderation context", http.StatusUnauthorized)
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if s.lookup(r) != p || !s.check(r.Context(), p, time.Now()) {
		http.Error(w, "Session changed; log in again", http.StatusUnauthorized)
		return
	}
	now := time.Now()
	if now.Sub(p.moderationWindow) >= time.Minute {
		p.moderationWindow = now
		p.moderationRequests = 0
	}
	if p.moderationRequests >= 12 {
		w.Header().Set("Retry-After", "60")
		http.Error(w, "Wait before refreshing moderation context", http.StatusTooManyRequests)
		return
	}
	p.moderationRequests++
	broadcaster, ok := s.resolveUser(r.Context(), p, channel)
	if !ok || !numericID(broadcaster) {
		http.Error(w, "Channel identity unavailable", http.StatusBadGateway)
		return
	}
	user, ok := target, true
	if !idMode {
		user, ok = s.resolveUser(r.Context(), p, target)
	}
	if !ok || !numericID(user) {
		http.Error(w, "User identity unavailable", http.StatusNotFound)
		return
	}
	result := moderationContext{Account: p.user.UserID, Channel: channel, BroadcasterID: broadcaster, Target: target, TargetID: user, Role: "unknown", RoleDetail: "Grant user:read:moderated_channels to verify moderator membership", At: now.UnixMilli(), Settings: map[string]any{}, TargetState: "Unavailable: only the broadcaster can read current bans through this API"}
	result.TargetKind = "login"
	result.ShieldState = "Unavailable; grant Shield Mode read/manage permission and verify channel role"
	if idMode {
		result.TargetKind = "id"
	}
	if broadcaster == p.user.UserID {
		result.Role = "broadcaster"
		result.RoleDetail = "Authenticated user ID matches the selected broadcaster"
	} else if slices.Contains(p.user.Scopes, "user:read:moderated_channels") {
		cursor := ""
		seen := map[string]bool{}
		for page := 0; page < 5; page++ {
			path := "/moderation/channels?user_id=" + url.QueryEscape(p.user.UserID) + "&first=100"
			if cursor != "" {
				path += "&after=" + url.QueryEscape(cursor)
			}
			data, status, ok := s.helix(r.Context(), p, http.MethodGet, path, nil)
			if !ok || status != 200 {
				result.RoleDetail = "Moderator membership could not be verified; refresh after checking consent/role"
				break
			}
			var response struct {
				Data []struct {
					ID string `json:"broadcaster_id"`
				}
				Pagination struct {
					Cursor string `json:"cursor"`
				}
			}
			if json.Unmarshal(data, &response) != nil || response.Data == nil || len(response.Data) > 100 {
				result.RoleDetail = "Moderator membership response unavailable"
				break
			}
			valid := true
			for _, row := range response.Data {
				if !numericID(row.ID) {
					valid = false
					break
				}
				if row.ID == broadcaster {
					result.Role = "moderator"
					result.RoleDetail = "Selected channel returned by the account's moderator membership read"
				}
			}
			if !valid {
				result.Role = "unknown"
				result.RoleDetail = "Moderator membership response unavailable"
				break
			}
			if result.Role == "moderator" {
				break
			}
			cursor = response.Pagination.Cursor
			if cursor == "" {
				result.Role = "viewer"
				result.RoleDetail = "Selected channel absent from the complete moderator membership list"
				break
			}
			if !validCursor(cursor) || seen[cursor] {
				result.RoleDetail = "Moderator membership pagination unavailable"
				break
			}
			seen[cursor] = true
			result.RoleDetail = "Membership scan reached its 500-channel limit; selected role remains unknown"
		}
	}
	if (result.Role == "moderator" || result.Role == "broadcaster") && (slices.Contains(p.user.Scopes, "moderator:read:shield_mode") || slices.Contains(p.user.Scopes, "moderator:manage:shield_mode")) {
		data, status, ok := s.helix(r.Context(), p, http.MethodGet, "/moderation/shield_mode?"+url.Values{"broadcaster_id": {broadcaster}, "moderator_id": {p.user.UserID}}.Encode(), nil)
		if ok && status == http.StatusOK {
			var v struct {
				Data []struct {
					Active *bool `json:"is_active"`
				}
			}
			if json.Unmarshal(data, &v) == nil && len(v.Data) == 1 && v.Data[0].Active != nil {
				if *v.Data[0].Active {
					result.ShieldState = "Active at this read"
				} else {
					result.ShieldState = "Inactive at this read"
				}
			}
		}
	}
	data, status, ok := s.helix(r.Context(), p, http.MethodGet, "/chat/settings?broadcaster_id="+url.QueryEscape(broadcaster), nil)
	if ok && status == 200 {
		var response struct{ Data []map[string]any }
		if json.Unmarshal(data, &response) == nil && len(response.Data) == 1 && response.Data[0]["broadcaster_id"] == broadcaster {
			for _, key := range []string{"slow_mode", "slow_mode_wait_time", "follower_mode", "follower_mode_duration", "subscriber_mode", "emote_mode", "unique_chat_mode"} {
				value := response.Data[0][key]
				switch v := value.(type) {
				case bool:
					if key != "slow_mode_wait_time" && key != "follower_mode_duration" {
						result.Settings[key] = v
					}
				case float64:
					if (key == "slow_mode_wait_time" || key == "follower_mode_duration") && v >= 0 && v <= 129600 && v == float64(int(v)) {
						result.Settings[key] = int(v)
					}
				}
			}
		}
	}
	if result.Role == "broadcaster" && slices.Contains(p.user.Scopes, "moderator:manage:banned_users") {
		data, status, ok := s.helix(r.Context(), p, http.MethodGet, "/moderation/banned?broadcaster_id="+url.QueryEscape(broadcaster)+"&user_id="+url.QueryEscape(user)+"&first=1", nil)
		if ok && status == 200 {
			var response struct {
				Data []struct {
					ID      string `json:"user_id"`
					Expires string `json:"expires_at"`
				}
			}
			if json.Unmarshal(data, &response) == nil && response.Data != nil && len(response.Data) <= 1 {
				if len(response.Data) == 0 {
					result.TargetState = "Not banned or timed out at this read"
				} else if response.Data[0].ID == user {
					if response.Data[0].Expires == "" {
						result.TargetState = "Banned at this read"
					} else if at, err := time.Parse(time.RFC3339, response.Data[0].Expires); err == nil {
						result.TargetState = "Timeout until " + at.UTC().Format(time.RFC3339)
					}
				}
			}
		} else {
			result.TargetState = "Current ban state unavailable; check provider permission or retry the read"
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}
