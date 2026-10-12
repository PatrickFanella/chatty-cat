package config

import "testing"

func TestInt(t *testing.T) {
	for _, tc := range []struct {
		raw  string
		want int
		bad  bool
	}{{"", 12, false}, {"24", 24, false}, {"0", 0, true}, {"25", 0, true}, {"private-value", 0, true}} {
		t.Run(tc.raw, func(t *testing.T) {
			t.Setenv("CHATTHING_TEST_CAPACITY", tc.raw)
			got, err := Int("CHATTHING_TEST_CAPACITY", 12, 1, 24)
			if (err != nil) != tc.bad || err == nil && got != tc.want {
				t.Fatalf("got %d, %v", got, err)
			}
		})
	}
}
