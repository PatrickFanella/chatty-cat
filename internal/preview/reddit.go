package preview

import (
	"context"
	"encoding/xml"
	"golang.org/x/net/html"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var redditPost = regexp.MustCompile(`^/(?:r/[a-zA-Z0-9_-]{1,50}/)?comments/[a-zA-Z0-9]{1,20}(?:/|$)`)
var redditComment = regexp.MustCompile(`/comments/[a-zA-Z0-9]{1,20}/[^/]*/([a-zA-Z0-9]{1,20})(?:/|$)`)
var redditCollection = regexp.MustCompile(`^/(r|u|user)/([a-zA-Z0-9_-]{1,50})(?:/|$)`)

func (s *Service) reddit(ctx context.Context, u *url.URL) (Card, bool) {
	path, post := "", false
	if strings.ToLower(u.Hostname()) == "redd.it" {
		id := strings.Trim(u.Path, "/")
		if regexp.MustCompile(`^[a-zA-Z0-9]{1,20}$`).MatchString(id) {
			path = "/comments/" + id
			post = true
		}
	} else if match := redditPost.FindString(u.Path); match != "" {
		path = strings.TrimSuffix(match, "/")
		post = true
	} else if match := redditCollection.FindStringSubmatch(u.Path); len(match) == 3 {
		kind := match[1]
		if kind == "u" {
			kind = "user"
		}
		path = "/" + kind + "/" + match[2]
	}
	if path == "" {
		return Card{}, false
	}
	raw, err := s.providerData(ctx, "https://www.reddit.com"+path+".rss?limit=4", "application/atom+xml,text/xml")
	if err != nil {
		return Card{}, false
	}
	var feed struct {
		Title    string `xml:"title"`
		Subtitle string `xml:"subtitle"`
		Entries  []struct {
			ID        string `xml:"id"`
			Title     string `xml:"title"`
			Content   string `xml:"content"`
			Published string `xml:"published"`
			Author    struct {
				Name string `xml:"name"`
			} `xml:"author"`
			Link struct {
				Href string `xml:"href,attr"`
			} `xml:"link"`
		} `xml:"entry"`
	}
	if xml.Unmarshal(raw, &feed) != nil {
		return Card{}, false
	}
	card := Card{URL: u.String(), Site: "Reddit", ContentType: "text/html", TTL: 600}
	if post && len(feed.Entries) > 0 {
		entry := feed.Entries[0]
		if match := redditComment.FindStringSubmatch(u.Path); len(match) == 2 {
			for _, candidate := range feed.Entries {
				if candidate.ID == "t1_"+match[1] {
					entry = candidate
					break
				}
			}
		}
		card.Title = clean(entry.Title, 300)
		card.Description, card.Image = redditContent(entry.Content, u)
		card.Author = clean(strings.TrimPrefix(entry.Author.Name, "/"), 200)
		if date, err := time.Parse(time.RFC3339Nano, entry.Published); err == nil {
			card.Published = date.UTC().Format(time.RFC3339)
		}
		if strings.ToLower(u.Hostname()) == "redd.it" {
			if link, err := url.Parse(entry.Link.Href); err == nil && link.Scheme == "https" && link.Host == "www.reddit.com" && strings.Contains(link.Path, path+"/") {
				card.URL = link.String()
			}
		}
	} else {
		card.Title = clean(feed.Title, 300)
		parts := []string{clean(feed.Subtitle, 300)}
		for _, entry := range feed.Entries[:min(len(feed.Entries), 4)] {
			parts = append(parts, clean(entry.Title, 120))
		}
		card.Description = clean(strings.Join(parts, " · "), 1000)
	}
	return card, card.Title != ""
}
func redditContent(raw string, base *url.URL) (string, string) {
	tokenizer := html.NewTokenizer(strings.NewReader(raw))
	tokenizer.SetMaxBuf(512 << 10)
	var text strings.Builder
	image := ""
	hidden := 0
	for {
		kind := tokenizer.Next()
		if kind == html.ErrorToken {
			break
		}
		token := tokenizer.Token()
		if token.Data == "script" || token.Data == "style" {
			if kind == html.StartTagToken {
				hidden++
			} else if kind == html.EndTagToken && hidden > 0 {
				hidden--
			}
			continue
		}
		if hidden > 0 {
			continue
		}
		if kind == html.TextToken {
			text.WriteString(token.Data)
			text.WriteByte(' ')
		}
		if token.Data == "img" && image == "" {
			for _, attr := range token.Attr {
				if attr.Key == "src" {
					image = asset(base, attr.Val)
				}
			}
		}
	}
	body := text.String()
	if index := strings.Index(strings.ToLower(body), "submitted by"); index >= 0 {
		body = body[:index]
	}
	return clean(body, 1000), image
}
