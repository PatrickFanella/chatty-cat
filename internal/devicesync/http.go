package devicesync

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"time"
)

type Authorize func(http.ResponseWriter, *http.Request, bool) (string, bool)

func (s *Store) Register(mux *http.ServeMux, authorize Authorize) {
	slots := make(chan struct{}, 2)
	mux.HandleFunc("GET /api/sync/config", func(w http.ResponseWriter, _ *http.Request) {
		headers(w)
		if err := json.NewEncoder(w).Encode(struct {
			Enabled  bool `json:"enabled"`
			MaxBytes int  `json:"maxBytes"`
		}{s.Enabled(), MaxDocumentBytes}); err != nil {
			slog.Debug("sync configuration response closed")
		}
	})
	handler := func(w http.ResponseWriter, r *http.Request) {
		headers(w)
		if !s.Enabled() {
			http.Error(w, "device sync is not configured", http.StatusServiceUnavailable)
			return
		}
		if len(r.URL.RawQuery) > 0 || authorize == nil {
			http.Error(w, "same-origin account sync unavailable", http.StatusBadRequest)
			return
		}
		write := r.Method != http.MethodGet
		account, ok := authorize(w, r, write)
		if !ok {
			return
		}
		if r.Method == http.MethodGet {
			reply(w, s.Read(account))
			return
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			w.Header().Set("Retry-After", "5")
			http.Error(w, "sync mutation capacity reached", http.StatusTooManyRequests)
			return
		}
		expected := r.Header.Get("If-Match")
		if len(expected) < 3 || expected[0] != '"' || expected[len(expected)-1] != '"' {
			http.Error(w, "fetch a revision before writing", http.StatusPreconditionRequired)
			return
		}
		expected = expected[1 : len(expected)-1]
		if expected != "0" && !revisionPattern.MatchString(expected) {
			http.Error(w, "invalid sync revision", http.StatusBadRequest)
			return
		}
		media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || media != "application/json" {
			http.Error(w, "JSON body required", http.StatusBadRequest)
			return
		}
		controller := http.NewResponseController(w)
		if err := controller.SetReadDeadline(time.Now().Add(30 * time.Second)); err != nil && !errors.Is(err, http.ErrNotSupported) {
			http.Error(w, "sync read unavailable", http.StatusServiceUnavailable)
			return
		}
		defer func() {
			if err := controller.SetReadDeadline(time.Time{}); err != nil && !errors.Is(err, http.ErrNotSupported) {
				slog.Debug("sync read deadline reset failed")
			}
		}()
		limit := int64(MaxDocumentBytes + 4096)
		if r.Method == http.MethodDelete {
			limit = 2048
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		data, err := io.ReadAll(r.Body)
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				http.Error(w, "sync body exceeds limit", http.StatusRequestEntityTooLarge)
			} else {
				http.Error(w, "sync read incomplete", http.StatusBadRequest)
			}
			return
		}
		var body struct {
			RequestID string          `json:"requestID"`
			Document  json.RawMessage `json:"document,omitempty"`
		}
		if decode(data, &body) != nil || !requestPattern.MatchString(body.RequestID) {
			http.Error(w, "invalid sync request", http.StatusBadRequest)
			return
		}
		var document Document
		if r.Method == http.MethodPut {
			document, err = ParseDocument(body.Document)
			if err != nil {
				http.Error(w, "invalid public sync document", http.StatusBadRequest)
				return
			}
		} else if len(body.Document) != 0 {
			http.Error(w, "delete body must contain only its request ID", http.StatusBadRequest)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		r = r.WithContext(ctx)
		fresh, valid := authorize(w, r, true)
		if !valid {
			return
		}
		if fresh != account {
			http.Error(w, "sync account changed", http.StatusForbidden)
			return
		}
		if err := ctx.Err(); err != nil {
			http.Error(w, "sync request cancelled", http.StatusRequestTimeout)
			return
		}
		var result Snapshot
		if r.Method == http.MethodPut {
			result, err = s.Save(account, expected, body.RequestID, document)
		} else {
			result, err = s.Delete(account, expected, body.RequestID)
		}
		if err != nil {
			if errors.Is(err, ErrConflict) {
				http.Error(w, ErrConflict.Error(), http.StatusConflict)
			} else {
				http.Error(w, "sync write unavailable or outcome uncertain; fetch the current revision before another attempt", http.StatusServiceUnavailable)
			}
			return
		}
		reply(w, result)
	}
	mux.HandleFunc("GET /api/sync", handler)
	mux.HandleFunc("PUT /api/sync", handler)
	mux.HandleFunc("DELETE /api/sync", handler)
}
func headers(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
}
func reply(w http.ResponseWriter, value Snapshot) {
	w.Header().Set("ETag", "\""+value.Revision+"\"")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Debug("sync snapshot response closed")
	}
}
