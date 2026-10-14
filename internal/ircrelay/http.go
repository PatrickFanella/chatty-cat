package ircrelay

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"
)

type Authorize func(http.ResponseWriter, *http.Request, bool) (string, bool)

func headers(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
}
func reply(w http.ResponseWriter, v any) { _ = json.NewEncoder(w).Encode(v) }
func (s *Service) Register(mux *http.ServeMux, authorize Authorize) {
	slots := make(chan struct{}, 8)
	mux.HandleFunc("GET /api/irc/config", func(w http.ResponseWriter, _ *http.Request) {
		headers(w)
		reply(w, map[string]any{"enabled": len(s.networks) > 0, "protocol": "irc-tls", "maxMessages": 500})
	})
	mux.HandleFunc("GET /api/irc/networks", func(w http.ResponseWriter, r *http.Request) {
		headers(w)
		if authorize == nil {
			http.Error(w, "login unavailable", http.StatusUnauthorized)
			return
		}
		account, ok := authorize(w, r, false)
		if !ok {
			return
		}
		if r.URL.RawQuery != "" {
			http.Error(w, "invalid network query", http.StatusBadRequest)
			return
		}
		type public struct {
			ID       string   `json:"id"`
			Name     string   `json:"name"`
			Nick     string   `json:"nick"`
			Channels []string `json:"channels"`
		}
		list := []public{}
		for _, n := range s.networks {
			if n.Account == account {
				list = append(list, public{n.ID, n.Name, n.Nick, n.Channels})
			}
		}
		reply(w, map[string]any{"protocol": "irc-tls", "networks": list})
	})
	mux.HandleFunc("GET /api/irc/snapshot", func(w http.ResponseWriter, r *http.Request) {
		headers(w)
		if authorize == nil {
			http.Error(w, "login unavailable", http.StatusUnauthorized)
			return
		}
		account, ok := authorize(w, r, false)
		if !ok {
			return
		}
		q, err := parseQuery(r)
		if err != nil {
			http.Error(w, "invalid IRC query", http.StatusBadRequest)
			return
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			http.Error(w, "IRC request capacity reached", http.StatusTooManyRequests)
			return
		}
		v, err := s.Read(account, q)
		if err != nil {
			http.Error(w, "IRC snapshot unavailable; connect explicitly", http.StatusConflict)
			return
		}
		reply(w, v)
	})
	mux.HandleFunc("POST /api/irc/action", func(w http.ResponseWriter, r *http.Request) {
		headers(w)
		if authorize == nil {
			http.Error(w, "login unavailable", http.StatusUnauthorized)
			return
		}
		account, ok := authorize(w, r, true)
		if !ok {
			return
		}
		if r.URL.RawQuery != "" || r.Header.Get("Content-Type") != "application/json" {
			http.Error(w, "JSON action required", http.StatusBadRequest)
			return
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			http.Error(w, "IRC request capacity reached", http.StatusTooManyRequests)
			return
		}
		controller := http.NewResponseController(w)
		if e := controller.SetReadDeadline(time.Now().Add(10 * time.Second)); e != nil && !errors.Is(e, http.ErrNotSupported) {
			http.Error(w, "IRC action read unavailable", http.StatusServiceUnavailable)
			return
		}
		defer func() { _ = controller.SetReadDeadline(time.Time{}) }()
		var body struct {
			Kind    string `json:"kind"`
			Network string `json:"network"`
			Request string `json:"requestID"`
			Epoch   string `json:"epoch,omitempty"`
			Target  string `json:"target,omitempty"`
			Text    string `json:"text,omitempty"`
		}
		d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		d.DisallowUnknownFields()
		if d.Decode(&body) != nil || d.Decode(new(any)) != io.EOF || !identifier.MatchString(body.Network) || !requestID.MatchString(body.Request) {
			http.Error(w, "invalid IRC action", http.StatusBadRequest)
			return
		}
		current, ok := authorize(w, r, true)
		if !ok {
			return
		}
		if current != account {
			http.Error(w, "IRC account changed", http.StatusForbidden)
			return
		}
		var result any
		var err error
		switch body.Kind {
		case "connect":
			if body.Epoch != "" || body.Target != "" || body.Text != "" {
				err = errors.New("invalid connect fields")
				break
			}
			result, err = s.Connect(r.Context(), account, body.Network, body.Request)
		case "disconnect":
			if body.Target != "" || body.Text != "" {
				err = errors.New("invalid disconnect fields")
				break
			}
			err = s.Disconnect(account, body.Network, body.Epoch)
			result = map[string]bool{"disconnected": err == nil}
		case "send":
			result, err = s.Send(account, body.Network, body.Epoch, body.Request, body.Target, body.Text)
		case "part", "join":
			if body.Text != "" {
				err = errors.New("invalid channel fields")
				break
			}
			err = s.channelAction(account, body.Network, body.Epoch, body.Target, body.Kind)
			result = map[string]bool{"submitted": err == nil}
		default:
			err = errors.New("unsupported IRC action")
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		reply(w, result)
	})
}
func parseQuery(r *http.Request) (string, error) {
	q := r.URL.Query()
	if len(q) != 1 || len(q["network"]) != 1 || !identifier.MatchString(q.Get("network")) {
		return "", errors.New("invalid network")
	}
	return q.Get("network"), nil
}
