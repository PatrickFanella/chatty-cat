package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

const commandScopes = "moderator:manage:banned_users moderator:manage:chat_messages moderator:manage:chat_settings moderator:manage:announcements user:manage:chat_color user:manage:whispers channel:manage:raids channel:manage:moderators channel:manage:vips user:manage:blocked_users moderator:manage:shoutouts moderator:manage:warnings moderator:manage:shield_mode"

type chatCommand struct {
	name, scope, target, reason, text string
	duration                          int
}

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func parseCommand(text string) (chatCommand, error) {
	fields := strings.Fields(text)
	c := chatCommand{duration: -1}
	if len(fields) == 0 {
		return c, errors.New("empty command")
	}
	c.name = strings.ToLower(fields[0])
	if c.name == "/untimeout" {
		c.name = "/unban"
	}
	args := fields[1:]
	noArgs := func() error {
		if len(args) != 0 {
			return errors.New("this command takes no arguments")
		}
		return nil
	}
	number := func(defaultValue, minValue, maxValue int) error {
		c.duration = defaultValue
		if len(args) > 1 {
			return errors.New("use one numeric argument")
		}
		if len(args) == 1 {
			n, err := strconv.Atoi(args[0])
			if err != nil || n < minValue || n > maxValue {
				return errors.New("command duration is outside the allowed range")
			}
			c.duration = n
		}
		return nil
	}
	switch c.name {
	case "/raid", "/mod", "/unmod", "/vip", "/unvip", "/block", "/unblock", "/shoutout":
		if len(args) != 1 {
			return c, errors.New("use " + c.name + " username")
		}
		c.target = strings.ToLower(strings.TrimPrefix(args[0], "@"))
		if !channelPattern.MatchString(c.target) {
			return c, errors.New("invalid Twitch username")
		}
		switch c.name {
		case "/raid":
			c.scope = "channel:manage:raids"
		case "/mod", "/unmod":
			c.scope = "channel:manage:moderators"
		case "/vip", "/unvip":
			c.scope = "channel:manage:vips"
		case "/block", "/unblock":
			c.scope = "user:manage:blocked_users"
		case "/shoutout":
			c.scope = "moderator:manage:shoutouts"
		}
	case "/unraid":
		c.scope = "channel:manage:raids"
		return c, noArgs()
	case "/w":
		c.scope = "user:manage:whispers"
		if len(args) < 2 {
			return c, errors.New("use /w username message")
		}
		c.target = strings.ToLower(strings.TrimPrefix(args[0], "@"))
		if !channelPattern.MatchString(c.target) {
			return c, errors.New("invalid whisper recipient")
		}
		c.text = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(text[len(fields[0]):]), args[0]))
	case "/me":
		c.scope = "chat:edit"
		if len(args) == 0 {
			return c, errors.New("specify action text")
		}
		c.text = strings.TrimSpace(text[len(fields[0]):])
	case "/shield", "/shieldoff":
		c.scope = "moderator:manage:shield_mode"
		return c, noArgs()
	case "/banid":
		c.scope = "moderator:manage:banned_users"
		if len(args) == 0 || !numericID(args[0]) || args[0][0] == '0' {
			return c, errors.New("use /banid numeric-user-id [reason]")
		}
		c.target = args[0]
		c.reason = strings.Join(args[1:], " ")
	case "/warn":
		c.scope = "moderator:manage:warnings"
		if len(args) < 2 {
			return c, errors.New("use /warn username reason")
		}
		c.target = strings.ToLower(strings.TrimPrefix(args[0], "@"))
		c.reason = strings.Join(args[1:], " ")
		if !channelPattern.MatchString(c.target) {
			return c, errors.New("invalid Twitch username")
		}
	case "/ban", "/timeout", "/unban":
		c.scope = "moderator:manage:banned_users"
		if len(args) == 0 {
			return c, errors.New("specify a Twitch username")
		}
		c.target = strings.ToLower(strings.TrimPrefix(args[0], "@"))
		if !channelPattern.MatchString(c.target) {
			return c, errors.New("invalid Twitch username")
		}
		if c.name == "/unban" {
			if len(args) != 1 {
				return c, errors.New("use /unban username")
			}
			break
		}
		if c.name == "/timeout" {
			c.duration = 600
			if len(args) > 1 {
				n, err := strconv.Atoi(args[1])
				if err != nil || n < 1 || n > 1209600 {
					return c, errors.New("use /timeout username [1–1209600 seconds] [reason]")
				}
				c.duration = n
			}
			if len(args) > 2 {
				c.reason = strings.Join(args[2:], " ")
			}
		} else if len(args) > 1 {
			c.reason = strings.Join(args[1:], " ")
		}
	case "/delete", "/clear":
		c.scope = "moderator:manage:chat_messages"
		if c.name == "/clear" {
			return c, noArgs()
		}
		if len(args) != 1 || !messageIDPattern.MatchString(args[0]) {
			return c, errors.New("use /delete message-id")
		}
		c.target = args[0]
	case "/slow", "/followers":
		c.scope = "moderator:manage:chat_settings"
		if c.name == "/slow" {
			return c, number(30, 3, 120)
		}
		return c, number(0, 0, 129600)
	case "/slowoff", "/followersoff", "/subscribers", "/subscribersoff", "/emoteonly", "/emoteonlyoff", "/uniquechat", "/uniquechatoff", "/r9kbeta", "/r9kbetaoff":
		c.scope = "moderator:manage:chat_settings"
		return c, noArgs()
	case "/announce", "/announceblue", "/announcegreen", "/announceorange", "/announcepurple":
		c.scope = "moderator:manage:announcements"
		if len(args) == 0 {
			return c, errors.New("specify announcement text")
		}
		c.text = strings.TrimSpace(text[len(fields[0]):])
	case "/color":
		c.scope = "user:manage:chat_color"
		if len(args) != 1 {
			return c, errors.New("use /color named-color or #RRGGBB")
		}
		c.text = strings.ToLower(args[0])
		if !hexColor.MatchString(c.text) && !slices.Contains([]string{"blue", "blue_violet", "cadet_blue", "chocolate", "coral", "dodger_blue", "firebrick", "golden_rod", "green", "hot_pink", "orange_red", "red", "sea_green", "spring_green", "yellow_green"}, c.text) {
			return c, errors.New("invalid Twitch chat color")
		}
	default:
		return c, errors.New("unsupported slash command; open Help for supported commands")
	}
	return c, nil
}
func (s *Service) resolveUser(ctx context.Context, p *session, login string) (string, bool) {
	data, status, ok := s.helix(ctx, p, http.MethodGet, "/users?login="+url.QueryEscape(login), nil)
	if !ok || status != http.StatusOK {
		return "", false
	}
	var users struct{ Data []struct{ ID, Login string } }
	if json.Unmarshal(data, &users) != nil || len(users.Data) != 1 || users.Data[0].ID == "" || users.Data[0].Login != login {
		return "", false
	}
	return users.Data[0].ID, true
}
func (s *Service) command(ctx context.Context, p *session, input sendInput) (sendResult, int) {
	c, err := parseCommand(strings.TrimSpace(input.Message))
	if err != nil {
		return sendResult{Error: err.Error()}, http.StatusBadRequest
	}
	if !slices.Contains(p.user.Scopes, c.scope) {
		return sendResult{Error: "Sign out and log in again to grant this command's permission"}, http.StatusForbidden
	}
	if c.name == "/w" {
		target, ok := s.resolveUser(ctx, p, c.target)
		if !ok {
			return sendResult{Error: "Whisper recipient not found; request was not sent"}, http.StatusNotFound
		}
		if target == p.user.UserID {
			return sendResult{Error: "Choose another user for this whisper"}, http.StatusBadRequest
		}
		body, err := json.Marshal(map[string]string{"message": c.text})
		if err != nil {
			return sendResult{Error: "Could not prepare whisper"}, http.StatusInternalServerError
		}
		_, status, ok := s.helix(ctx, p, http.MethodPost, "/whispers?"+url.Values{"from_user_id": {p.user.UserID}, "to_user_id": {target}}.Encode(), body)
		if !ok || status >= 500 {
			return sendResult{Error: "Whisper request could not be confirmed; check Twitch before retrying", Uncertain: true}, http.StatusBadGateway
		}
		if status != http.StatusNoContent {
			code := status
			if code != 400 && code != 401 && code != 403 && code != 404 && code != 429 {
				code = http.StatusBadGateway
			}
			return sendResult{Error: "Twitch rejected the whisper; check permissions, phone verification and recipient settings"}, code
		}
		return sendResult{Sent: true, Command: true, Whisper: true, Recipient: c.target}, http.StatusOK
	}
	params := url.Values{}
	method, path := http.MethodPatch, "/chat/settings"
	payload := map[string]any{}
	switch c.name {
	case "/color":
		method, path = http.MethodPut, "/chat/color"
		params.Set("user_id", p.user.UserID)
		params.Set("color", c.text)
	case "/block", "/unblock":
		target, ok := s.resolveUser(ctx, p, c.target)
		if !ok {
			return sendResult{Error: "User not found; command was not sent"}, http.StatusNotFound
		}
		if target == p.user.UserID {
			return sendResult{Error: "Choose another user"}, http.StatusBadRequest
		}
		method, path = http.MethodPut, "/users/blocks"
		if c.name == "/unblock" {
			method = http.MethodDelete
		}
		params.Set("target_user_id", target)
	default:
		broadcaster, ok := s.resolveUser(ctx, p, input.Channel)
		if !ok {
			return sendResult{Error: "Channel lookup failed; command was not sent"}, http.StatusBadGateway
		}
		if input.ExpectedBroadcasterID != "" && input.ExpectedBroadcasterID != broadcaster {
			return sendResult{Error: "Channel identity changed; review the action again"}, http.StatusConflict
		}
		if strings.HasPrefix(c.scope, "channel:manage:") && broadcaster != p.user.UserID {
			return sendResult{Error: "This command requires the selected channel's broadcaster account"}, http.StatusForbidden
		}
		params.Set("broadcaster_id", broadcaster)
		params.Set("moderator_id", p.user.UserID)
		switch c.name {
		case "/raid", "/mod", "/unmod", "/vip", "/unvip", "/shoutout":
			target, ok := s.resolveUser(ctx, p, c.target)
			if !ok || !numericID(target) {
				return sendResult{Error: "User not found; command was not sent"}, http.StatusNotFound
			}
			if target == broadcaster {
				return sendResult{Error: "Choose another user"}, http.StatusBadRequest
			}
			method = http.MethodPost
			switch c.name {
			case "/raid":
				path = "/raids"
				params.Del("broadcaster_id")
				params.Del("moderator_id")
				params.Set("from_broadcaster_id", broadcaster)
				params.Set("to_broadcaster_id", target)
			case "/shoutout":
				path = "/chat/shoutouts"
				params.Del("broadcaster_id")
				params.Set("from_broadcaster_id", broadcaster)
				params.Set("to_broadcaster_id", target)
			default:
				params.Del("moderator_id")
				params.Set("user_id", target)
				if c.name == "/mod" || c.name == "/unmod" {
					path = "/moderation/moderators"
				} else {
					path = "/channels/vips"
				}
				if c.name == "/unmod" || c.name == "/unvip" {
					method = http.MethodDelete
				}
			}
		case "/unraid":
			method, path = http.MethodDelete, "/raids"
			params.Del("moderator_id")
		case "/shield", "/shieldoff":
			method, path = http.MethodPut, "/moderation/shield_mode"
			payload["is_active"] = c.name == "/shield"
		case "/ban", "/timeout", "/unban", "/warn", "/banid":
			target, ok := c.target, true
			if c.name != "/banid" {
				target, ok = s.resolveUser(ctx, p, c.target)
			}
			if !ok {
				return sendResult{Error: "User not found; command was not sent"}, http.StatusNotFound
			}
			if input.ExpectedTargetID != "" && input.ExpectedTargetID != target {
				return sendResult{Error: "User identity changed; review the action again"}, http.StatusConflict
			}
			if (c.name == "/banid" || c.name == "/warn") && (target == broadcaster || target == p.user.UserID) {
				return sendResult{Error: "Choose another target; self/broadcaster actions are unavailable"}, http.StatusBadRequest
			}
			path = "/moderation/bans"
			if c.name == "/unban" {
				method = http.MethodDelete
				params.Set("user_id", target)
			} else {
				method = http.MethodPost
				data := map[string]any{"user_id": target}
				if c.duration >= 0 {
					data["duration"] = c.duration
				}
				if c.reason != "" {
					data["reason"] = c.reason
				}
				payload["data"] = data
				if c.name == "/warn" {
					path = "/moderation/warnings"
				}
			}
		case "/delete", "/clear":
			method, path = http.MethodDelete, "/moderation/chat"
			if c.target != "" {
				params.Set("message_id", c.target)
			}
		case "/slow":
			payload["slow_mode"] = true
			payload["slow_mode_wait_time"] = c.duration
		case "/slowoff":
			payload["slow_mode"] = false
		case "/followers":
			payload["follower_mode"] = true
			payload["follower_mode_duration"] = c.duration
		case "/followersoff":
			payload["follower_mode"] = false
		case "/subscribers", "/subscribersoff":
			payload["subscriber_mode"] = c.name == "/subscribers"
		case "/emoteonly", "/emoteonlyoff":
			payload["emote_mode"] = c.name == "/emoteonly"
		case "/uniquechat", "/uniquechatoff", "/r9kbeta", "/r9kbetaoff":
			payload["unique_chat_mode"] = !strings.HasSuffix(c.name, "off")
		default:
			method, path = http.MethodPost, "/chat/announcements"
			payload["message"] = c.text
			colour := strings.TrimPrefix(c.name, "/announce")
			if colour == "" {
				colour = "primary"
			}
			payload["color"] = colour
		}
	}
	var body []byte
	if len(payload) > 0 {
		body, err = json.Marshal(payload)
		if err != nil {
			return sendResult{Error: "Could not prepare command"}, http.StatusInternalServerError
		}
	}
	response, status, ok := s.helix(ctx, p, method, path+"?"+params.Encode(), body)
	if !ok {
		return sendResult{Error: "Command result could not be confirmed; check Twitch before retrying", Uncertain: true}, http.StatusBadGateway
	}
	if status != http.StatusOK && status != http.StatusNoContent {
		code := status
		if code != 400 && code != 401 && code != 403 && code != 404 && code != 409 && code != 422 && code != 425 && code != 429 {
			code = http.StatusBadGateway
		}
		if code == http.StatusBadGateway {
			return sendResult{Error: "Command result could not be confirmed; check Twitch before retrying", Uncertain: true}, code
		}
		return sendResult{Error: "Twitch rejected the command; check channel permissions and arguments"}, code
	}
	if slices.Contains([]string{"/raid", "/unraid", "/mod", "/unmod", "/vip", "/unvip", "/block", "/unblock", "/shoutout"}, c.name) {
		expected := http.StatusNoContent
		if c.name == "/raid" {
			expected = http.StatusOK
		}
		if status != expected {
			return sendResult{Error: "Command result could not be confirmed; check Twitch before retrying", Uncertain: true}, http.StatusBadGateway
		}
	}
	if slices.Contains([]string{"/warn", "/shield", "/shieldoff", "/banid"}, c.name) && status != http.StatusOK {
		return sendResult{Error: "Moderation result could not be confirmed; check Twitch before retrying", Uncertain: true}, http.StatusBadGateway
	}
	if status == http.StatusOK {
		var confirmation struct{ Data []json.RawMessage }
		if json.Unmarshal(response, &confirmation) != nil || len(confirmation.Data) != 1 {
			return sendResult{Error: "Command result could not be confirmed; check Twitch before retrying", Uncertain: true}, http.StatusBadGateway
		}
		if c.name == "/banid" {
			var v struct {
				Broadcaster string `json:"broadcaster_id"`
				User        string `json:"user_id"`
			}
			if json.Unmarshal(confirmation.Data[0], &v) != nil || v.Broadcaster != params.Get("broadcaster_id") || v.User != c.target {
				return sendResult{Error: "Numeric ban result could not be confirmed; check Twitch before retrying", Uncertain: true}, http.StatusBadGateway
			}
		}
		if c.name == "/warn" {
			var v struct {
				Broadcaster string `json:"broadcaster_id"`
				Moderator   string `json:"moderator_id"`
				User        string `json:"user_id"`
				Reason      string `json:"reason"`
			}
			if json.Unmarshal(confirmation.Data[0], &v) != nil || v.Broadcaster != params.Get("broadcaster_id") || v.Moderator != p.user.UserID || v.User != payload["data"].(map[string]any)["user_id"] || v.Reason != c.reason {
				return sendResult{Error: "Warning result could not be confirmed; check Twitch before retrying", Uncertain: true}, http.StatusBadGateway
			}
		}
		if c.name == "/shield" || c.name == "/shieldoff" {
			var v struct {
				Active *bool `json:"is_active"`
			}
			if json.Unmarshal(confirmation.Data[0], &v) != nil || v.Active == nil || *v.Active != (c.name == "/shield") {
				return sendResult{Error: "Shield result could not be confirmed; check Twitch before retrying", Uncertain: true}, http.StatusBadGateway
			}
		}
		if c.name == "/raid" {
			var raid struct {
				CreatedAt string `json:"created_at"`
			}
			if json.Unmarshal(confirmation.Data[0], &raid) != nil {
				return sendResult{Error: "Raid request could not be confirmed; check Twitch before retrying", Uncertain: true}, http.StatusBadGateway
			}
			if _, err := time.Parse(time.RFC3339, raid.CreatedAt); err != nil {
				return sendResult{Error: "Raid request could not be confirmed; check Twitch before retrying", Uncertain: true}, http.StatusBadGateway
			}
		}
	}
	return sendResult{Sent: true, Command: true}, http.StatusOK
}
