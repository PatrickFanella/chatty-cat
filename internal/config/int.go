package config

import (
	"fmt"
	"os"
	"strconv"
)

// Int reads a bounded deployment setting without echoing its raw value.
func Int(name string, fallback, low, high int) (int, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < low || value > high {
		return 0, fmt.Errorf("%s must be an integer from %d to %d", name, low, high)
	}
	return value, nil
}
