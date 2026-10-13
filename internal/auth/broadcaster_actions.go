package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

const broadcastScope = "channel:manage:broadcast"
const clipScope = "clips:edit"
const commercialScope = "channel:edit:commercial"

type categoryOption struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type broadcastContext struct {
	Revision        string           `json:"revision"`
	Account         string           `json:"account"`
	Channel         string           `json:"channel"`
	Broadcaster     string           `json:"broadcasterID"`
	Role            string           `json:"role"`
	Stream          string           `json:"stream"`
	StreamID        string           `json:"streamID"`
	BroadcasterType string           `json:"broadcasterType"`
	Title           string           `json:"title"`
	GameID          string           `json:"gameID"`
	GameName        string           `json:"gameName"`
	At              int64            `json:"at"`
	Categories      []categoryOption `json:"categories"`
	Detail          string           `json:"detail"`
}

func (s *Service) broadcastContextRead(ctx context.Context, p *session, channel string) (broadcastContext, error) {
	v := broadcastContext{Account: p.user.UserID, Channel: channel, Role: "viewer", Stream: "unknown", At: time.Now().UnixMilli(), Categories: []categoryOption{}, Detail: "Editor membership, VOD/clip permissions and ad eligibility require provider authorization; editor marker writes are unavailable here"}
	data, status, ok := s.helix(ctx, p, http.MethodGet, "/users?login="+url.QueryEscape(channel), nil)
	var users struct {
		Data []struct {
			ID, Login string
			Type      string `json:"broadcaster_type"`
		}
	}
	if !ok || status != 200 || json.Unmarshal(data, &users) != nil || len(users.Data) != 1 || users.Data[0].Login != channel || !numericID(users.Data[0].ID) {
		return v, errors.New("channel identity unavailable")
	}
	v.Broadcaster = users.Data[0].ID
	if v.Broadcaster == p.user.UserID {
		v.Role = "broadcaster"
	}
	if slices.Contains([]string{"", "affiliate", "partner"}, users.Data[0].Type) {
		v.BroadcasterType = users.Data[0].Type
	} else {
		return v, errors.New("broadcaster eligibility unavailable")
	}
	data, status, ok = s.helix(ctx, p, http.MethodGet, "/streams?user_id="+url.QueryEscape(v.Broadcaster), nil)
	var streams struct {
		Data []struct {
			ID      string
			User    string `json:"user_id"`
			Type    string
			Started string `json:"started_at"`
		}
	}
	if !ok || status != 200 || json.Unmarshal(data, &streams) != nil || streams.Data == nil || len(streams.Data) > 1 {
		return v, errors.New("live/offline state unavailable")
	}
	v.Stream = "offline"
	if len(streams.Data) == 1 {
		stream := streams.Data[0]
		if stream.User != v.Broadcaster || stream.Type != "live" || !messageIDPattern.MatchString(stream.ID) {
			return v, errors.New("live stream identity unavailable")
		}
		if _, err := time.Parse(time.RFC3339Nano, stream.Started); err != nil {
			return v, errors.New("live stream timestamp unavailable")
		}
		v.Stream = "live"
		v.StreamID = stream.ID
	}
	data, status, ok = s.helix(ctx, p, http.MethodGet, "/channels?broadcaster_id="+url.QueryEscape(v.Broadcaster), nil)
	var channels struct {
		Data []struct {
			Broadcaster string `json:"broadcaster_id"`
			Title       string
			GameID      string `json:"game_id"`
			GameName    string `json:"game_name"`
		}
	}
	if !ok || status != 200 || json.Unmarshal(data, &channels) != nil || len(channels.Data) != 1 || channels.Data[0].Broadcaster != v.Broadcaster || len(channels.Data[0].Title) > 2000 || len(channels.Data[0].GameName) > 500 || channels.Data[0].GameID != "" && !numericID(channels.Data[0].GameID) {
		return v, errors.New("channel metadata unavailable")
	}
	v.Title = channels.Data[0].Title
	v.GameID = channels.Data[0].GameID
	v.GameName = channels.Data[0].GameName
	hash := sha256.Sum256([]byte(v.Title + "\x00" + v.GameID))
	v.Revision = hex.EncodeToString(hash[:])
	return v, nil
}
func (s *Service) broadcastCategories(ctx context.Context, p *session, query string) ([]categoryOption, error) {
	path := "/search/categories?" + url.Values{"query": {query}, "first": {"20"}}.Encode()
	if strings.HasPrefix(query, "id:") {
		id := strings.TrimPrefix(query, "id:")
		if !numericID(id) || id == "0" {
			return nil, errors.New("choose a positive category ID")
		}
		path = "/games?id=" + url.QueryEscape(id)
	}
	data, status, ok := s.helix(ctx, p, http.MethodGet, path, nil)
	var response struct{ Data []categoryOption }
	if !ok || status != 200 || json.Unmarshal(data, &response) != nil || response.Data == nil || len(response.Data) > 20 {
		return nil, errors.New("category search unavailable")
	}
	seen := map[string]bool{}
	for _, c := range response.Data {
		if !numericID(c.ID) || c.ID == "0" || seen[c.ID] || !pollText(c.Name, 200) {
			return nil, errors.New("category search identity unavailable")
		}
		seen[c.ID] = true
	}
	return response.Data, nil
}
func (s *Service) broadcastContextEndpoint(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	channel, query := q.Get("channel"), q.Get("category")
	if !s.sameHost(r) || !channelPattern.MatchString(channel) || len(q["channel"]) != 1 || len(q) > 2 || len(q) == 2 && len(q["category"]) != 1 || query != "" && !pollText(query, 200) {
		writePoll(w, 400, sendResult{Error: "Choose a valid channel/category"})
		return
	}
	p := s.lookup(r)
	if p == nil {
		writePoll(w, 401, sendResult{Error: "Log in for broadcaster actions"})
		return
	}
	ctx, end := context.WithTimeout(r.Context(), 20*time.Second)
	defer end()
	p.mu.Lock()
	defer p.mu.Unlock()
	if s.lookup(r) != p || !s.check(ctx, p, time.Now()) {
		writePoll(w, 401, sendResult{Error: "Session changed"})
		return
	}
	value, err := s.broadcastContextRead(ctx, p, channel)
	if err == nil && query != "" {
		value.Categories, err = s.broadcastCategories(ctx, p, query)
	}
	if err != nil {
		writePoll(w, 502, sendResult{Error: err.Error() + "; no provider write was sent"})
		return
	}
	writePoll(w, 200, value)
}
func (s *Service) resolveBroadcastCategory(ctx context.Context, p *session, text string) (string, error) {
	if strings.HasPrefix(text, "id:") {
		id := strings.TrimPrefix(text, "id:")
		if !numericID(id) || id == "0" {
			return "", errors.New("choose a positive category ID")
		}
		data, status, ok := s.helix(ctx, p, http.MethodGet, "/games?id="+url.QueryEscape(id), nil)
		var v struct{ Data []categoryOption }
		if !ok || status != 200 || json.Unmarshal(data, &v) != nil || len(v.Data) != 1 || v.Data[0].ID != id || !pollText(v.Data[0].Name, 200) {
			return "", errors.New("selected category ID is unavailable")
		}
		return id, nil
	}
	values, err := s.broadcastCategories(ctx, p, text)
	if err != nil {
		return "", err
	}
	matches := []categoryOption{}
	for _, v := range values {
		if strings.EqualFold(v.Name, text) {
			matches = append(matches, v)
		}
	}
	if len(matches) != 1 {
		return "", errors.New("category is unavailable or ambiguous; search and select an exact ID before confirming")
	}
	return matches[0].ID, nil
}
func (s *Service) broadcastCommand(ctx context.Context, p *session, input sendInput, c chatCommand) (sendResult, int) {
	ctx, end := context.WithTimeout(ctx, 65*time.Second)
	defer end()
	value, err := s.broadcastContextRead(ctx, p, input.Channel)
	if err != nil {
		return sendResult{Error: err.Error() + "; action was not sent"}, 502
	}
	if input.ExpectedBroadcasterID == "" {
		return sendResult{Error: "Review the broadcaster identity before confirming"}, 400
	}
	if input.ExpectedBroadcasterID != "" && input.ExpectedBroadcasterID != value.Broadcaster {
		return sendResult{Error: "Channel identity changed; review again"}, 409
	}
	if c.name != "/clip" && value.Role != "broadcaster" {
		return sendResult{Error: "Select the broadcaster account; editor status is unavailable for these writes"}, 403
	}
	if slices.Contains([]string{"/clip", "/marker", "/commercial"}, c.name) && value.Stream != "live" {
		return sendResult{Error: "Selected channel is offline; this action requires a verified live stream"}, 409
	}
	if slices.Contains([]string{"/clip", "/marker", "/commercial"}, c.name) && (input.ExpectedStreamID == "" || input.ExpectedStreamID != value.StreamID) {
		return sendResult{Error: "Live stream changed; refresh and review again"}, 409
	}
	if slices.Contains([]string{"/settitle", "/setgame"}, c.name) && (input.ExpectedBroadcastRevision == "" || input.ExpectedBroadcastRevision != value.Revision) {
		return sendResult{Error: "Channel metadata changed; refresh and review again"}, 409
	}
	if c.name == "/commercial" && !slices.Contains([]string{"affiliate", "partner"}, value.BroadcasterType) {
		return sendResult{Error: "Commercials require a live affiliate/partner broadcaster; no request was sent"}, 403
	}
	if c.name == "/clip" {
		return s.captureClip(ctx, p, value)
	}
	method, path := http.MethodPost, "/streams/markers"
	payload := map[string]any{"user_id": value.Broadcaster, "description": c.text}
	game := ""
	switch c.name {
	case "/settitle":
		method = http.MethodPatch
		path = "/channels?broadcaster_id=" + url.QueryEscape(value.Broadcaster)
		payload = map[string]any{"title": c.text}
	case "/setgame":
		game, err = s.resolveBroadcastCategory(ctx, p, c.text)
		if err != nil {
			return sendResult{Error: err.Error() + "; action was not sent"}, 409
		}
		method = http.MethodPatch
		path = "/channels?broadcaster_id=" + url.QueryEscape(value.Broadcaster)
		payload = map[string]any{"game_id": game}
	case "/commercial":
		path = "/channels/commercial"
		payload = map[string]any{"broadcaster_id": value.Broadcaster, "length": c.duration}
		if time.Now().Before(p.commercialUntil) {
			return sendResult{Error: "Provider commercial cooldown is active; no request was sent"}, 429
		}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return sendResult{Error: "Could not prepare broadcaster action"}, 500
	}
	data, status, ok := s.helix(ctx, p, method, path, body)
	if ok && slices.Contains([]int{400, 401, 403, 404, 409, 429}, status) {
		return sendResult{Error: "Twitch rejected broadcaster action; check live/VOD/editor/clip/ad eligibility or rate limits"}, status
	}
	uncertain := sendResult{Uncertain: true, Error: "Broadcaster action outcome uncertain; check Twitch before another action. No automatic retry"}
	if !ok {
		return uncertain, 502
	}
	if c.name == "/settitle" || c.name == "/setgame" {
		if status != 204 {
			return uncertain, 502
		}
		fresh, err := s.broadcastContextRead(ctx, p, input.Channel)
		if err != nil || fresh.Broadcaster != value.Broadcaster || c.name == "/settitle" && fresh.Title != c.text || c.name == "/setgame" && fresh.GameID != game {
			return uncertain, 502
		}
		return sendResult{Sent: true, Command: true, Detail: "Provider confirmed channel metadata; readback matched reviewed change"}, 200
	}
	var response struct{ Data []json.RawMessage }
	if status != 200 || json.Unmarshal(data, &response) != nil || len(response.Data) != 1 {
		return uncertain, 502
	}
	if c.name == "/marker" {
		var marker struct {
			ID          string
			Created     string `json:"created_at"`
			Position    *int64 `json:"position_seconds"`
			Description *string
		}
		if json.Unmarshal(response.Data[0], &marker) != nil || !messageIDPattern.MatchString(marker.ID) || marker.Position == nil || *marker.Position < 0 || *marker.Position > 9007199254740991 || marker.Description == nil || *marker.Description != c.text {
			return uncertain, 502
		}
		if _, err := time.Parse(time.RFC3339Nano, marker.Created); err != nil {
			return uncertain, 502
		}
		return sendResult{Sent: true, Command: true, ResourceID: marker.ID, Detail: fmt.Sprintf("Provider confirmed marker %s at %d seconds", marker.ID, *marker.Position)}, 200
	}
	var ad struct {
		Length  *int
		Retry   *int `json:"retry_after"`
		Message string
	}
	if json.Unmarshal(response.Data[0], &ad) != nil || ad.Length == nil || *ad.Length != c.duration || ad.Retry == nil || *ad.Retry < 0 || *ad.Retry > 86400 || ad.Message != "" {
		return uncertain, 502
	}
	p.commercialUntil = time.Now().Add(time.Duration(*ad.Retry) * time.Second)
	return sendResult{Sent: true, Command: true, Detail: fmt.Sprintf("Provider confirmed %d-second commercial request; cooldown %d seconds (actual served length may differ)", c.duration, *ad.Retry), RetryAfter: ad.Retry}, 200
}
func clipEditURL(raw, id string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host != "clips.twitch.tv" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "/"+id+"/edit" {
		return ""
	}
	return u.String()
}
func (s *Service) captureClip(ctx context.Context, p *session, value broadcastContext) (sendResult, int) {
	data, status, ok := s.helix(ctx, p, http.MethodPost, "/clips?broadcaster_id="+url.QueryEscape(value.Broadcaster), nil)
	if ok && slices.Contains([]int{400, 401, 403, 404, 409, 429}, status) {
		return sendResult{Error: "Twitch rejected clip capture; check live/clip permission or rate limits"}, status
	}
	uncertain := sendResult{Uncertain: true, Error: "Clip creation outcome uncertain; provider processing may take 60 seconds. Check Twitch before another action; no automatic retry"}
	var ack struct {
		Data []struct {
			ID   string
			Edit string `json:"edit_url"`
		}
	}
	if !ok || status != 202 || json.Unmarshal(data, &ack) != nil || len(ack.Data) != 1 || !messageIDPattern.MatchString(ack.Data[0].ID) {
		return uncertain, 502
	}
	id := ack.Data[0].ID
	uncertain.ResourceID = id
	timer := time.NewTimer(60 * time.Second)
	defer timer.Stop()
	for {
		data, status, ok = s.helix(ctx, p, http.MethodGet, "/clips?id="+url.QueryEscape(id), nil)
		var clips struct {
			Data []struct {
				ID          string
				Broadcaster string `json:"broadcaster_id"`
				Creator     string `json:"creator_id"`
			}
		}
		if !ok || status != 200 || json.Unmarshal(data, &clips) != nil || clips.Data == nil || len(clips.Data) > 1 {
			return uncertain, 502
		}
		if len(clips.Data) == 1 {
			clip := clips.Data[0]
			if clip.ID != id || clip.Broadcaster != value.Broadcaster || clip.Creator != p.user.UserID {
				return uncertain, 502
			}
			return sendResult{Sent: true, Command: true, ResourceID: id, URL: "https://clips.twitch.tv/" + id, EditURL: clipEditURL(ack.Data[0].Edit, id), Detail: "Provider confirmed published clip " + id}, 200
		}
		wait := time.NewTimer(3 * time.Second)
		select {
		case <-ctx.Done():
			wait.Stop()
			return uncertain, 502
		case <-timer.C:
			wait.Stop()
			return uncertain, 502
		case <-wait.C:
		}
	}
}
