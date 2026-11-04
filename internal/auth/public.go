package auth

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// HasAppCredentials reports whether this client can read public Helix metadata.
func (s *Service) HasAppCredentials() bool { return s.cfg.ClientID != "" }

// PublicRead uses a server-owned credential for fixed public Helix reads.
// Public desktop clients use a local session instead of an app credential.
func (s *Service) PublicRead(ctx context.Context, path string) ([]byte, error) {
	u, err := url.Parse(path)
	if err != nil || u.IsAbs() || u.Host != "" || u.Fragment != "" {
		return nil, errors.New("invalid public API path")
	}
	switch u.Path {
	case "/users", "/videos", "/clips", "/chat/emotes/global", "/chat/emotes":
	default:
		return nil, errors.New("public API path unavailable")
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	stop := context.AfterFunc(s.ctx, cancel)
	defer stop()
	if s.cfg.PublicClient {
		return s.publicUserRead(ctx, u.String())
	}
	for attempt := 0; attempt < 2; attempt++ {
		access, err := s.appCredential(ctx)
		if err != nil {
			return nil, err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimSuffix(s.cfg.HelixURL, "/")+u.String(), nil)
		if err != nil {
			return nil, errors.New("public API request unavailable")
		}
		req.Header.Set("Authorization", "Bearer "+access)
		req.Header.Set("Client-Id", s.cfg.ClientID)
		res, err := s.client.Do(req)
		if err != nil {
			return nil, errors.New("public API request failed")
		}
		data, readErr := io.ReadAll(io.LimitReader(res.Body, (1<<20)+1))
		closeErr := res.Body.Close()
		if res.StatusCode == http.StatusUnauthorized {
			s.appMu.Lock()
			if s.appAccess == access {
				s.appAccess = ""
			}
			if attempt == 1 {
				s.appRetryAfter = time.Now().Add(time.Minute)
			}
			s.appMu.Unlock()
			if attempt == 0 {
				continue
			}
			return nil, errors.New("public API credential rejected")
		}
		if res.StatusCode != http.StatusOK || readErr != nil || closeErr != nil || len(data) > 1<<20 || !json.Valid(data) {
			return nil, errors.New("public API response unavailable")
		}
		return data, nil
	}
	return nil, errors.New("public API credential rejected")
}
func (s *Service) appCredential(ctx context.Context) (string, error) {
	s.appMu.Lock()
	defer s.appMu.Unlock()
	if ctx.Err() != nil || s.ctx.Err() != nil || s.cfg.ClientID == "" {
		return "", errors.New("public API unavailable")
	}
	now := time.Now()
	if now.Before(s.appRetryAfter) {
		return "", errors.New("public API temporarily unavailable")
	}
	if s.appAccess != "" && now.Add(time.Minute).Before(s.appExpires) && now.Sub(s.appValidated) < validateInterval {
		return s.appAccess, nil
	}
	access := s.appAccess
	if access == "" || !now.Add(time.Minute).Before(s.appExpires) {
		values := url.Values{"grant_type": {"client_credentials"}, "client_id": {s.cfg.ClientID}, "client_secret": {s.cfg.ClientSecret}}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.TokenURL, strings.NewReader(values.Encode()))
		if err != nil {
			return s.appFailure(ctx)
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		res, err := s.client.Do(req)
		if err != nil {
			return s.appFailure(ctx)
		}
		var tok tokens
		decodeErr := json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&tok)
		closeErr := res.Body.Close()
		if res.StatusCode != http.StatusOK || decodeErr != nil || closeErr != nil || tok.Access == "" || tok.Type != "bearer" || tok.Expires < 120 || tok.Expires > 366*24*3600 {
			return s.appFailure(ctx)
		}
		access = tok.Access
		s.appExpires = now.Add(time.Duration(tok.Expires) * time.Second)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.cfg.ValidateURL, nil)
	if err != nil {
		return s.appFailure(ctx)
	}
	req.Header.Set("Authorization", "OAuth "+access)
	res, err := s.client.Do(req)
	if err != nil {
		return s.appFailure(ctx)
	}
	var app identity
	decodeErr := json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&app)
	closeErr := res.Body.Close()
	if res.StatusCode != http.StatusOK || decodeErr != nil || closeErr != nil || app.ClientID != s.cfg.ClientID || app.UserID != "" || app.Expires < 120 || app.Expires > 366*24*3600 {
		return s.appFailure(ctx)
	}
	s.appAccess = access
	s.appExpires = now.Add(time.Duration(app.Expires) * time.Second)
	s.appValidated = now
	s.appRetryAfter = time.Time{}
	return access, nil
}
func (s *Service) appFailure(ctx context.Context) (string, error) {
	s.appAccess = ""
	if ctx.Err() == nil {
		s.appRetryAfter = time.Now().Add(time.Minute)
	}
	return "", errors.New("public API credential unavailable")
}

// publicUserRead serves the desktop's public metadata using a local session.
// The path has already passed PublicRead's fixed read-only allowlist.
func (s *Service) publicUserRead(ctx context.Context, path string) ([]byte, error) {
	s.mu.Lock()
	var candidates []*session
	for _, p := range s.sessions {
		candidates = append(candidates, p)
	}
	s.mu.Unlock()
	for _, p := range candidates {
		p.mu.Lock()
		if !time.Now().Before(p.expires) || !s.check(ctx, p, time.Now()) {
			p.mu.Unlock()
			continue
		}
		data, status, ok := s.helix(ctx, p, http.MethodGet, path, nil)
		p.mu.Unlock()
		if ok && status == http.StatusOK && json.Valid(data) {
			return data, nil
		}
		return nil, errors.New("public API response unavailable")
	}
	return nil, errors.New("sign in to load Twitch metadata")
}
