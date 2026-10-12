package server

import (
	"fmt"
	"net/url"
	"strconv"
)

type readOptions struct {
	membership   bool
	historyLimit int
}

func parseReadOptions(query url.Values) (readOptions, error) {
	options := readOptions{historyLimit: 200}
	for _, key := range []string{"membership", "history"} {
		if values, ok := query[key]; ok && (len(values) != 1 || values[0] != "0" && values[0] != "1") {
			return options, fmt.Errorf("invalid %s read option", key)
		}
	}
	options.membership = query.Get("membership") == "1"
	if values, ok := query["historyLimit"]; ok {
		if len(values) != 1 {
			return options, fmt.Errorf("invalid history limit")
		}
		limit, err := strconv.Atoi(values[0])
		if err != nil || limit < 1 || limit > 800 {
			return options, fmt.Errorf("history limit must be 1–800")
		}
		options.historyLimit = limit
	}
	if query.Get("history") == "0" {
		options.historyLimit = 0
	}
	return options, nil
}
