package auth

import (
	"net/http"
	"time"
)

// StorageAccount authorizes same-origin local-storage requests without adding Twitch scopes.
// Mutations require CSRF, and all account requests must name the selected account.
func (s *Service) StorageAccount(w http.ResponseWriter, r *http.Request, write bool) (string, bool) {
	if !s.sameHost(r) || r.Header.Get("Sec-Fetch-Site") == "cross-site" || write && !equal(r.Header.Get("Origin"), s.origin) {
		http.Error(w, "invalid storage origin", http.StatusForbidden)
		return "", false
	}
	p := s.lookup(r)
	if p == nil {
		http.Error(w, "login required", http.StatusUnauthorized)
		return "", false
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if !s.check(r.Context(), p, time.Now()) {
		http.Error(w, "session expired", http.StatusUnauthorized)
		return "", false
	}
	if r.Header.Get("X-Account-ID") != p.user.UserID || write && !equal(r.Header.Get("X-CSRF-Token"), p.csrf) {
		http.Error(w, "account or session request changed", http.StatusForbidden)
		return "", false
	}
	return p.user.UserID, true
}
