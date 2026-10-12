package preview

import (
	"context"
	"golang.org/x/net/html"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

type nitterCandidate struct {
	host         string
	milliseconds int
}

func attr(node *html.Node, key string) string {
	for _, value := range node.Attr {
		if value.Key == key {
			return value.Val
		}
	}
	return ""
}
func nodeText(node *html.Node) string {
	if node.Type == html.TextNode {
		return node.Data
	}
	var text strings.Builder
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		text.WriteString(nodeText(child))
	}
	return text.String()
}
func nitterCandidates(raw []byte) []nitterCandidate {
	doc, err := html.Parse(strings.NewReader(string(raw)))
	if err != nil {
		return nil
	}
	candidates := []nitterCandidate{}
	var visit func(*html.Node)
	visit = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "tr" {
			healthy, host, ms := false, "", 0
			var scan func(*html.Node)
			scan = func(child *html.Node) {
				if child.Data == "span" && attr(child, "aria-label") == "healthy" {
					healthy = true
				}
				if child.Data == "a" && host == "" {
					candidate, err := url.Parse(attr(child, "href"))
					if err == nil && candidate.Scheme == "https" && candidate.RawQuery == "" && candidate.Fragment == "" && (candidate.Path == "" || candidate.Path == "/") {
						if _, err := Target(candidate.String()); err == nil {
							host = candidate.Scheme + "://" + candidate.Host
						}
					}
				}
				if child.Data == "td" && attr(child, "data-name") == "average" {
					fields := strings.Fields(nodeText(child))
					if len(fields) > 0 {
						ms, _ = strconv.Atoi(fields[0])
					}
				}
				for sub := child.FirstChild; sub != nil; sub = sub.NextSibling {
					scan(sub)
				}
			}
			scan(node)
			if healthy && host != "" && ms > 0 && ms <= 1000000 {
				candidates = append(candidates, nitterCandidate{host, ms})
			}
			return
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
		}
	}
	visit(doc)
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].milliseconds < candidates[j].milliseconds })
	return candidates
}

// Nitter selects a publicly reachable mirror, caching success for fifteen minutes.
func (s *Service) Nitter(ctx context.Context) string {
	s.mu.Lock()
	if time.Now().Before(s.nitterUntil) || s.nitterLoading {
		host := s.nitterHost
		s.mu.Unlock()
		return host
	}
	s.nitterLoading = true
	s.mu.Unlock()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	host := ""
	tracker, trackerCancel := context.WithTimeout(ctx, 2*time.Second)
	raw, err := s.providerData(tracker, "https://status.d420.de/", "text/html")
	trackerCancel()
	if err == nil {
		candidates := nitterCandidates(raw)
		for _, candidate := range candidates[:min(len(candidates), 3)] {
			probe, probeCancel := context.WithTimeout(ctx, time.Second)
			body, err := s.providerData(probe, candidate.host+"/", "text/html")
			probeCancel()
			if err == nil && (strings.Contains(strings.ToLower(string(body)), "nitter") || strings.Contains(strings.ToLower(string(body)), "xcancel")) {
				host = candidate.host
				break
			}
		}
	}
	ttl := time.Minute
	if host != "" {
		ttl = 15 * time.Minute
	}
	s.mu.Lock()
	s.nitterHost = host
	s.nitterUntil = time.Now().Add(ttl)
	s.nitterLoading = false
	s.mu.Unlock()
	return host
}
