package companion

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func testService(t *testing.T) *Service {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	s, err := New(Config{Origin: "https://chat.subcult.tv", Tools: []Tool{{ID: "player", Label: "Test player", Executable: executable, Arguments: []string{"--url", "{url}", "--quality", "{quality}"}}}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	return s
}
func request(s *Service, method, path, origin, token, account string, body any) *httptest.ResponseRecorder {
	data, _ := json.Marshal(body)
	r := httptest.NewRequest(method, "http://127.0.0.1:47831"+path, bytes.NewReader(data))
	r.Host = "127.0.0.1:47831"
	r.Header.Set("Origin", origin)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer "+token)
	r.Header.Set("X-Companion-Account", account)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}
func pair(t *testing.T, s *Service) string {
	t.Helper()
	w := request(s, "POST", "/v1/pair", s.config.Origin, "", "42", map[string]string{"code": s.PairCode(), "account": "42"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var result struct {
		Token string `json:"token"`
	}
	if json.Unmarshal(w.Body.Bytes(), &result) != nil || len(result.Token) != 64 {
		t.Fatal("missing token")
	}
	return result.Token
}
func TestPairBoundariesAndRevocation(t *testing.T) {
	s := testService(t)
	if w := request(s, "POST", "/v1/pair", "https://evil.example", "", "42", map[string]string{"code": s.PairCode(), "account": "42"}); w.Code != 403 {
		t.Fatal("foreign origin", w.Code)
	}
	token := pair(t, s)
	if w := request(s, "GET", "/v1/status", s.config.Origin, token, "43", nil); w.Code != 401 {
		t.Fatal("account crossed", w.Code)
	}
	if w := request(s, "GET", "/v1/status", s.config.Origin, token, "42", nil); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w := request(s, "POST", "/v1/pair", s.config.Origin, "", "42", map[string]string{"code": s.PairCode(), "account": "42"}); w.Code != 403 {
		t.Fatal("reused pairing code", w.Code)
	}
	if w := request(s, "DELETE", "/v1/pair", s.config.Origin, token, "42", nil); w.Code != 204 {
		t.Fatal(w.Code)
	}
	if w := request(s, "GET", "/v1/status", s.config.Origin, token, "42", nil); w.Code != 401 {
		t.Fatal("unpair failed")
	}
}
func TestLaunchOnlyExpandsBoundedValues(t *testing.T) {
	s := testService(t)
	for _, tc := range []struct{ channel, quality string }{{"../../secret", "best"}, {"one;rm", "best"}, {"one", "--player=evil"}, {"one", "best;echo x"}, {"https://evil.example", "best"}} {
		if _, _, err := s.Plan("player", tc.channel, tc.quality); err == nil {
			t.Fatal("unsafe launch accepted", tc)
		}
	}
	path, args, err := s.Plan("player", "patrick__eff", "audio_only")
	if err != nil || path != s.config.Tools[0].Executable || args[1] != "https://www.twitch.tv/patrick__eff" || args[3] != "audio_only" {
		t.Fatal(path, args, err)
	}
	if _, _, err = s.Plan("unknown", "one", "best"); err == nil {
		t.Fatal("unconfigured executable")
	}
	token := pair(t, s)
	calls := 0
	s.start = func(_ string, _ []string, done func(int)) { calls++; done(0) }
	body := map[string]string{"tool": "player", "channel": "one", "quality": "best", "requestID": "request-1"}
	for range 2 {
		if w := request(s, "POST", "/v1/launch", s.config.Origin, token, "42", body); w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if calls != 1 {
		t.Fatal("duplicate launch", calls)
	}
	body["channel"] = "two"
	if w := request(s, "POST", "/v1/launch", s.config.Origin, token, "42", body); w.Code != 409 {
		t.Fatal("request ID reused with different plan", w.Code)
	}
}
func TestConfigAndRequestBounds(t *testing.T) {
	for _, config := range []Config{{Origin: "https://chat.subcult.tv/path"}, {Origin: "http://evil.example"}, {Origin: "https://chat.subcult.tv", Tools: []Tool{{ID: "x", Label: "X", Executable: "sh", Arguments: []string{"{url}"}}}}, {Origin: "https://chat.subcult.tv", Tools: []Tool{{ID: "x", Label: "X", Executable: filepath.Join(t.TempDir(), "player"), Arguments: []string{"{unknown}"}}}}} {
		if _, err := New(config); err == nil {
			t.Fatal("invalid configuration")
		}
	}
	s := testService(t)
	token := pair(t, s)
	if w := request(s, "GET", "/v1/status", "null", token, "42", nil); w.Code != 403 {
		t.Fatal("opaque origin")
	}
	s.expires = time.Now().Add(-time.Second)
	if w := request(s, http.MethodGet, "/v1/status", s.config.Origin, token, "42", nil); w.Code != 401 {
		t.Fatal("expired token")
	}
}

func TestPlaybackChild(t *testing.T) {
	for i, a := range os.Args {
		if a == "--" {
			if len(os.Args) != i+3 || os.Args[i+1] != "https://www.twitch.tv/one" || os.Args[i+2] != "audio_only" {
				os.Exit(3)
			}
			os.Exit(0)
		}
	}
}
func TestActualExecutableLifecycleAndConsumedPairCode(t *testing.T) {
	s := testService(t)
	s.config.Tools[0].Arguments = []string{"-test.run=^TestPlaybackChild$", "--", "{url}", "{quality}"}
	token := pair(t, s)
	w := request(s, "POST", "/v1/launch", s.config.Origin, token, "42", map[string]string{"tool": "player", "channel": "one", "quality": "audio_only", "requestID": "actual-child"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		s.mu.Lock()
		j := *s.jobs[0]
		s.mu.Unlock()
		if j.State == "exited" {
			if j.ExitCode == nil || *j.ExitCode != 0 {
				t.Fatal("child failed", j.ExitCode)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("child not reaped")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if w = request(s, "DELETE", "/v1/pair", s.config.Origin, token, "42", nil); w.Code != 204 {
		t.Fatal(w.Code)
	}
	if w = request(s, "POST", "/v1/pair", s.config.Origin, "", "42", map[string]string{"code": s.PairCode(), "account": "42"}); w.Code != 403 {
		t.Fatal("pair code reusable after unpair")
	}
}
