// Package chatlimits bounds channel sets, active subscriptions and Twitch IRC attempts.
package chatlimits

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"
)

// PaneChannels remains the initial merged-feed limit.
const PaneChannels = 6

// DefaultWorkspaceChannels is separate from the pane limit.
const DefaultWorkspaceChannels = 12

// MaxWorkspaceChannels bounds one view's transcript sources.
const MaxWorkspaceChannels = 24

// MaxSubscriptions leaves headroom below Twitch's normal 100-room account limit.
const MaxSubscriptions = 96
const window = 10 * time.Second
const attempts = 20

var channelName = regexp.MustCompile(`^[a-z0-9_]{1,25}$`)

// ErrCapacity indicates a temporary subscription or identity admission refusal.
var ErrCapacity = errors.New("chat subscription capacity reached; close another chat view and retry")

// Capacity normalizes a deployment's channel limit to the supported bounded range.
func Capacity(value int) int {
	if value == 0 {
		return DefaultWorkspaceChannels
	}
	return max(1, min(value, MaxWorkspaceChannels))
}

// Parse validates and deduplicates names without interpreting IRC commands.
func Parse(raw string, limit int) ([]string, error) {
	parts := strings.Split(strings.ToLower(raw), ",")
	if len(parts) > limit || len(parts) > MaxWorkspaceChannels {
		return nil, fmt.Errorf("choose at most %d workspace channels", limit)
	}
	result := make([]string, 0, len(parts))
	seen := map[string]bool{}
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if !channelName.MatchString(part) {
			return nil, errors.New("invalid channel name")
		}
		if !seen[part] {
			seen[part] = true
			result = append(result, part)
		}
	}
	return result, nil
}

// Attempt identifies the separate IRC join and authentication windows.
type Attempt uint8

const (
	// Join reserves one IRC JOIN attempt.
	Join Attempt = iota
	// Authenticate reserves one IRC login attempt.
	Authenticate
)

type account struct {
	active      int
	last        time.Time
	joins, auth []time.Time
}

// Budget retains bounded per-account windows and a global active-subscription count.
// No background worker is needed; waiting belongs to an admitted cancellable session.
type Budget struct {
	mu                           sync.Mutex
	total, maxTotal, maxAccounts int
	accounts                     map[string]*account
}

// New creates an admission budget with normal-account IRC rate limits.
func New(total, identities int) *Budget {
	return &Budget{maxTotal: max(1, min(total, MaxSubscriptions)), maxAccounts: max(1, min(identities, 1024)), accounts: map[string]*account{}}
}

// Lease releases subscriptions exactly once, including failed handshakes and cancelled joins.
type Lease struct {
	once   sync.Once
	budget *Budget
	key    string
	count  int
}

// Acquire admits an entire deduplicated source set or leaves the budget unchanged.
func (b *Budget) Acquire(key string, count int) (*Lease, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := time.Now()
	for id, a := range b.accounts {
		if a.active == 0 && now.Sub(a.last) >= window {
			delete(b.accounts, id)
		}
	}
	a := b.accounts[key]
	if key == "" || len(key) > 100 || count < 1 || count > MaxWorkspaceChannels || b.total+count > b.maxTotal || a != nil && a.active+count > MaxSubscriptions || a == nil && len(b.accounts) >= b.maxAccounts {
		return nil, ErrCapacity
	}
	if a == nil {
		a = &account{}
		b.accounts[key] = a
	}
	a.active += count
	a.last = now
	b.total += count
	return &Lease{budget: b, key: key, count: count}, nil
}

// Release returns all reserved sources while retaining their recent rate window.
func (l *Lease) Release() {
	l.once.Do(func() {
		b := l.budget
		b.mu.Lock()
		defer b.mu.Unlock()
		b.total -= l.count
		a := b.accounts[l.key]
		a.active -= l.count
		a.last = time.Now()
	})
}

// Active reports the global number of admitted subscriptions.
func (b *Budget) Active() int { b.mu.Lock(); defer b.mu.Unlock(); return b.total }

// Available checks a public admission hint without reserving or creating identities.
func (b *Budget) Available(count int) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return count > 0 && b.total+count <= b.maxTotal
}
func (b *Budget) take(key string, kind Attempt, now time.Time) time.Duration {
	b.mu.Lock()
	defer b.mu.Unlock()
	a := b.accounts[key]
	if a == nil {
		return window
	}
	a.last = now
	times := &a.joins
	if kind == Authenticate {
		times = &a.auth
	}
	recent := (*times)[:0]
	for _, stamp := range *times {
		if now.Sub(stamp) < window {
			recent = append(recent, stamp)
		}
	}
	*times = recent
	if len(recent) >= attempts {
		return max(time.Millisecond, window-now.Sub(recent[0]))
	}
	*times = append(recent, now)
	return 0
}

// Wait reserves an attempt just before sending it. Cancellation interrupts queued joins.
func (b *Budget) Wait(ctx context.Context, key string, kind Attempt, blocked func(time.Duration) error) error {
	announced := false
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		delay := b.take(key, kind, time.Now())
		if delay == 0 {
			return nil
		}
		if !announced && blocked != nil {
			if err := blocked(delay); err != nil {
				return err
			}
			announced = true
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}
