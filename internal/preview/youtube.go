package preview

import (
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
