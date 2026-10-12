package preview

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var repositoryPart = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,100}$`)
var itemNumber = regexp.MustCompile(`^[1-9][0-9]{0,18}$`)
var wikipediaHost = regexp.MustCompile(`^[a-z][a-z-]{0,31}\.wikipedia\.org$`)

func (s *Service) provider(ctx context.Context, u *url.URL) (Card, bool) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	host := strings.ToLower(u.Hostname())
	if wikipediaHost.MatchString(host) && strings.HasPrefix(u.Path, "/wiki/") {
		return s.wikipedia(ctx, u)
	}
	if videoID := youtubeID(u); videoID != "" {
		return s.youtube(ctx, u, videoID)
	}
	if host == "github.com" || host == "www.github.com" {
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		if len(parts) < 2 || !repositoryPart.MatchString(parts[0]) || !repositoryPart.MatchString(parts[1]) || strings.HasPrefix(parts[0], ".") || strings.HasPrefix(parts[1], ".") {
			return Card{}, false
		}
		switch parts[0] {
		case "orgs", "sponsors", "topics", "settings", "marketplace", "features":
			return Card{}, false
		}
		repository := parts[0] + "/" + parts[1]
		var data struct {
			FullName    string `json:"full_name"`
			Description string `json:"description"`
			Stars       *int64 `json:"stargazers_count"`
			Owner       struct {
				Avatar string `json:"avatar_url"`
			} `json:"owner"`
		}
		endpoint := "https://api.github.com/repos/" + url.PathEscape(parts[0]) + "/" + url.PathEscape(parts[1])
		if err := s.providerJSON(ctx, endpoint, &data); err != nil || !strings.EqualFold(data.FullName, repository) {
			return Card{}, false
		}
		description := clean(data.Description, 900)
		if data.Stars != nil && *data.Stars >= 0 {
			word := "stars"
			if *data.Stars == 1 {
				word = "star"
			}
			if description != "" {
				description += " · "
			}
			description += countText(*data.Stars) + " " + word
		}
		return Card{URL: u.String(), Site: "GitHub", Title: clean(data.FullName, 300), Description: clean(description, 1000), Image: asset(u, data.Owner.Avatar), ContentType: "text/html", TTL: 600}, true
	}
	if host == "news.ycombinator.com" && u.Path == "/item" && itemNumber.MatchString(u.Query().Get("id")) {
		id, err := strconv.ParseInt(u.Query().Get("id"), 10, 64)
		if err != nil {
			return Card{}, false
		}
		var data struct {
			ID       int64  `json:"id"`
			Title    string `json:"title"`
			Author   string `json:"by"`
			URL      string `json:"url"`
			Score    *int64 `json:"score"`
			Comments *int64 `json:"descendants"`
			Time     int64  `json:"time"`
			Dead     bool   `json:"dead"`
			Deleted  bool   `json:"deleted"`
		}
		if err := s.providerJSON(ctx, "https://hacker-news.firebaseio.com/v0/item/"+strconv.FormatInt(id, 10)+".json", &data); err != nil || data.ID != id || data.Title == "" || data.Dead || data.Deleted {
			return Card{}, false
		}
		parts := []string{}
		if data.Score != nil && *data.Score >= 0 {
			parts = append(parts, countText(*data.Score)+" points")
		}
		if data.Comments != nil && *data.Comments >= 0 {
			parts = append(parts, countText(*data.Comments)+" comments")
		}
		if linked, err := Target(data.URL); err == nil {
			parts = append(parts, strings.TrimPrefix(linked.Hostname(), "www."))
		}
		published := ""
		if data.Time > 0 && data.Time <= 253402300799 {
			published = time.Unix(data.Time, 0).UTC().Format(time.RFC3339)
		}
		return Card{URL: u.String(), Site: "Hacker News", Title: clean(html.UnescapeString(data.Title), 300), Description: strings.Join(parts, " · "), Author: clean(data.Author, 200), Published: published, Icon: "https://news.ycombinator.com/y18.svg", ContentType: "text/html", TTL: 600}, true
	}
	return Card{}, false
}

func (s *Service) wikipedia(ctx context.Context, u *url.URL) (Card, bool) {
	title := strings.TrimPrefix(u.Path, "/wiki/")
	if strings.TrimSpace(title) == "" {
		return Card{}, false
	}
	var data struct {
		Type      string `json:"type"`
		Provider  string `json:"provider_name"`
		Title     string `json:"title"`
		Extract   string `json:"extract"`
		Thumbnail struct {
			Source string `json:"source"`
		} `json:"thumbnail"`
		ContentURLs struct {
			Desktop struct {
				Page string `json:"page"`
			} `json:"desktop"`
		} `json:"content_urls"`
	}
	endpoint := "https://" + strings.ToLower(u.Hostname()) + "/api/rest_v1/page/summary/" + url.PathEscape(title)
	if err := s.providerJSON(ctx, endpoint, &data); err != nil || clean(data.Title, 300) == "" || (data.Type != "standard" && data.Type != "disambiguation") {
		return Card{}, false
	}
	canonical := u.String()
	if page, err := Target(data.ContentURLs.Desktop.Page); err == nil && strings.EqualFold(page.Hostname(), u.Hostname()) && strings.HasPrefix(page.Path, "/wiki/") {
		canonical = page.String()
	}
	return Card{URL: canonical, Site: "Wikipedia", Title: clean(data.Title, 300), Description: clean(data.Extract, 1000), Image: asset(u, data.Thumbnail.Source), ContentType: "text/html", TTL: 600}, true
}

func (s *Service) youtube(ctx context.Context, u *url.URL, id string) (Card, bool) {
	var data struct {
		Type      string `json:"type"`
		Provider  string `json:"provider_name"`
		Title     string `json:"title"`
		Author    string `json:"author_name"`
		Thumbnail string `json:"thumbnail_url"`
	}
	query := url.Values{"format": {"json"}, "url": {"https://www.youtube.com/watch?v=" + id}}
	if err := s.providerJSON(ctx, "https://www.youtube.com/oembed?"+query.Encode(), &data); err != nil || data.Type != "video" || (data.Provider != "" && data.Provider != "YouTube") || clean(data.Title, 300) == "" {
		return Card{}, false
	}
	author := clean(data.Author, 200)
	description := ""
	if author != "" {
		description = "by " + author
	}
	return Card{URL: u.String(), Site: "YouTube", Title: clean(data.Title, 300), Description: description, Author: author, Image: asset(u, data.Thumbnail), ContentType: "text/html", TTL: 600}, true
}

func (s *Service) providerJSON(ctx context.Context, raw string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "chatthing-preview/1.0 (+https://chat.subcult.tv)")
	req.Header.Set("Accept", "application/json")
	if req.URL.Hostname() == "api.github.com" {
		req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	}
	response, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("provider request: %w", err)
	}
	defer func() {
		if err := response.Body.Close(); err != nil {
			slog.Debug("provider response close failed")
		}
	}()
	if response.StatusCode != http.StatusOK {
		return errors.New("provider unavailable")
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 512*1024+1))
	if err != nil {
		return fmt.Errorf("provider response: %w", err)
	}
	if len(body) > 512*1024 {
		return errors.New("provider response too large")
	}
	if err := json.Unmarshal(body, target); err != nil {
		return fmt.Errorf("provider JSON: %w", err)
	}
	return nil
}

func countText(count int64) string {
	text := strconv.FormatInt(count, 10)
	for i := len(text) - 3; i > 0; i -= 3 {
		text = text[:i] + "," + text[i:]
	}
	return text
}
