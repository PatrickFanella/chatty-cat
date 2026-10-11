package metadata

import (
	"encoding/json"
	"errors"
	"slices"
	"strings"
)

func addTwitch(target map[string]Emote, data []byte) error {
	var payload struct {
		Data []struct {
			ID      string   `json:"id"`
			Name    string   `json:"name"`
			Formats []string `json:"format"`
		}
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return errors.New("invalid native catalog")
	}
	if len(payload.Data) > 10000 {
		return errors.New("native catalog too large")
	}
	for _, entry := range payload.Data {
		if !idPattern.MatchString(entry.ID) || entry.Name == "" || len([]rune(entry.Name)) > 100 || strings.ContainsAny(entry.Name, "\x00\r\n") {
			continue
		}
		base := "https://static-cdn.jtvnw.net/emoticons/v2/" + entry.ID
		animated := slices.Contains(entry.Formats, "animated")
		format := "static"
		if animated {
			format = "animated"
		}
		target[entry.Name] = Emote{Code: entry.Name, Source: "Twitch", URL: base + "/" + format + "/dark/2.0", StaticURL: base + "/static/dark/2.0", Animated: animated}
	}
	return nil
}
