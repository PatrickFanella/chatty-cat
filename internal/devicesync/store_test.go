package devicesync

import (
	"errors"
	"path/filepath"
	"sync"
	"testing"
)

func doc() Document {
	return Document{Format: "chatty-cat-device-sync", Version: 1, Workspaces: []Workspace{{ID: "one", Name: "One", Channels: []string{"room"}, Target: "room", Focus: "log", Settings: Settings{Version: 1, Display: map[string]any{}, Extras: map[string]any{}}}}}
}
func TestCASRetryDeleteAndDurableIsolation(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "sync")
	s, err := New(Config{Directory: dir})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := New(Config{Directory: dir}); err == nil {
		t.Fatal("two writers opened one sync directory")
	}
	one, err := s.Save("42", "0", "request-one", doc())
	if err != nil {
		t.Fatal(err)
	}
	same, err := s.Save("42", "0", "request-one", doc())
	if err != nil || same.Revision != one.Revision {
		t.Fatal("retry not idempotent")
	}
	if _, err = s.Save("43", "0", "request-other", doc()); err != nil {
		t.Fatal(err)
	}
	deleted, err := s.Delete("42", one.Revision, "request-delete")
	if err != nil || deleted.Document != nil {
		t.Fatal("delete did not clear document")
	}
	if _, err = s.Save("42", "0", "request-stale", doc()); !errors.Is(err, ErrConflict) {
		t.Fatal("offline write resurrected deleted snapshot")
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = New(Config{Directory: dir})
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := s.Close(); err != nil {
			t.Error(err)
		}
	}()
	got := s.Read("42")
	if got.Revision != deleted.Revision || got.Document != nil || s.Read("43").Document == nil {
		t.Fatal("restart/isolation lost")
	}
}
func TestConcurrentWritesHaveOneWinner(t *testing.T) {
	s, err := New(Config{Directory: filepath.Join(t.TempDir(), "sync")})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = s.Close() }()
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, id := range []string{"request-a", "request-b"} {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := s.Save("42", "0", id, doc()); results <- err }()
	}
	wg.Wait()
	close(results)
	ok, conflicts := 0, 0
	for err := range results {
		if err == nil {
			ok++
		} else if errors.Is(err, ErrConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if ok != 1 || conflicts != 1 {
		t.Fatal(ok, conflicts)
	}
}
func TestSchemaRejectsPrivateAndUnsafeRecords(t *testing.T) {
	for _, raw := range []string{`{"format":"chatty-cat-device-sync","version":1,"whispers":[]}`, `{"format":"chatty-cat-device-sync","version":1,"bookmarks":[{"id":"a","note":"private"}]}`, `{"format":"chatty-cat-device-sync","version":1,"preferences":{"access_token":"secret"}}`} {
		if _, err := ParseDocument([]byte(raw)); err == nil {
			t.Fatal("private/unknown fields accepted")
		}
	}
	d := doc()
	d.Workspaces[0].Settings.Display["oauthToken"] = "secret"
	if _, err := CanonicalDocument(d); err == nil {
		t.Fatal("nested secret field accepted")
	}
}

func TestQuotaRejectionPreservesLastGoodSnapshot(t *testing.T) {
	s, err := New(Config{Directory: filepath.Join(t.TempDir(), "sync")})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = s.Close() }()
	first, err := s.Save("42", "0", "request-first", doc())
	if err != nil {
		t.Fatal(err)
	}
	s.total = totalLimit
	changed := doc()
	changed.Workspaces[0].Name = "A longer workspace name"
	if _, err = s.Save("42", first.Revision, "request-new", changed); err == nil {
		t.Fatal("full store accepted an expanding snapshot")
	}
	if s.Read("42").Revision != first.Revision || s.Read("42").Document.Workspaces[0].Name != "One" {
		t.Fatal("quota failure replaced good data")
	}
}
