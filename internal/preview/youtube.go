package preview

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

var videoID = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
var videoPath = regexp.MustCompile(`^/(?:shorts|live|embed|v)/([A-Za-z0-9_-]{11})/?$`)

func youtubeID(u *url.URL) string {
	host := strings.TrimPrefix(strings.TrimPrefix(strings.TrimPrefix(u.Hostname(), "www."), "m."), "music.")
	id := ""
	switch host {
	case "youtu.be":
		id = strings.Trim(u.Path, "/")
	case "youtube.com", "youtube-nocookie.com":
		if u.Path == "/watch" {
			id = u.Query().Get("v")
		} else if match := videoPath.FindStringSubmatch(u.Path); match != nil {
			id = match[1]
		}
	}
	if !videoID.MatchString(id) {
		return ""
	}
	return id
}
func (s *Service) youtube(ctx context.Context, u *url.URL, id string) (Card, error) {
	query := url.Values{"format": {"json"}, "url": {"https://www.youtube.com/watch?v=" + id}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.youtube.com/oembed?"+query.Encode(), nil)
	if err != nil {
		return Card{}, err
	}
	req.Header.Set("User-Agent", "chatty-cat/1.0 (+https://git.subcult.tv/subculture-collective/chatty-cat)")
	req.Header.Set("Accept", "application/json")
	response, err := s.client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return Card{}, ctx.Err()
		}
		return Card{}, errors.New("video preview unavailable")
	}
	defer func() {
		if err := response.Body.Close(); err != nil {
			slog.Debug("video preview response close failed")
		}
	}()
	if response.StatusCode != http.StatusOK {
		return Card{}, errors.New("video preview unavailable")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 128*1024+1))
	if err != nil || len(data) > 128*1024 {
		return Card{}, errors.New("video preview too large")
	}
	var body struct {
		Title     string
		Author    string `json:"author_name"`
		Provider  string `json:"provider_name"`
		Type      string
		Thumbnail string `json:"thumbnail_url"`
	}
	if json.Unmarshal(data, &body) != nil || body.Type != "video" || body.Provider != "YouTube" || strings.TrimSpace(body.Title) == "" {
		return Card{}, errors.New("invalid video preview")
	}
	image := socialAsset(body.Thumbnail, "i.ytimg.com")
	return Card{URL: u.String(), Title: clean(body.Title, 300), Description: "by " + clean(body.Author, 200), Site: "YouTube", Image: image, Author: clean(body.Author, 200), ContentType: "text/html", TTL: 86400}, nil
}
