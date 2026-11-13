package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadEnv(t *testing.T) {
	for _, tc := range []struct {
		name, body, want string
		bad              bool
	}{
		{"plain", "CHATTY_CAT_TEST_LOCAL=abc # note\n", "abc", false},
		{"quoted", "export CHATTY_CAT_TEST_LOCAL='a$()#b'\n", "a$()#b", false},
		{"double", "CHATTY_CAT_TEST_LOCAL=\"a=b\"\n", "a=b", false},
		{"empty", "# note\nCHATTY_CAT_TEST_LOCAL=\n", "", false},
		{"bad", "secret-without-assignment\n", "", true},
		{"badkey", "bad-key=secret\n", "", true},
		{"badquote", "CHATTY_CAT_TEST_LOCAL='secret\n", "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			key := "CHATTY_CAT_TEST_LOCAL"
			old, exists := os.LookupEnv(key)
			if err := os.Unsetenv(key); err != nil {
				t.Fatal(err)
			}
			defer func() {
				if exists {
					if err := os.Setenv(key, old); err != nil {
						t.Fatal(err)
					}
				} else {
					if err := os.Unsetenv(key); err != nil {
						t.Fatal(err)
					}
				}
			}()
			path := filepath.Join(t.TempDir(), ".env")
			if err := os.WriteFile(path, []byte(tc.body), 0600); err != nil {
				t.Fatal(err)
			}
			err := LoadEnv(path)
			if (err != nil) != tc.bad {
				t.Fatalf("error = %v", err)
			}
			if err != nil && strings.Contains(err.Error(), "secret") {
				t.Fatal("error exposes value")
			}
			if !tc.bad && os.Getenv(key) != tc.want {
				t.Fatal("value mismatch")
			}
		})
	}
	t.Setenv("CHATTY_CAT_TEST_LOCAL", "existing")
	path := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(path, []byte("CHATTY_CAT_TEST_LOCAL=file\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := LoadEnv(path); err != nil {
		t.Fatal(err)
	}
	if os.Getenv("CHATTY_CAT_TEST_LOCAL") != "existing" {
		t.Fatal("overwrote environment")
	}
	if err := LoadEnv(filepath.Join(t.TempDir(), "missing")); err != nil {
		t.Fatal(err)
	}
}
