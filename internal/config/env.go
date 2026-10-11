// Package config loads the optional local environment file without executing it.
package config

import (
	"bufio"
	"errors"
	"os"
	"regexp"
	"strings"
)

var keyPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// LoadEnv loads plain or quoted KEY=value entries. Existing environment wins.
// No interpolation, shell execution or multiline values are supported.
func LoadEnv(path string) (result error) {
	f, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return errors.New("cannot read environment file")
	}
	defer func() {
		if err := f.Close(); err != nil && result == nil {
			result = errors.New("cannot close environment file")
		}
	}()
	values := make(map[string]string)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, ok := strings.Cut(line, "=")
		key, value = strings.TrimSpace(key), strings.TrimSpace(value)
		if !ok || !keyPattern.MatchString(key) {
			return errors.New("invalid environment file entry")
		}
		if strings.HasPrefix(value, `"`) || strings.HasPrefix(value, "'") {
			if len(value) < 2 || value[len(value)-1] != value[0] {
				return errors.New("invalid quoted environment value")
			}
			value = value[1 : len(value)-1]
		} else if i := strings.Index(value, " #"); i >= 0 {
			value = strings.TrimSpace(value[:i])
		}
		values[key] = value
	}
	if scanner.Err() != nil {
		return errors.New("cannot parse environment file")
	}
	for key, value := range values {
		if _, exists := os.LookupEnv(key); !exists {
			if err := os.Setenv(key, value); err != nil {
				return errors.New("cannot set environment value")
			}
		}
	}
	return nil
}
