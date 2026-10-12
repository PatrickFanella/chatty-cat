package server

import (
	"net/url"
	"testing"
)

func TestReadOptions(t *testing.T) {
	for _, test := range []struct {
		query      string
		membership bool
		limit      int
		invalid    bool
	}{
		{"", false, 200, false}, {"membership=1&historyLimit=800", true, 800, false}, {"history=0", false, 0, false},
		{"membership=true", false, 0, true}, {"historyLimit=801", false, 0, true}, {"historyLimit=-1", false, 0, true}, {"history=1&history=0", false, 0, true},
	} {
		t.Run(test.query, func(t *testing.T) {
			query, _ := url.ParseQuery(test.query)
			got, err := parseReadOptions(query)
			if (err != nil) != test.invalid {
				t.Fatalf("error: %v", err)
			}
			if !test.invalid && (got.membership != test.membership || got.historyLimit != test.limit) {
				t.Fatalf("options: %+v", got)
			}
		})
	}
}
