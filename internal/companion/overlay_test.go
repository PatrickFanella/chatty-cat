package companion

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

func TestOverlayPlanRefusesUnpairedArbitraryURLsAndGeometry(t *testing.T) {
	for _, v := range []OverlaySettings{
		{Channel: "../evil", Opacity: 1, Scale: 1, Width: 400, Height: 600},
		{Channel: "room", Opacity: 0, Scale: 1, Width: 400, Height: 600},
		{Channel: "room", Opacity: 1, Scale: 9, Width: 400, Height: 600},
		{Channel: "room", Opacity: 1, Scale: 1, Width: 99999, Height: 600},
	} {
		if v.Valid() {
			t.Fatal("unsafe overlay settings", v)
		}
	}
	good := OverlaySettings{Channel: "room", Opacity: .8, Scale: 1, Width: 400, Height: 600}
	if !good.Valid() {
		t.Fatal("valid settings refused")
	}
	if got := overlayURL("https://chat.subcult.tv", good.Channel); got != "https://chat.subcult.tv/?channel=room&overlay=1&video=off" {
		t.Fatal(got)
	}
}

func TestMain(m *testing.M) {
	if len(os.Args) == 3 && os.Args[1] == "--config" {
		raw, e := base64.StdEncoding.DecodeString(os.Args[2])
		if e != nil {
			os.Exit(2)
		}
		var config struct {
			URL      string          `json:"url"`
			Account  string          `json:"account"`
			Settings OverlaySettings `json:"settings"`
		}
		if json.Unmarshal(raw, &config) != nil || !config.Settings.Valid() || config.Account != "42" || config.URL != "https://chat.subcult.tv/?channel=room&overlay=1&video=off" {
			os.Exit(3)
		}
		state := OverlayState{Open: true, Interactive: !config.Settings.ClickThrough, Settings: config.Settings, Recovery: "Fixture native recovery"}
		encoder := json.NewEncoder(os.Stdout)
		_ = encoder.Encode(state)
		scanner := bufio.NewScanner(os.Stdin)
		for scanner.Scan() {
			var body overlayAction
			if json.Unmarshal(scanner.Bytes(), &body) != nil {
				os.Exit(4)
			}
			switch body.Kind {
			case "recover":
				state.Interactive = true
				state.Settings.ClickThrough = false
			case "update":
				if body.Settings == nil {
					os.Exit(5)
				}
				state.Settings = *body.Settings
				state.Interactive = !body.Settings.ClickThrough
			}
			_ = encoder.Encode(state)
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func TestOverlayPairingReceiptsAccountAndProcessCleanup(t *testing.T) {
	executable, e := os.Executable()
	if e != nil {
		t.Fatal(e)
	}
	s, e := New(Config{Origin: "https://chat.subcult.tv", OverlayExecutable: executable})
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	s.overlaySupported = func() bool { return true } // fixture host supports the command protocol on every CI platform.
	settings := OverlaySettings{Channel: "room", Opacity: .8, Scale: 1, Width: 400, Height: 600, ClickThrough: true}
	body := overlayAction{Kind: "open", ID: "open", Settings: &settings}
	if w := request(s, "POST", "/v1/overlay", s.config.Origin, "", "42", body); w.Code != 401 {
		t.Fatal("unpaired overlay", w.Code)
	}
	token := pair(t, s)
	if w := request(s, "POST", "/v1/overlay", s.config.Origin, token, "43", body); w.Code != 401 {
		t.Fatal("account mismatch", w.Code)
	}
	if w := request(s, "POST", "/v1/overlay", "https://evil.example", token, "42", body); w.Code != 403 {
		t.Fatal("foreign origin", w.Code)
	}
	if w := request(s, "POST", "/v1/overlay", s.config.Origin, token, "42", body); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	first := s.overlay
	if w := request(s, "POST", "/v1/overlay", s.config.Origin, token, "42", body); w.Code != 200 || s.overlay != first {
		t.Fatal("open retry created another host")
	}
	changed := settings
	changed.Opacity = .6
	body.Settings = &changed
	if w := request(s, "POST", "/v1/overlay", s.config.Origin, token, "42", body); w.Code != 409 {
		t.Fatal("request content changed")
	}
	if w := request(s, "POST", "/v1/overlay", s.config.Origin, token, "42", overlayAction{Kind: "recover", ID: "recover"}); w.Code != 200 || !strings.Contains(w.Body.String(), `"interactive":true`) {
		t.Fatal("recovery failed", w.Code, w.Body.String())
	}
	if w := request(s, "DELETE", "/v1/pair", s.config.Origin, token, "42", nil); w.Code != 204 {
		t.Fatal(w.Code)
	}
	select {
	case <-first.done:
	case <-time.After(3 * time.Second):
		t.Fatal("unpair did not reap native host")
	}
	if s.overlay != nil {
		t.Fatal("host retained after unpair")
	}
}
