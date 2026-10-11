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
	"time"
)

var statusPath = regexp.MustCompile(`^/[A-Za-z0-9_]{1,15}/status/([0-9]{1,20})(?:/(?:photo|video)/[1-4])?/?$`)
var socialHandle = regexp.MustCompile(`^[A-Za-z0-9_]{1,15}$`)

func twitterID(u *url.URL) string {
	switch strings.ToLower(u.Hostname()) {
	case "x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com":
	default:
		return ""
	}
	match := statusPath.FindStringSubmatch(u.Path)
	if match == nil {
		return ""
	}
	return match[1]
}

// SocialMedia contains normalized public assets rather than upstream HTML.
type SocialMedia struct {
	Avatar string        `json:"avatar"`
	Quote  string        `json:"quote"`
	Photos []SocialPhoto `json:"photos"`
	Videos []SocialVideo `json:"videos"`
}
type SocialPhoto struct {
	URL string `json:"url"`
	Alt string `json:"alt"`
}
type SocialVideo struct {
	URL    string `json:"url"`
	Thumb  string `json:"thumb"`
	Kind   string `json:"kind"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}
type fxMedia struct {
	Photos []struct {
		URL string
		Alt string `json:"altText"`
	}
	Videos []struct {
		URL           string
		Thumb         string `json:"thumbnail_url"`
		Kind          string `json:"type"`
		Width, Height int
	}
}
type fxTweet struct {
	ID, Text  string
	Timestamp int64 `json:"created_timestamp"`
	Author    struct {
		Handle string `json:"screen_name"`
		Avatar string `json:"avatar_url"`
	}
	Media fxMedia
	Quote *fxTweet
}

func socialAsset(raw, host string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Hostname() != host || u.User != nil || u.Port() != "" || len(raw) > 2048 {
		return ""
	}
	return u.String()
}
func (s *Service) twitter(ctx context.Context, u *url.URL, id string) (Card, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.fxtwitter.com/status/"+id, nil)
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
		return Card{}, errors.New("social preview unavailable")
	}
	defer func() {
		if err := response.Body.Close(); err != nil {
			slog.Debug("social preview response close failed")
		}
	}()
	if response.StatusCode != http.StatusOK {
		return Card{}, errors.New("social preview unavailable")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 128*1024+1))
	if err != nil || len(data) > 128*1024 {
		return Card{}, errors.New("social preview too large")
	}
	var body struct {
		Code  int
		Tweet *fxTweet
	}
	if json.Unmarshal(data, &body) != nil || body.Code != 200 || body.Tweet == nil || body.Tweet.ID != id || !socialHandle.MatchString(body.Tweet.Author.Handle) {
		return Card{}, errors.New("invalid social preview")
	}
	tweet := body.Tweet
	media := &SocialMedia{Avatar: socialAsset(tweet.Author.Avatar, "pbs.twimg.com"), Photos: []SocialPhoto{}, Videos: []SocialVideo{}}
	collect := func(input fxMedia) {
		for _, photo := range input.Photos {
			if len(media.Photos) >= 4 {
				break
			}
			if asset := socialAsset(photo.URL, "pbs.twimg.com"); asset != "" {
				media.Photos = append(media.Photos, SocialPhoto{URL: asset, Alt: clean(photo.Alt, 300)})
			}
		}
		for _, video := range input.Videos {
			if len(media.Videos) >= 4 {
				break
			}
			asset, thumb := socialAsset(video.URL, "video.twimg.com"), socialAsset(video.Thumb, "pbs.twimg.com")
			if asset == "" || (video.Kind != "video" && video.Kind != "gif") || video.Width < 0 || video.Height < 0 || video.Width > 8192 || video.Height > 8192 {
				continue
			}
			media.Videos = append(media.Videos, SocialVideo{URL: asset, Thumb: thumb, Kind: video.Kind, Width: video.Width, Height: video.Height})
		}
	}
	collect(tweet.Media)
	if tweet.Quote != nil {
		media.Quote = clean(tweet.Quote.Text, 1000)
		collect(tweet.Quote.Media)
	}
	if strings.TrimSpace(tweet.Text) == "" && len(media.Photos) == 0 && len(media.Videos) == 0 {
		return Card{}, errors.New("empty social preview")
	}
	published := ""
	if tweet.Timestamp >= 1140000000 && tweet.Timestamp <= time.Now().Unix()+300 {
		published = time.Unix(tweet.Timestamp, 0).UTC().Format(time.RFC3339)
	}
	image := ""
	if len(media.Photos) > 0 {
		image = media.Photos[0].URL
	} else if len(media.Videos) > 0 {
		image = media.Videos[0].Thumb
	}
	return Card{URL: u.String(), Title: "@" + tweet.Author.Handle, Description: clean(tweet.Text, 4000), Site: "X / Twitter", Image: image, Author: tweet.Author.Handle, Published: published, ContentType: "text/html", TTL: 600, Social: media}, nil
}
