// Package devicesync stores explicitly selected private per-account public-data
// snapshots. It is not a credential store or public chat archive.
package devicesync

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

var ErrConflict = errors.New("sync revision changed; fetch and review before retrying")
var ErrDisabled = errors.New("device sync is not configured")
var accountPattern = regexp.MustCompile(`^[1-9][0-9]{0,31}$`)
var revisionPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)
var requestPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,80}$`)

const totalLimit = 64 << 20
const accountLimit = 1024

type Config struct{ Directory string }
type Snapshot struct {
	Revision string    `json:"revision"`
	Updated  int64     `json:"updated"`
	Document *Document `json:"document"`
}
type stored struct {
	Snapshot
	Account string `json:"account"`
	Request string `json:"request"`
	Parent  string `json:"parent"`
	Digest  string `json:"digest"`
}
type Store struct {
	root   *os.Root
	lock   *os.File
	mu     sync.Mutex
	rows   map[string]stored
	sizes  map[string]int
	total  int
	closed bool
}

func New(cfg Config) (result *Store, err error) {
	s := &Store{rows: map[string]stored{}, sizes: map[string]int{}}
	if cfg.Directory == "" {
		return s, nil
	}
	if err := os.MkdirAll(cfg.Directory, 0700); err != nil {
		return nil, err
	}
	info, err := os.Stat(cfg.Directory)
	if err != nil || info.Mode().Perm()&0077 != 0 {
		return nil, errors.New("sync requires a dedicated private 0700 directory")
	}
	s.root, err = os.OpenRoot(cfg.Directory)
	if err != nil {
		return nil, err
	}
	defer func() {
		if result == nil {
			err = errors.Join(err, s.Close())
		}
	}()
	s.lock, err = s.root.OpenFile(".lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err = lock(s.lock); err != nil {
		return nil, errors.New("sync directory already in use or locking unavailable")
	}
	dir, err := s.root.Open(".")
	if err != nil {
		return nil, err
	}
	entries, readErr := dir.ReadDir(accountLimit + 3)
	closeErr := dir.Close()
	if readErr != nil && !errors.Is(readErr, io.EOF) || closeErr != nil || len(entries) > accountLimit+2 {
		return nil, errors.New("sync inventory exceeds limit")
	}
	for _, entry := range entries {
		if entry.Name() == ".lock" {
			if !entry.Type().IsRegular() {
				return nil, errors.New("invalid sync lock entry")
			}
			continue
		}
		name := entry.Name()
		if strings.HasSuffix(name, ".pending") && accountPattern.MatchString(strings.TrimSuffix(name, ".pending")) && entry.Type().IsRegular() {
			if err := s.root.Remove(name); err != nil {
				return nil, err
			}
			continue
		}
		account := strings.TrimSuffix(name, ".json")
		if name != account+".json" || !accountPattern.MatchString(account) || !entry.Type().IsRegular() {
			return nil, errors.New("unexpected sync directory entry")
		}
		file, err := s.root.Open(name)
		if err != nil {
			return nil, err
		}
		data, readErr := io.ReadAll(io.LimitReader(file, MaxDocumentBytes+4097))
		closeErr := file.Close()
		if readErr != nil || closeErr != nil || len(data) > MaxDocumentBytes+4096 {
			return nil, errors.New("invalid sync file size")
		}
		var row stored
		if decode(data, &row) != nil || row.Account != account || !revisionPattern.MatchString(row.Revision) || !requestPattern.MatchString(row.Request) || row.Updated < 1 || row.Parent != "0" && !revisionPattern.MatchString(row.Parent) || len(row.Digest) != 64 {
			return nil, errors.New("invalid sync record")
		}
		if row.Document != nil {
			if _, err := CanonicalDocument(*row.Document); err != nil {
				return nil, err
			}
		}
		raw := []byte("null")
		if row.Document != nil {
			raw, err = CanonicalDocument(*row.Document)
			if err != nil {
				return nil, err
			}
		}
		sum := sha256.Sum256(raw)
		if hex.EncodeToString(sum[:]) != row.Digest {
			return nil, errors.New("sync digest mismatch")
		}
		s.rows[account] = row
		s.sizes[account] = len(data)
		s.total += len(data)
		if s.total > totalLimit || len(s.rows) > accountLimit {
			return nil, errors.New("sync storage exceeds capacity")
		}
	}
	return s, nil
}
func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true
	var err error
	if s.lock != nil {
		err = errors.Join(err, s.lock.Close())
	}
	if s.root != nil {
		err = errors.Join(err, s.root.Close())
	}
	return err
}
func (s *Store) Enabled() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.root != nil && !s.closed }
func clone(value Snapshot) Snapshot {
	if value.Document != nil {
		data, err := json.Marshal(value.Document)
		if err == nil {
			var doc Document
			if decode(data, &doc) == nil {
				value.Document = &doc
			}
		}
	}
	return value
}
func (s *Store) Read(account string) Snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	row, ok := s.rows[account]
	if !ok {
		return Snapshot{Revision: "0"}
	}
	return clone(row.Snapshot)
}
func (s *Store) Save(account, expected, request string, doc Document) (Snapshot, error) {
	data, err := CanonicalDocument(doc)
	if err != nil {
		return Snapshot{}, err
	}
	parsed, err := ParseDocument(data)
	if err != nil {
		return Snapshot{}, err
	}
	return s.write(account, expected, request, &parsed, data)
}
func (s *Store) Delete(account, expected, request string) (Snapshot, error) {
	return s.write(account, expected, request, nil, []byte("null"))
}
func (s *Store) write(account, expected, request string, document *Document, data []byte) (Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.root == nil || s.closed {
		return Snapshot{}, ErrDisabled
	}
	if !accountPattern.MatchString(account) || !requestPattern.MatchString(request) || (expected != "0" && !revisionPattern.MatchString(expected)) {
		return Snapshot{}, errors.New("invalid sync identity or revision")
	}
	current, exists := s.rows[account]
	if !exists {
		current.Revision = "0"
	}
	sum := sha256.Sum256(data)
	digest := hex.EncodeToString(sum[:])
	if exists && current.Request == request {
		if current.Parent == expected && current.Digest == digest {
			return clone(current.Snapshot), nil
		}
		return Snapshot{}, ErrConflict
	}
	if current.Revision != expected {
		return Snapshot{}, ErrConflict
	}
	if !exists && len(s.rows) >= accountLimit {
		return Snapshot{}, errors.New("sync account capacity reached")
	}
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return Snapshot{}, err
	}
	row := stored{Snapshot: Snapshot{Revision: hex.EncodeToString(random), Updated: time.Now().UnixMilli(), Document: document}, Account: account, Request: request, Parent: expected, Digest: digest}
	encoded, err := json.Marshal(row)
	if err != nil {
		return Snapshot{}, err
	}
	if s.total-s.sizes[account]+len(encoded) > totalLimit {
		return Snapshot{}, errors.New("sync storage capacity reached")
	}
	name := account + ".pending"
	file, err := s.root.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return Snapshot{}, err
	}
	written, writeErr := file.Write(encoded)
	syncErr := file.Sync()
	closeErr := file.Close()
	if writeErr != nil || syncErr != nil || closeErr != nil || written != len(encoded) {
		removeErr := s.root.Remove(name)
		return Snapshot{}, errors.Join(writeErr, syncErr, closeErr, removeErr, errors.New("sync write incomplete"))
	}
	if err := s.root.Rename(name, account+".json"); err != nil {
		return Snapshot{}, errors.Join(err, s.root.Remove(name))
	}
	s.total += len(encoded) - s.sizes[account]
	s.sizes[account] = len(encoded)
	s.rows[account] = row
	dir, err := s.root.Open(".")
	if err != nil {
		return Snapshot{}, fmt.Errorf("sync outcome uncertain; fetch current revision: %w", err)
	}
	syncErr = dir.Sync()
	closeErr = dir.Close()
	if syncErr != nil || closeErr != nil {
		return Snapshot{}, errors.Join(errors.New("sync outcome uncertain; fetch current revision"), syncErr, closeErr)
	}
	return clone(row.Snapshot), nil
}
