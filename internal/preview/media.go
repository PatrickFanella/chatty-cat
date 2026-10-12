package preview

import (
	"context"
	"net/url"
	"regexp"
	"strings"
)

var instagramPost = regexp.MustCompile(`^/(?:reel|reels|p|tv)/[a-zA-Z0-9_-]{5,20}/?$`)
var imgurImage = regexp.MustCompile(`^/([a-zA-Z0-9]{5,9})(?:\.(?:gif|gifv|jpe?g|png|webp|mp4))?/?$`)
var imgurAlbum = regexp.MustCompile(`^/(?:a|gallery|g)/[a-zA-Z0-9_-]{5,100}/?$`)

func (s *Service) instagram(ctx context.Context, u *url.URL) (Card, bool) {
	if !instagramPost.MatchString(u.Path) {
		return Card{}, false
	}
	card, err := s.page(ctx, u)
	if err != nil {
		return Card{}, false
	}
	card.Site = "Instagram"
	card.TTL = 300
	return card, true
}
func (s *Service) imgur(ctx context.Context, u *url.URL) (Card, bool) {
	match := imgurImage.FindStringSubmatch(u.Path)
	if len(match) == 0 && !imgurAlbum.MatchString(u.Path) {
		return Card{}, false
	}
	if len(match) > 0 {
		switch strings.ToLower(match[1]) {
		case "about", "search", "privacy", "topics", "contact", "signin", "register", "uploads", "blog", "rules":
			return Card{}, false
		}
	}
	card, err := s.page(ctx, u)
	if err == nil {
		card.Site = "Imgur"
		if len(match) > 0 && card.Image == "" && strings.ToLower(u.Hostname()) == "i.imgur.com" && strings.HasPrefix(card.ContentType, "image/") {
			card.Image = u.String()
		}
		if card.Title != "" && !regexp.MustCompile(`(?i)^(imgur|the magic of the internet|content not available)`).MatchString(card.Title) {
			return card, true
		}
	}
	if len(match) > 0 {
		image := "https://i.imgur.com/" + match[1] + ".png"
		if strings.ToLower(u.Hostname()) == "i.imgur.com" && regexp.MustCompile(`(?i)\.(gif|jpe?g|png|webp)$`).MatchString(u.Path) {
			image = u.String()
		}
		return Card{URL: u.String(), Title: "Imgur image " + match[1], Site: "Imgur", Image: asset(u, image), ContentType: "text/html", TTL: 600}, true
	}
	return Card{}, false
}
