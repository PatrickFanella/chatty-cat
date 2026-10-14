// Package providerservices defines the explicitly allowed optional browser services.
package providerservices

import (
	"errors"
	"strings"
)

type Provider string

const (
	BTTV    Provider = "BTTV"
	SevenTV Provider = "7TV"
)

func Parse(raw string) ([]Provider, error) {
	providers := []Provider{}
	if raw == "" {
		return providers, nil
	}
	seen := map[Provider]bool{}
	for _, part := range strings.Split(raw, ",") {
		p := Provider(strings.TrimSpace(part))
		if p != BTTV && p != SevenTV || seen[p] {
			return nil, errors.New("invalid optional provider services; use unique BTTV and/or 7TV")
		}
		seen[p] = true
		providers = append(providers, p)
	}
	return providers, nil
}
func Allows(configured []Provider, name string) bool {
	for _, p := range configured {
		if (p == BTTV || p == SevenTV) && string(p) == name {
			return true
		}
	}
	return false
}
