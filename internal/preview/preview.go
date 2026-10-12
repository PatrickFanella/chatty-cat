// Package preview retrieves bounded public-web metadata without accessing private networks.
package preview

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/html"
)

// Card is safe textual metadata. HTML from upstream is never returned.
type Card struct {
	Views       int64        `json:"views,omitempty"`
	Social      *SocialMedia `json:"social,omitempty"`
	URL         string       `json:"url"`
	Title       string       `json:"title"`
	Description string       `json:"description"`
	Site        string       `json:"site"`
	Image       string       `json:"image"`
	Video       string       `json:"video,omitempty"`
	Icon        string       `json:"icon"`
	Author      string       `json:"author"`
	Published   string       `json:"published"`
	ContentType string       `json:"contentType"`
	TTL         int          `json:"ttl"`
}

var blocked = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"), netip.MustParsePrefix("100.64.0.0/10"), netip.MustParsePrefix("192.0.0.0/24"), netip.MustParsePrefix("192.0.2.0/24"), netip.MustParsePrefix("198.18.0.0/15"), netip.MustParsePrefix("198.51.100.0/24"), netip.MustParsePrefix("203.0.113.0/24"), netip.MustParsePrefix("240.0.0.0/4"), netip.MustParsePrefix("2001:db8::/32"), netip.MustParsePrefix("2001::/32"), netip.MustParsePrefix("2002::/16"), netip.MustParsePrefix("64:ff9b::/96"), netip.MustParsePrefix("64:ff9b:1::/48"),
}

func publicIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return false
	}
	for _, prefix := range blocked {
		if prefix.Contains(ip) {
			return false
		}
	}
	return true
}

// Target validates schemes, authorities and default ports before any network access.
func Target(raw string) (*url.URL, error) {
	if len(raw) > 2048 {
		return nil, errors.New("URL too long")
	}
	u, err := url.Parse(raw)
	if err != nil || u == nil || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil || u.Hostname() == "" || u.Opaque != "" {
		return nil, errors.New("invalid public URL")
	}
	if u.Port() != "" && u.Port() != "80" && u.Port() != "443" {
		return nil, errors.New("non-default port")
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if ip, err := netip.ParseAddr(host); err == nil {
		if !publicIP(ip) {
			return nil, errors.New("private address")
		}
	} else {
		if !strings.Contains(host, ".") {
			return nil, errors.New("non-public hostname")
		}
		for _, suffix := range []string{"localhost", "local", "internal", "lan", "home", "corp", "invalid", "test", "example", "onion"} {
			if host == suffix || strings.HasSuffix(host, "."+suffix) {
				return nil, errors.New("non-public hostname")
			}
		}
	}
	u.Fragment = ""
	return u, nil
}
func publicClient() *http.Client {
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	transport := &http.Transport{TLSHandshakeTimeout: 5 * time.Second, ResponseHeaderTimeout: 5 * time.Second, MaxIdleConns: 16, MaxConnsPerHost: 4, IdleConnTimeout: 30 * time.Second}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		return dialPublic(ctx, network, address, net.DefaultResolver.LookupNetIP, dialer.DialContext)
	}

	return &http.Client{Transport: transport, Timeout: 10 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 4 {
			return errors.New("too many redirects")
		}
		_, err := Target(req.URL.String())
		return err
	}}
}

func dialPublic(ctx context.Context, network, address string, lookup func(context.Context, string, string) ([]netip.Addr, error), connect func(context.Context, string, string) (net.Conn, error)) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil || (port != "80" && port != "443") {
		return nil, errors.New("invalid destination")
	}
	ips, err := lookup(ctx, "ip", host)
	if err != nil {
		return nil, fmt.Errorf("resolve public destination: %w", err)
	}
	if len(ips) == 0 {
		return nil, errors.New("destination has no addresses")
	}
	for _, ip := range ips {
		if !publicIP(ip) {
			return nil, errors.New("destination resolves to a private address")
		}
	}
	var last error
	for _, ip := range ips {
		conn, err := connect(ctx, network, net.JoinHostPort(ip.String(), port))
		if err == nil {
			return conn, nil
		}
		last = err
	}
	return nil, fmt.Errorf("connect public destination: %w", last)
}

type entry struct {
	card  Card
	err   error
	until time.Time
}
type budget struct {
	started time.Time
	count   int
}

type flight struct {
	done  chan struct{}
	entry entry
}

// Service owns a bounded cache and concurrent-fetch limit.
type Service struct {
	publicRead    PublicReader
	nitterHost    string
	nitterUntil   time.Time
	nitterLoading bool
	client        *http.Client
	mu            sync.Mutex
	cache         map[string]entry
	flights       map[string]*flight
	slots         chan struct{}
	budgets       map[string]budget
}

// New uses a public-address-pinned transport; a supplied client is for fixture tests.
// PublicReader supplies server-owned credentials only for fixed Helix API paths.
type PublicReader func(context.Context, string) ([]byte, error)

func New(client *http.Client, readers ...PublicReader) *Service {
	if client == nil {
		client = publicClient()
	}
	var read PublicReader
	if len(readers) > 0 {
		read = readers[0]
	}
	return &Service{publicRead: read, client: client, cache: make(map[string]entry), flights: make(map[string]*flight), slots: make(chan struct{}, 8), budgets: make(map[string]budget)}
}

// Close releases idle public-web connections.
func (s *Service) Close() { s.client.CloseIdleConnections() }

// Load coalesces requests and caches successful previews for a day and failures for a minute.
func (s *Service) Load(ctx context.Context, raw string) (Card, error) {
	return s.LoadFor(ctx, raw, "local")
}

// LoadFor limits each caller to thirty uncached lookups per minute.
func (s *Service) LoadFor(ctx context.Context, raw, caller string) (Card, error) {
	u, err := Target(raw)
	if err != nil {
		return Card{}, err
	}
	key := u.String()
	s.mu.Lock()
	if value, ok := s.cache[key]; ok && time.Now().Before(value.until) {
		s.mu.Unlock()
		return value.card, value.err
	}
	if f := s.flights[key]; f != nil {
		s.mu.Unlock()
		select {
		case <-ctx.Done():
			return Card{}, ctx.Err()
		case <-f.done:
			return f.entry.card, f.entry.err
		}
	}
	now := time.Now()
	b := s.budgets[caller]
	if now.Sub(b.started) >= time.Minute {
		b = budget{started: now}
	}
	if b.count >= 30 {
		s.mu.Unlock()
		return Card{}, errors.New("preview lookup rate reached")
	}
	if len(s.budgets) >= 256 {
		var oldest string
		var stamp time.Time
		for key, value := range s.budgets {
			if oldest == "" || value.started.Before(stamp) {
				oldest = key
				stamp = value.started
			}
		}
		delete(s.budgets, oldest)
	}
	b.count++
	s.budgets[caller] = b
	select {
	case s.slots <- struct{}{}:
	default:
		s.mu.Unlock()
		return Card{}, errors.New("preview capacity reached")
	}
	f := &flight{done: make(chan struct{})}
	s.flights[key] = f
	s.mu.Unlock()
	card, err := s.fetch(ctx, u)
	ttl := time.Minute
	if err == nil {
		ttl = 24 * time.Hour
		if card.TTL >= 60 && card.TTL <= 86400 {
			ttl = time.Duration(card.TTL) * time.Second
		}
	}
	value := entry{card: card, err: err, until: time.Now().Add(ttl)}
	s.mu.Lock()
	if len(s.cache) >= 256 {
		var oldest string
		var stamp time.Time
		for k, v := range s.cache {
			if oldest == "" || v.until.Before(stamp) {
				oldest = k
				stamp = v.until
			}
		}
		delete(s.cache, oldest)
	}
	if !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
		s.cache[key] = value
	}
	f.entry = value
	delete(s.flights, key)
	close(f.done)
	s.mu.Unlock()
	<-s.slots
	return card, err
}
func clean(value string, max int) string {
	value = strings.Join(strings.Fields(value), " ")
	r := []rune(value)
	if len(r) > max {
		value = string(r[:max])
	}
	return value
}
func asset(base *url.URL, raw string) string {
	if raw == "" {
		return ""
	}
	reference, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	target := base.ResolveReference(reference)
	if _, err := Target(target.String()); err != nil {
		return ""
	}
	return target.String()
}
func (s *Service) fetch(ctx context.Context, u *url.URL) (Card, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if id := twitterID(u); id != "" {
		return s.twitter(ctx, u, id)
	}
	if card, ok := s.provider(ctx, u); ok {
		return card, nil
	}
	return s.page(ctx, u)
}

func (s *Service) page(ctx context.Context, u *url.URL) (Card, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return Card{}, err
	}
	req.Header.Set("User-Agent", "chatthing-preview/1.0")
	req.Header.Set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1")
	response, err := s.client.Do(req)
	if err != nil {
		return Card{}, fmt.Errorf("fetch preview: %w", err)
	}
	defer func() {
		if err := response.Body.Close(); err != nil {
			slog.Debug("preview response close failed")
		}
	}()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return Card{}, errors.New("upstream preview unavailable")
	}
	final := u
	if response.Request != nil {
		final = response.Request.URL
	}
	contentType, _, typeErr := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if typeErr != nil {
		contentType = "application/octet-stream"
	}
	card := Card{URL: final.String(), Site: final.Hostname(), Title: clean(path.Base(final.Path), 300), ContentType: contentType, TTL: 86400}
	if contentType != "text/html" && contentType != "application/xhtml+xml" {
		return card, nil
	}
	tokenizer := html.NewTokenizer(io.LimitReader(response.Body, 128<<10))
	tokenizer.SetMaxBuf(128 << 10)
	values := make(map[string]string)
	title := false
	for {
		kind := tokenizer.Next()
		if kind == html.ErrorToken {
			break
		}
		token := tokenizer.Token()
		if kind == html.EndTagToken && token.Data == "head" {
			break
		}
		if token.Data == "title" && (kind == html.StartTagToken || kind == html.EndTagToken) {
			title = kind == html.StartTagToken
			continue
		}
		if title && kind == html.TextToken {
			values["title"] += token.Data
		}
		if kind != html.StartTagToken && kind != html.SelfClosingTagToken {
			continue
		}
		attributes := make(map[string]string)
		for _, a := range token.Attr {
			attributes[a.Key] = a.Val
		}
		if token.Data == "meta" {
			key := attributes["property"]
			if key == "" {
				key = attributes["name"]
			}
			if key == "" {
				key = attributes["itemprop"]
			}
			key = strings.ToLower(key)
			if values[key] == "" {
				values[key] = attributes["content"]
			}
		}
		if token.Data == "link" && strings.Contains(strings.ToLower(attributes["rel"]), "icon") && card.Icon == "" {
			card.Icon = asset(final, attributes["href"])
		}
	}
	first := func(keys ...string) string {
		for _, key := range keys {
			if values[key] != "" {
				return values[key]
			}
		}
		return ""
	}
	card.Title = clean(first("og:title", "twitter:title", "title"), 300)
	if card.Title == "" {
		card.Title = card.Site
	}
	card.Description = clean(first("og:description", "twitter:description", "description"), 1000)
	card.Image = asset(final, first("og:image", "twitter:image"))
	if video := asset(final, first("og:video:secure_url", "og:video:url", "og:video")); video != "" {
		if parsed, err := url.Parse(video); err == nil && strings.HasSuffix(strings.ToLower(parsed.Path), ".mp4") {
			card.Video = video
			card.TTL = 300
		}
	}
	card.Author = clean(first("author", "article:author"), 200)
	card.Published = clean(first("article:published_time", "date", "datepublished", "uploaddate"), 100)
	if site := clean(values["og:site_name"], 100); site != "" {
		card.Site = site
	}
	if youtubeHost(final.Hostname()) {
		card.Site = "YouTube"
		if views, err := strconv.ParseInt(values["interactioncount"], 10, 64); err == nil && views >= 0 {
			card.Views = views
			if views > 0 {
				description := countText(views) + " views"
				if card.Description != "" {
					description += " · " + card.Description
				}
				card.Description = description
			}
		}
		card.TTL = 600
	}
	return card, nil
}
