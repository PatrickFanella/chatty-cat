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
		{"plain", "CHATTHING_TEST_LOCAL=abc # note\n", "abc", false},
		{"quoted", "export CHATTHING_TEST_LOCAL='a$()#b'\n", "a$()#b", false},
		{"double", "CHATTHING_TEST_LOCAL=\"a=b\"\n", "a=b", false},
		{"empty", "# note\nCHATTHING_TEST_LOCAL=\n", "", false},
		{"bad", "secret-without-assignment\n", "", true},
		{"badkey", "bad-key=secret\n", "", true},
		{"badquote", "CHATTHING_TEST_LOCAL='secret\n", "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			key := "CHATTHING_TEST_LOCAL"
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
	t.Setenv("CHATTHING_TEST_LOCAL", "existing")
	path := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(path, []byte("CHATTHING_TEST_LOCAL=file\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := LoadEnv(path); err != nil {
		t.Fatal(err)
	}
	if os.Getenv("CHATTHING_TEST_LOCAL") != "existing" {
		t.Fatal("overwrote environment")
	}
	if err := LoadEnv(filepath.Join(t.TempDir(), "missing")); err != nil {
		t.Fatal(err)
	}
}
