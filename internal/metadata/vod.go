package metadata

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"regexp"
	"strconv"
	"time"
)

// Vod is the latest public archive's timing, excluding credentials/raw responses.
type Vod struct {
	Start string `json:"start"`
	End   string `json:"end"`
	URL   string `json:"url"`
	Title string `json:"title"`
}

var vodDuration = regexp.MustCompile(`^(?:(\d{1,3})h)?(?:(\d{1,2})m)?(?:(\d{1,2})s)?$`)
var videoID = regexp.MustCompile(`^[0-9]{1,30}$`)

func parseVod(data []byte, userID string) (*Vod, error) {
	var payload struct {
		Data []struct {
			ID       string `json:"id"`
			UserID   string `json:"user_id"`
			Created  string `json:"created_at"`
			Duration string `json:"duration"`
			Title    string `json:"title"`
			Type     string `json:"type"`
		}
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, errors.New("invalid VOD response")
	}
	if len(payload.Data) == 0 {
		return nil, nil
	}
	v := payload.Data[0]
	start, err := time.Parse(time.RFC3339, v.Created)
	parts := vodDuration.FindStringSubmatch(v.Duration)
	if err != nil || start.After(time.Now().Add(5*time.Minute)) || !videoID.MatchString(v.ID) || v.UserID != userID || v.Type != "archive" || len(parts) != 4 {
		return nil, errors.New("invalid VOD timing")
	}
	hours, _ := strconv.Atoi(parts[1])
	minutes, _ := strconv.Atoi(parts[2])
	seconds, _ := strconv.Atoi(parts[3])
	duration := time.Duration(hours*3600+minutes*60+seconds) * time.Second
	if duration <= 0 || duration > 7*24*time.Hour || minutes >= 60 || seconds >= 60 {
		return nil, errors.New("invalid VOD duration")
	}
	title := []rune(v.Title)
	return &Vod{Start: start.Format(time.RFC3339), End: start.Add(duration).Format(time.RFC3339), URL: "https://www.twitch.tv/videos/" + v.ID, Title: string(title[:min(len(title), 300)])}, nil
}

// VerifyVod rechecks a retained archive against public Helix metadata. Unlike
// presentation metadata, errors never accept the cache's stale-data fallback.
func (s *Service) VerifyVod(ctx context.Context, channel, id string) (*Vod, error) {
	if !channelPattern.MatchString(channel) || !videoID.MatchString(id) || s.publicRead == nil {
		return nil, errors.New("VOD verification unavailable")
	}
	data, err := s.get(ctx, "helix:/users?login="+url.QueryEscape(channel), time.Minute)
	if err != nil {
		return nil, err
	}
	var users struct {
		Data []struct {
			ID    string `json:"id"`
			Login string `json:"login"`
		} `json:"data"`
	}
	if json.Unmarshal(data, &users) != nil || len(users.Data) != 1 || users.Data[0].Login != channel || !idPattern.MatchString(users.Data[0].ID) {
		return nil, errors.New("invalid VOD channel")
	}
	data, err = s.get(ctx, "helix:/videos?id="+url.QueryEscape(id), time.Minute)
	if err != nil {
		return nil, err
	}
	vod, err := parseVod(data, users.Data[0].ID)
	if err != nil {
		return nil, err
	}
	if vod != nil && vod.URL != "https://www.twitch.tv/videos/"+id {
		return nil, errors.New("wrong VOD ID")
	}
	return vod, nil
}
