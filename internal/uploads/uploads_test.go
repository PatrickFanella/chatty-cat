package uploads

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func picture(t *testing.T) []byte {
	t.Helper()
	var b bytes.Buffer
	m := image.NewRGBA(image.Rect(0, 0, 2, 2))
	m.Set(0, 0, color.RGBA{R: 255, A: 255})
	if err := png.Encode(&b, m); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func TestUploadStorageLifecycleAndIsolation(t *testing.T) {
	dir := t.TempDir()
	s, err := New(Config{Directory: dir, MaxBytes: 1024, MaxPixels: 100, TotalBytes: 4096, AccountBytes: 2048, Retention: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	cleanupStore(t, s)
	id := strings.Repeat("a", 32)
	item, err := s.Put(context.Background(), "42", id, "image/png", picture(t))
	if err != nil {
		t.Fatal(err)
	}
	if item.URL != "/uploads/"+id || item.Bytes == 0 || item.Expires <= time.Now().UnixMilli() {
		t.Fatal(item)
	}
	if _, err = s.Put(context.Background(), "43", id, "image/png", picture(t)); err == nil {
		t.Fatal("cross-account retry accepted")
	}
	if err = s.Delete("43", id); err == nil {
		t.Fatal("cross-account deletion accepted")
	}
	reopened, err := New(Config{Directory: dir, MaxBytes: 1024, MaxPixels: 100, TotalBytes: 4096, AccountBytes: 2048, Retention: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	cleanupStore(t, reopened)
	if len(reopened.List("42")) != 1 || len(reopened.List("43")) != 0 {
		t.Fatal("ownership lost on restart")
	}
	rr := httptest.NewRecorder()
	reopened.Serve(rr, httptest.NewRequest("GET", "/uploads/"+id, nil), id)
	if rr.Code != 200 || rr.Header().Get("Content-Type") != "image/png" || rr.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(rr.Code, rr.Header())
	}
	if err = reopened.Delete("42", id); err != nil {
		t.Fatal(err)
	}
	rr = httptest.NewRecorder()
	reopened.Serve(rr, httptest.NewRequest("GET", "/uploads/"+id, nil), id)
	if rr.Code != 404 {
		t.Fatal("deleted image remains public")
	}
}
func TestUploadRejectsUnsafeAndOversizedInput(t *testing.T) {
	s, err := New(Config{Directory: t.TempDir(), MaxBytes: 1024, MaxPixels: 1, TotalBytes: 4096, AccountBytes: 2048, Retention: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	cleanupStore(t, s)
	for _, tc := range []struct {
		name, account, id, mime string
		body                    []byte
	}{
		{"svg", "42", strings.Repeat("a", 32), "image/svg+xml", []byte("<svg/>")},
		{"lie", "42", strings.Repeat("a", 32), "image/jpeg", picture(t)},
		{"size", "42", strings.Repeat("a", 32), "image/png", make([]byte, 1025)},
		{"pixels", "42", strings.Repeat("a", 32), "image/png", picture(t)},
		{"path", "42", "../escape", "image/png", picture(t)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err = s.Put(context.Background(), tc.account, tc.id, tc.mime, tc.body); err == nil {
				t.Fatal("unsafe upload accepted")
			}
		})
	}
	if len(s.List("42")) != 0 {
		t.Fatal("rejected upload left record")
	}
}
func TestUploadQuotaExpiryAndIdempotency(t *testing.T) {
	now := time.Now()
	s, err := New(Config{Directory: t.TempDir(), MaxBytes: 1024, MaxPixels: 100, TotalBytes: 1024, AccountBytes: 1024, Retention: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	cleanupStore(t, s)
	s.now = func() time.Time { return now }
	body := picture(t)
	id := strings.Repeat("a", 32)
	first, err := s.Put(context.Background(), "42", id, "image/png", body)
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.Put(context.Background(), "42", id, "image/png", body)
	if err != nil || again != first || len(s.List("42")) != 1 {
		t.Fatal("retry duplicated upload", err)
	}
	if _, err = s.Put(context.Background(), "42", id, "image/png", append(body, 1)); err == nil {
		t.Fatal("changed retry accepted")
	}
	s.cfg.AccountBytes = first.Bytes
	if _, err = s.Put(context.Background(), "42", strings.Repeat("b", 32), "image/png", body); err == nil {
		t.Fatal("quota ignored")
	}
	now = now.Add(2 * time.Hour)
	rr := httptest.NewRecorder()
	s.Serve(rr, httptest.NewRequest("GET", "/uploads/"+id, nil), id)
	if rr.Code != 404 || len(s.List("42")) != 0 {
		t.Fatal("expired upload visible")
	}
}
func TestUploadRoutesBoundBodyAndAccount(t *testing.T) {
	s, err := New(Config{Directory: t.TempDir(), MaxBytes: 1024, MaxPixels: 100, TotalBytes: 4096, AccountBytes: 2048, Retention: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	cleanupStore(t, s)
	mux := http.NewServeMux()
	s.Register(mux, func(w http.ResponseWriter, r *http.Request, write bool) (string, bool) {
		if r.Header.Get("X-Account-ID") != "42" {
			http.Error(w, "account", http.StatusUnauthorized)
			return "", false
		}
		return "42", true
	})
	req := httptest.NewRequest("POST", "/api/uploads/"+strings.Repeat("a", 32), strings.NewReader(strings.Repeat("x", 1025)))
	req.Header.Set("Content-Type", "image/png")
	req.Header.Set("X-Account-ID", "42")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != 413 {
		t.Fatal(rr.Code)
	}
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, httptest.NewRequest("GET", "/api/uploads", nil))
	if rr.Code != 401 {
		t.Fatal(rr.Code)
	}
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, httptest.NewRequest("GET", "/api/uploads/config", nil))
	data, err := io.ReadAll(rr.Result().Body)
	if err != nil || !bytes.Contains(data, []byte(`"enabled":true`)) {
		t.Fatal(string(data), err)
	}
}

func cleanupStore(t *testing.T, s *Store) {
	t.Helper()
	t.Cleanup(func() {
		if err := s.Close(); err != nil {
			t.Error(err)
		}
	})
}

func TestUploadCrashRecoveryAndDisabledStore(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, strings.Repeat("c", 32)+".pending"), []byte("partial image"), 0600); err != nil {
		t.Fatal(err)
	}
	s, err := New(Config{Directory: dir})
	if err != nil {
		t.Fatal(err)
	}
	cleanupStore(t, s)
	files, err := os.ReadDir(dir)
	if err != nil || len(files) != 0 {
		t.Fatal("interrupted upload not recovered", err)
	}
	disabled, err := New(Config{})
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	disabled.Register(mux, nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, httptest.NewRequest("GET", "/api/uploads/config", nil))
	if !strings.Contains(rr.Body.String(), `"enabled":false`) {
		t.Fatal("disabled destination became available")
	}
}
