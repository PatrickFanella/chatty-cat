package companion

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"os/exec"
	"regexp"
	"runtime"
	"sync"
	"time"
)

type OverlaySettings struct {
	Channel      string             `json:"channel"`
	Opacity      float64            `json:"opacity"`
	Scale        float64            `json:"scale"`
	Width        int                `json:"width"`
	Height       int                `json:"height"`
	Shadow       bool               `json:"shadow"`
	ClickThrough bool               `json:"clickThrough"`
	Appearance   *OverlayAppearance `json:"appearance,omitempty"`
}

type OverlayAppearance struct {
	BackgroundOpacity int    `json:"backgroundOpacity"`
	Shadow            bool   `json:"shadow"`
	ShadowOpacity     int    `json:"shadowOpacity"`
	ShadowColor       string `json:"shadowColor"`
	ShadowOffsetX     int    `json:"shadowOffsetX"`
	ShadowOffsetY     int    `json:"shadowOffsetY"`
	ShadowRadius      int    `json:"shadowRadius"`
}

var overlayColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func (v OverlayAppearance) Valid() bool {
	return v.BackgroundOpacity >= 0 && v.BackgroundOpacity <= 255 && v.ShadowOpacity >= 0 && v.ShadowOpacity <= 255 && overlayColor.MatchString(v.ShadowColor) && v.ShadowOffsetX >= -20 && v.ShadowOffsetX <= 20 && v.ShadowOffsetY >= -20 && v.ShadowOffsetY <= 20 && v.ShadowRadius >= 0 && v.ShadowRadius <= 40
}

func (v OverlaySettings) Valid() bool {
	return channelID.MatchString(v.Channel) && !math.IsNaN(v.Opacity) && !math.IsNaN(v.Scale) && v.Opacity >= .2 && v.Opacity <= 1 && v.Scale >= .5 && v.Scale <= 2 && v.Width >= 240 && v.Width <= 1600 && v.Height >= 200 && v.Height <= 1600 && (v.Appearance == nil || v.Appearance.Valid())
}

type OverlayState struct {
	Open        bool            `json:"open"`
	Interactive bool            `json:"interactive"`
	Settings    OverlaySettings `json:"settings"`
	X           int             `json:"x"`
	Y           int             `json:"y"`
	Recovery    string          `json:"recovery"`
}

func overlayURL(origin, channel string) string {
	q := url.Values{"channel": {channel}, "overlay": {"1"}, "video": {"off"}}
	return origin + "/?" + q.Encode()
}

// overlayHost communicates only with the owner-installed native executable.
// A bounded request/ack exchange prevents a stalled host holding HTTP forever.
type overlayHost struct {
	mu      sync.Mutex
	cmd     *exec.Cmd
	input   io.WriteCloser
	replies chan OverlayState
	done    chan struct{}
	cancel  context.CancelFunc
	last    OverlayState
}

func startOverlay(ctx context.Context, path, origin, account string, settings OverlaySettings) (*overlayHost, error) {
	config := struct {
		URL      string          `json:"url"`
		Account  string          `json:"account"`
		Settings OverlaySettings `json:"settings"`
	}{overlayURL(origin, settings.Channel), account, settings}
	raw, _ := json.Marshal(config)
	ctx, cancel := context.WithCancel(ctx)
	cmd := exec.CommandContext(ctx, path, "--config", base64.StdEncoding.EncodeToString(raw))
	cmd.WaitDelay = time.Second
	input, e := cmd.StdinPipe()
	if e != nil {
		cancel()
		return nil, e
	}
	output, e := cmd.StdoutPipe()
	if e != nil {
		cancel()
		_ = input.Close()
		return nil, e
	}
	cmd.Stderr = io.Discard
	if e = cmd.Start(); e != nil {
		cancel()
		_ = input.Close()
		return nil, e
	}
	h := &overlayHost{cmd: cmd, input: input, replies: make(chan OverlayState, 1), done: make(chan struct{}), cancel: cancel}
	go func() {
		scanner := bufio.NewScanner(output)
		scanner.Buffer(make([]byte, 4096), 4096)
		for scanner.Scan() {
			var v OverlayState
			if json.Unmarshal(scanner.Bytes(), &v) != nil || !v.Open || !v.Settings.Valid() {
				cancel()
				break
			}
			select {
			case h.replies <- v:
			case <-ctx.Done():
				break
			}
		}
		_ = cmd.Wait()
		close(h.done)
	}()
	select {
	case v := <-h.replies:
		h.last = v
		return h, nil
	case <-h.done:
		cancel()
		return nil, errors.New("native overlay failed to start")
	case <-time.After(4 * time.Second):
		h.close()
		return nil, errors.New("native overlay startup timed out")
	}
}
func (h *overlayHost) request(kind string, settings *OverlaySettings) (OverlayState, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	body := struct {
		Kind     string           `json:"kind"`
		Settings *OverlaySettings `json:"settings,omitempty"`
	}{kind, settings}
	raw, _ := json.Marshal(body)
	written := make(chan error, 1)
	go func() { _, e := h.input.Write(append(raw, '\n')); written <- e }()
	select {
	case e := <-written:
		if e != nil {
			h.cancel()
			return OverlayState{}, errors.New("native overlay connection lost")
		}
	case <-h.done:
		return OverlayState{}, errors.New("native overlay closed")
	case <-time.After(3 * time.Second):
		h.cancel()
		return OverlayState{}, errors.New("native overlay write timed out")
	}
	select {
	case v := <-h.replies:
		h.last = v
		return v, nil
	case <-h.done:
		return OverlayState{}, errors.New("native overlay closed")
	case <-time.After(3 * time.Second):
		h.cancel()
		return OverlayState{}, errors.New("native overlay response timed out")
	}
}
func (h *overlayHost) close() { h.cancel(); _ = h.input.Close(); <-h.done }

func (s *Service) platformOverlayAvailable() bool {
	return runtime.GOOS == "darwin" && s.config.OverlayExecutable != "" && available(Tool{Executable: s.config.OverlayExecutable})
}

// Called under the pairing mutex: no stale-account operation can race revocation.
func (s *Service) overlayHTTP(w http.ResponseWriter, r *http.Request) {
	if !s.overlaySupported() {
		http.Error(w, "macOS overlay host is not installed/configured", http.StatusServiceUnavailable)
		return
	}
	if r.Method == "GET" {
		if s.overlay == nil {
			respond(w, 200, OverlayState{})
			return
		}
		v, e := s.overlay.request("status", nil)
		if e != nil {
			s.overlay.close()
			s.overlay = nil
			http.Error(w, e.Error(), http.StatusConflict)
			return
		}
		respond(w, 200, v)
		return
	}
	var body overlayAction
	if !decode(w, r, &body) {
		return
	}
	if !requestID.MatchString(body.ID) || body.Kind != "open" && body.Kind != "update" && body.Kind != "recover" && body.Kind != "close" || (body.Kind == "open" || body.Kind == "update") != (body.Settings != nil) || body.Settings != nil && !body.Settings.Valid() {
		http.Error(w, "invalid overlay operation", http.StatusBadRequest)
		return
	}
	if receipt, ok := s.overlayReceipts[body.ID]; ok {
		old, _ := json.Marshal(receipt.Body)
		next, _ := json.Marshal(body)
		if string(old) != string(next) {
			http.Error(w, "overlay request ID already used", http.StatusConflict)
			return
		}
		respond(w, 200, receipt.State)
		return
	}
	if len(s.overlayReceipts) >= 128 {
		http.Error(w, "overlay receipt limit reached; restart and pair again", http.StatusConflict)
		return
	}
	var v OverlayState
	var e error
	switch body.Kind {
	case "open":
		if s.overlay != nil {
			http.Error(w, "close existing overlay first", http.StatusConflict)
			return
		}
		ctx, cancel := context.WithDeadline(s.ctx, s.expires)
		s.overlay, e = startOverlay(ctx, s.config.OverlayExecutable, s.config.Origin, s.account, *body.Settings)
		if e != nil {
			cancel()
		} else {
			v = s.overlay.last
			go func(h *overlayHost) { <-h.done; cancel() }(s.overlay)
		}
	case "update", "recover":
		if s.overlay == nil {
			http.Error(w, "open overlay first", http.StatusConflict)
			return
		}
		if body.Kind == "update" && body.Settings.Channel != s.overlay.last.Settings.Channel {
			http.Error(w, "close and reopen before changing overlay channel", http.StatusBadRequest)
			return
		}
		v, e = s.overlay.request(body.Kind, body.Settings)
	case "close":
		if s.overlay != nil {
			s.overlay.close()
			s.overlay = nil
		}
	}
	if e != nil {
		http.Error(w, "overlay operation uncertain; check status or native recovery menu", http.StatusConflict)
		return
	}
	s.overlayReceipts[body.ID] = overlayReceipt{body, v}
	respond(w, 200, v)
}
