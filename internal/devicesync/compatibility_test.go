package devicesync

import (
	"os"
	"testing"
)

func TestActualBrowserPublicSnapshot(t *testing.T) {
	data, err := os.ReadFile("../../web/test-support/device-sync/public-snapshot.json")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = ParseDocument(data); err != nil {
		var doc Document
		if decode(data, &doc) == nil {
			for _, w := range doc.Workspaces {
				for key, value := range w.Settings.Extras {
					if !extrasSchema(map[string]any{key: value}) {
						t.Errorf("unsupported portable workspace extra: %s", key)
					}
				}
			}
			if doc.Preferences != nil {
				for key, value := range doc.Preferences {
					if !preferencesSchema(map[string]any{key: value}) {
						t.Errorf("unsupported portable preference: %s", key)
					}
				}
			}
		}
		t.Fatal(err)
	}
}
