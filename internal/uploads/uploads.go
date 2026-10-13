// Package uploads stores bounded, expiring public images with authenticated ownership.
package uploads

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"sort"
	"sync"
	"time"
)

// Config selects an exclusive durable directory and hard resource bounds.
type Config struct {
	Directory                                     string
	MaxBytes, MaxPixels, TotalBytes, AccountBytes int64
	Retention                                     time.Duration
}

// Item is the public upload receipt; owner and input digest remain server-only.
type Item struct {
	ID      string `json:"id"`
	URL     string `json:"url"`
	Type    string `json:"type"`
	Bytes   int64  `json:"bytes"`
	Expires int64  `json:"expires"`
}
type stored struct {
	Item
	Owner  string `json:"owner"`
	Digest string `json:"digest"`
}

// Store owns one directory. Run only one process against it.
type Store struct {
	cfg   Config
	root  *os.Root
	mu    sync.Mutex
	rows  map[string]stored
	now   func() time.Time
	slots chan struct{}
}

var idPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)
var pendingPattern = regexp.MustCompile(`^[a-f0-9]{32}\.pending$`)
var accountPattern = regexp.MustCompile(`^[1-9][0-9]{0,19}$`)

// New opens a dedicated storage directory. Empty Directory disables uploads.
func New(cfg Config) (result *Store, err error) {
	if cfg.MaxBytes == 0 {
		cfg.MaxBytes = 5 << 20
	}
	if cfg.MaxPixels == 0 {
		cfg.MaxPixels = 16_000_000
	}
	if cfg.TotalBytes == 0 {
		cfg.TotalBytes = 256 << 20
	}
	if cfg.AccountBytes == 0 {
		cfg.AccountBytes = 32 << 20
	}
	if cfg.Retention == 0 {
		cfg.Retention = 7 * 24 * time.Hour
	}
	if cfg.MaxBytes < 1 || cfg.MaxBytes > 10<<20 || cfg.MaxPixels < 1 || cfg.MaxPixels > 16_000_000 || cfg.AccountBytes < cfg.MaxBytes || cfg.TotalBytes < cfg.AccountBytes || cfg.TotalBytes > 10<<30 || cfg.Retention < time.Hour || cfg.Retention > 30*24*time.Hour {
		return nil, errors.New("invalid upload storage limits")
	}
	s := &Store{cfg: cfg, rows: make(map[string]stored), now: time.Now, slots: make(chan struct{}, 2)}
	if cfg.Directory == "" {
		return s, nil
	}
	if err := os.MkdirAll(cfg.Directory, 0700); err != nil {
		return nil, fmt.Errorf("prepare upload directory: %w", err)
	}
	root, err := os.OpenRoot(cfg.Directory)
	if err != nil {
		return nil, fmt.Errorf("open upload directory: %w", err)
	}
	s.root = root
	defer func() {
		if result == nil {
			err = errors.Join(err, root.Close())
		}
	}()
	dir, err := root.Open(".")
	if err != nil {
		return nil, err
	}
	entries, readErr := dir.ReadDir(2050)
	closeErr := dir.Close()
	if readErr != nil && !errors.Is(readErr, io.EOF) || closeErr != nil || len(entries) > 2048 {
		return nil, errors.New("upload directory exceeds inventory limit or cannot be read")
	}
	for _, entry := range entries {
		if pendingPattern.MatchString(entry.Name()) && entry.Type().IsRegular() {
			if err := root.Remove(entry.Name()); err != nil {
				return nil, err
			}
			continue
		}
		if !idPattern.MatchString(entry.Name()) || !entry.Type().IsRegular() {
			return nil, errors.New("upload directory contains unexpected files")
		}
		f, err := root.Open(entry.Name())
		if err != nil {
			return nil, err
		}
		var row stored

		if err = json.NewDecoder(io.LimitReader(f, 1024)).Decode(&row); err != nil {
			return nil, errors.Join(errors.New("invalid upload metadata"), f.Close())
		} // Metadata is a fixed 1024-byte header.
		_, digestErr := hex.DecodeString(row.Digest)
		info, statErr := f.Stat()
		closeErr := f.Close()
		if statErr != nil || closeErr != nil || row.ID != entry.Name() || row.URL != "/uploads/"+row.ID || !accountPattern.MatchString(row.Owner) || digestErr != nil || len(row.Digest) != 64 || row.Expires < 1 || row.Bytes < 1 || row.Bytes > 10<<20 || info.Size() != 1024+row.Bytes || (row.Type != "image/png" && row.Type != "image/jpeg") {
			return nil, errors.New("invalid stored image")
		}
		s.rows[row.ID] = row
	}
	if err = s.prune(); err != nil {
		return nil, err
	}
	return s, nil
}

// Close releases the directory handle.
func (s *Store) Close() error {
	if s.root != nil {
		return s.root.Close()
	}
	return nil
}
func (s *Store) prune() error {
	for id, row := range s.rows {
		if row.Expires <= s.now().UnixMilli() {
			if err := s.root.Remove(id); err != nil && !errors.Is(err, os.ErrNotExist) {
				return err
			}
			delete(s.rows, id)
		}
	}
	return nil
}

type boundedBuffer struct {
	bytes.Buffer
	limit int64
}

func (b *boundedBuffer) Write(p []byte) (int, error) {
	if int64(b.Len()+len(p)) > b.limit {
		return 0, errors.New("encoded image exceeds upload size limit")
	}
	return b.Buffer.Write(p)
}

// Put validates and re-encodes an image to strip metadata. Same-owner retries are idempotent.
func (s *Store) Put(ctx context.Context, owner, id, mime string, data []byte) (Item, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.root == nil {
		return Item{}, errors.New("uploads are not configured")
	}
	if !accountPattern.MatchString(owner) || !idPattern.MatchString(id) || int64(len(data)) > s.cfg.MaxBytes || len(data) == 0 {
		return Item{}, errors.New("invalid upload or size")
	}
	if err := ctx.Err(); err != nil {
		return Item{}, err
	}
	if err := s.prune(); err != nil {
		return Item{}, err
	}
	digest := sha256.Sum256(data)
	hash := hex.EncodeToString(digest[:])
	if row, ok := s.rows[id]; ok {
		if row.Owner == owner && row.Digest == hash && row.Type == mime {
			return row.Item, nil
		}
		return Item{}, errors.New("upload identity conflict")
	}
	if mime != "image/png" && mime != "image/jpeg" {
		return Item{}, errors.New("only PNG and JPEG images are supported")
	}
	config, kind, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || "image/"+kind != mime || config.Width < 1 || config.Height < 1 || int64(config.Width) > s.cfg.MaxPixels/int64(config.Height) {
		return Item{}, errors.New("invalid image or dimension limit exceeded")
	}
	picture, kind, err := image.Decode(bytes.NewReader(data))
	if err != nil || "image/"+kind != mime {
		return Item{}, errors.New("invalid image")
	}
	out := &boundedBuffer{limit: s.cfg.MaxBytes}
	if kind == "png" {
		err = png.Encode(out, picture)
	} else {
		err = jpeg.Encode(out, picture, &jpeg.Options{Quality: 90})
	}
	if err != nil {
		return Item{}, err
	}
	if err = ctx.Err(); err != nil {
		return Item{}, err
	}
	var total, account int64
	count := 0
	for _, r := range s.rows {
		total += r.Bytes
		if r.Owner == owner {
			account += r.Bytes
			count++
		}
	}
	size := int64(out.Len())
	if len(s.rows) >= 1024 || count >= 64 || total+size > s.cfg.TotalBytes || account+size > s.cfg.AccountBytes {
		return Item{}, errors.New("upload storage quota reached; delete an image or wait for expiry")
	}
	row := stored{Item: Item{ID: id, URL: "/uploads/" + id, Type: mime, Bytes: size, Expires: s.now().Add(s.cfg.Retention).UnixMilli()}, Owner: owner, Digest: hash}
	meta, err := json.Marshal(row)
	if err != nil || len(meta) >= 1024 {
		return Item{}, errors.New("upload metadata exceeds bound")
	}
	header := bytes.Repeat([]byte(" "), 1024)
	copy(header, meta)
	f, err := s.root.OpenFile(id+".pending", os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return Item{}, err
	}
	_, writeErr := f.Write(append(header, out.Bytes()...))
	syncErr := f.Sync()
	closeErr := f.Close()
	if writeErr != nil || syncErr != nil || closeErr != nil {
		removeErr := s.root.Remove(id + ".pending")
		return Item{}, errors.Join(writeErr, syncErr, closeErr, removeErr)
	}
	if err := s.root.Rename(id+".pending", id); err != nil {
		return Item{}, errors.Join(err, s.root.Remove(id+".pending"))
	}
	s.rows[id] = row
	return row.Item, nil
}

// List returns only the account's unexpired receipts.
func (s *Store) List(owner string) []Item {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := []Item{}
	for _, row := range s.rows {
		if row.Owner == owner && row.Expires > s.now().UnixMilli() {
			items = append(items, row.Item)
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Expires < items[j].Expires })
	return items
}

// Delete removes only an image belonging to the requesting account.
func (s *Store) Delete(owner, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	row, ok := s.rows[id]
	if !ok || row.Owner != owner {
		return errors.New("upload unavailable for this account")
	}
	if err := s.root.Remove(id); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	delete(s.rows, id)
	return nil
}

// Serve returns an unexpired raster image. It never lists owner information.
func (s *Store) Serve(w http.ResponseWriter, r *http.Request, id string) {
	s.mu.Lock()
	row, ok := s.rows[id]
	if !ok || row.Expires <= s.now().UnixMilli() {
		s.mu.Unlock()
		http.NotFound(w, r)
		return
	}
	f, err := s.root.Open(id)
	s.mu.Unlock()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer func() {
		if err := f.Close(); err != nil {
			slog.Debug("image read closed", "error", err)
		}
	}()
	if _, err = f.Seek(1024, io.SeekStart); err != nil {
		http.Error(w, "image unavailable", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", row.Type)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("Content-Disposition", "inline; filename=\"image"+map[string]string{"image/png": ".png", "image/jpeg": ".jpg"}[row.Type]+"\"")
	http.ServeContent(w, r, "image", time.Time{}, io.NewSectionReader(f, 1024, row.Bytes))
}

// Authorize returns an authenticated account, guarding origin, CSRF and selected identity.
type Authorize func(http.ResponseWriter, *http.Request, bool) (string, bool)

// Register installs public configuration/images and authenticated upload management.
func (s *Store) Register(mux *http.ServeMux, authorize Authorize) {
	write := func(w http.ResponseWriter, status int, value any) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(status)
		if err := json.NewEncoder(w).Encode(value); err != nil {
			return
		}
	}
	mux.HandleFunc("GET /api/uploads/config", func(w http.ResponseWriter, r *http.Request) {
		write(w, 200, map[string]any{"enabled": s.root != nil && authorize != nil, "maxBytes": s.cfg.MaxBytes, "maxPixels": s.cfg.MaxPixels, "retentionSeconds": int64(s.cfg.Retention / time.Second)})
	})
	guard := func(w http.ResponseWriter, r *http.Request, change bool) (string, bool) {
		if s.root == nil || authorize == nil {
			http.Error(w, "uploads are not configured", http.StatusServiceUnavailable)
			return "", false
		}
		return authorize(w, r, change)
	}
	mux.HandleFunc("GET /api/uploads", func(w http.ResponseWriter, r *http.Request) {
		owner, ok := guard(w, r, false)
		if ok {
			write(w, 200, map[string]any{"account": owner, "items": s.List(owner)})
		}
	})
	mux.HandleFunc("POST /api/uploads/{id}", func(w http.ResponseWriter, r *http.Request) {
		owner, ok := guard(w, r, true)
		if !ok {
			return
		}
		select {
		case s.slots <- struct{}{}:
			defer func() { <-s.slots }()
		default:
			w.Header().Set("Retry-After", "30")
			http.Error(w, "upload service busy; retry later", http.StatusTooManyRequests)
			return
		}
		controller := http.NewResponseController(w)
		if err := controller.SetReadDeadline(time.Now().Add(30 * time.Second)); err != nil && !errors.Is(err, http.ErrNotSupported) {
			http.Error(w, "upload unavailable", http.StatusServiceUnavailable)
			return
		}
		defer func() {
			if err := controller.SetReadDeadline(time.Time{}); err != nil && !errors.Is(err, http.ErrNotSupported) {
				slog.Debug("upload deadline reset unavailable", "error", err)
			}
		}()
		r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxBytes)
		data, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "image body exceeds limit or upload interrupted", http.StatusRequestEntityTooLarge)
			return
		}
		fresh, ok := guard(w, r, true)
		if !ok {
			return
		}
		if fresh != owner {
			http.Error(w, "account changed", http.StatusUnauthorized)
			return
		}
		item, err := s.Put(r.Context(), owner, r.PathValue("id"), r.Header.Get("Content-Type"), data)
		if err != nil {
			http.Error(w, "image upload rejected; check image limits, quota or storage availability", http.StatusBadRequest)
			return
		}
		write(w, 201, map[string]any{"account": owner, "item": item})
	})
	mux.HandleFunc("DELETE /api/uploads/{id}", func(w http.ResponseWriter, r *http.Request) {
		owner, ok := guard(w, r, true)
		if !ok {
			return
		}
		if err := s.Delete(owner, r.PathValue("id")); err != nil {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /uploads/{id}", func(w http.ResponseWriter, r *http.Request) { s.Serve(w, r, r.PathValue("id")) })
}
