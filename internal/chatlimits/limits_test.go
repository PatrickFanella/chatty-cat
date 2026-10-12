package chatlimits

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestParse(t *testing.T) {
	for _, tc := range []struct {
		raw         string
		limit, want int
		bad         bool
	}{
		{"a,b,c,d,e,f,g", 12, 7, false}, {"a,b,c,d,e,f,g", 6, 0, true}, {"ONE,one,two", 12, 2, false}, {"a,,b", 12, 0, true}, {"a\r\nJOIN #b", 12, 0, true},
	} {
		t.Run(tc.raw, func(t *testing.T) {
			got, err := Parse(tc.raw, tc.limit)
			if (err != nil) != tc.bad || err == nil && len(got) != tc.want {
				t.Fatalf("got %v, %v", got, err)
			}
		})
	}
}
func TestAdmissionAndRelease(t *testing.T) {
	b := New(12, 2)
	a, err := b.Acquire("one", 7)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = b.Acquire("two", 6); !errors.Is(err, ErrCapacity) {
		t.Fatalf("capacity: %v", err)
	}
	a.Release()
	a.Release()
	next, err := b.Acquire("two", 12)
	if err != nil {
		t.Fatal(err)
	}
	next.Release()
	if b.Active() != 0 {
		t.Fatal("subscriptions were not reclaimed")
	}
}
func TestRollingBudgetsAndCancellation(t *testing.T) {
	b := New(96, 4)
	lease, err := b.Acquire("user", 1)
	if err != nil {
		t.Fatal(err)
	}
	defer lease.Release()
	now := time.Now()
	for i := 0; i < 20; i++ {
		if delay := b.take("user", Join, now); delay != 0 {
			t.Fatal(delay)
		}
	}
	if delay := b.take("user", Join, now.Add(time.Second)); delay != 9*time.Second {
		t.Fatal(delay)
	}
	if delay := b.take("user", Authenticate, now); delay != 0 {
		t.Fatal("authentication should have its own budget")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err = b.Wait(ctx, "user", Join, nil); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if delay := b.take("user", Join, now.Add(10*time.Second)); delay != 0 {
		t.Fatal(delay)
	}
}
func TestIdentityBounds(t *testing.T) {
	b := New(96, 1)
	a, err := b.Acquire("one", 1)
	if err != nil {
		t.Fatal(err)
	}
	a.Release()
	if _, err = b.Acquire("two", 1); !errors.Is(err, ErrCapacity) {
		t.Fatal(err)
	}
	b.mu.Lock()
	b.accounts["one"].last = time.Now().Add(-time.Minute)
	b.mu.Unlock()
	next, err := b.Acquire("two", 1)
	if err != nil {
		t.Fatal(err)
	}
	next.Release()
}
