package preview

import (
	"context"
	"encoding/json"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var twitchSlug = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)
var twitchLogin = regexp.MustCompile(`^[a-z0-9_]{1,25}$`)

func (s *Service) twitch(ctx context.Context, u *url.URL) (Card, bool) {
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	slug, video := "", ""
	if strings.ToLower(u.Hostname()) == "clips.twitch.tv" && len(parts) == 1 && twitchSlug.MatchString(parts[0]) {
		slug = parts[0]
	}
	if len(parts) == 3 && twitchLogin.MatchString(strings.ToLower(parts[0])) && parts[1] == "clip" && twitchSlug.MatchString(parts[2]) {
		slug = parts[2]
	}
	if len(parts) == 2 && parts[0] == "videos" && itemNumber.MatchString(parts[1]) {
		video = parts[1]
	}
	if slug != "" || video != "" {
		if s.publicRead == nil {
			return Card{}, false
		}
		path, id, site := "/clips?id=", slug, "Twitch clip"
		if video != "" {
			path, id, site = "/videos?id=", video, "Twitch VOD"
		}
		raw, err := s.publicRead(ctx, path+url.QueryEscape(id))
		if err != nil || len(raw) > 1<<20 {
			return Card{}, false
		}
		var data struct {
			Data []struct {
				ID, Title       string
				BroadcasterName string          `json:"broadcaster_name"`
				CreatorName     string          `json:"creator_name"`
				UserName        string          `json:"user_name"`
				Thumbnail       string          `json:"thumbnail_url"`
				Created         string          `json:"created_at"`
				Views           int64           `json:"view_count"`
				Duration        json.RawMessage `json:"duration"`
			}
		}
		if json.Unmarshal(raw, &data) != nil || len(data.Data) != 1 || data.Data[0].ID != id || data.Data[0].Title == "" {
			return Card{}, false
		}
		item := data.Data[0]
		description := clean(item.BroadcasterName, 100)
		if video != "" {
			description = clean(item.UserName, 100)
		}
		if item.Views >= 0 {
			if description != "" {
				description += " · "
			}
			description += countText(item.Views) + " views"
		}
		var duration string
		if json.Unmarshal(item.Duration, &duration) != nil {
			var seconds float64
			if json.Unmarshal(item.Duration, &seconds) == nil && seconds > 0 && seconds <= 600 {
				duration = stringDuration(seconds)
			}
		}
		if duration != "" && len(duration) <= 30 {
			description += " · " + clean(duration, 30)
		}
		published := ""
		if date, err := time.Parse(time.RFC3339, item.Created); err == nil {
			published = date.UTC().Format(time.RFC3339)
		}
		image := strings.NewReplacer("%{width}", "640", "%{height}", "360").Replace(item.Thumbnail)
		author := ""
		if item.CreatorName != "" {
			author = "clipped by " + clean(item.CreatorName, 100)
		}
		return Card{URL: u.String(), Title: clean(item.Title, 300), Description: description, Site: site, Image: asset(u, image), Author: author, Published: published, ContentType: "text/html", TTL: 300}, true
	}
	if len(parts) != 1 || !twitchLogin.MatchString(strings.ToLower(parts[0])) {
		return Card{}, false
	}
	login := strings.ToLower(parts[0])
	switch login {
	case "directory", "videos", "settings", "downloads", "jobs", "turbo", "store", "p", "login", "signup":
		return Card{}, false
	}
	var users []struct {
		Login, DisplayName, Bio, Logo, CreatedAt string
		Followers                                *int64
		Stream                                   *struct {
			Title   string
			Viewers int64 `json:"viewersCount"`
			Game    struct {
				Name string `json:"displayName"`
			}
		}
		Roles struct {
			Partner   bool `json:"isPartner"`
			Affiliate bool `json:"isAffiliate"`
		}
	}
	if s.providerJSON(ctx, "https://api.ivr.fi/v2/twitch/user?login="+url.QueryEscape(login), &users) != nil || len(users) != 1 || strings.ToLower(users[0].Login) != login || users[0].DisplayName == "" {
		return Card{}, false
	}
	user := users[0]
	details := []string{clean(user.Bio, 600)}
	if user.Stream != nil {
		details = append(details, "live · "+countText(max(0, user.Stream.Viewers))+" viewers", clean(user.Stream.Title, 300), clean(user.Stream.Game.Name, 100))
	} else {
		details = append(details, "observed offline")
	}
	if user.Followers != nil && *user.Followers >= 0 {
		details = append(details, countText(*user.Followers)+" followers")
	}
	if user.Roles.Partner {
		details = append(details, "partner")
	} else if user.Roles.Affiliate {
		details = append(details, "affiliate")
	}
	if created, err := time.Parse(time.RFC3339, user.CreatedAt); err == nil {
		details = append(details, "joined "+created.UTC().Format("2006-01-02"))
	}
	nonempty := details[:0]
	for _, detail := range details {
		if detail != "" {
			nonempty = append(nonempty, detail)
		}
	}
	return Card{URL: u.String(), Title: clean(user.DisplayName, 100), Description: clean(strings.Join(nonempty, " · "), 1000), Site: "Twitch", Image: asset(u, user.Logo), ContentType: "text/html", TTL: 300}, true
}

func stringDuration(seconds float64) string {
	return (time.Duration(seconds * float64(time.Second))).String()
}
