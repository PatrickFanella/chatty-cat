package metadata

import (
	"encoding/json"
	"errors"
	"strings"
)

// StreamElements seeds lifetime counts, never local last-use timestamps.
func parseUsage(data []byte) (map[string]int64, error) {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(data, &payload); err != nil || payload == nil {
		return nil, errors.New("invalid usage data")
	}
	result := make(map[string]int64)
	for _, key := range []string{"bttvEmotes", "ffzEmotes", "twitchEmotes", "sevenTVEmotes"} {
		if len(payload[key]) == 0 {
			continue
		}
		var entries []struct {
			Code   string `json:"emote"`
			Amount int64  `json:"amount"`
		}
		if err := json.Unmarshal(payload[key], &entries); err != nil {
			return nil, errors.New("invalid usage entries")
		}
		if len(entries) > 4096 {
			entries = entries[:4096]
		}
		for _, entry := range entries {
			if entry.Code == "" || len([]rune(entry.Code)) > 100 || strings.ContainsAny(entry.Code, "\x00\r\n\t ") || entry.Amount < 0 || entry.Amount > 9007199254740991-result[entry.Code] {
				continue
			}
			if len(result) >= 4096 {
				if _, ok := result[entry.Code]; !ok {
					continue
				}
			}
			result[entry.Code] += entry.Amount
		}
	}
	return result, nil
}
