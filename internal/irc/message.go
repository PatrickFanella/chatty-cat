// Package irc parses Twitch IRC without coupling chat data to a UI or transport.
package irc

import (
	"errors"
	"regexp"
	"strconv"
	"strings"
)

// Message preserves the complete command and tags for notices, replies and moderation.
type Message struct {
	ID        string            `json:"id"`
	Command   string            `json:"command"`
	Channel   string            `json:"channel"`
	Login     string            `json:"login"`
	Text      string            `json:"text"`
	Timestamp int64             `json:"timestamp"`
	Tags      map[string]string `json:"tags"`
}

var loginPattern = regexp.MustCompile(`^[a-z0-9_]{1,25}$`)

// Parse decodes a single IRC line, including commands without trailing text.
func Parse(raw string) (Message, error) {
	m := Message{Tags: make(map[string]string)}
	rest := strings.TrimSuffix(strings.TrimSuffix(raw, "\n"), "\r")
	if strings.ContainsAny(rest, "\r\n\x00") {
		return m, errors.New("invalid IRC line")
	}
	if strings.HasPrefix(rest, "@") {
		tags, tail, ok := strings.Cut(rest, " ")
		if !ok {
			return m, errors.New("tags without command")
		}
		for _, tag := range strings.Split(tags[1:], ";") {
			key, value, _ := strings.Cut(tag, "=")
			m.Tags[key] = unescape(value)
		}
		rest = strings.TrimLeft(tail, " ")
	}
	if strings.HasPrefix(rest, ":") {
		prefix, tail, ok := strings.Cut(rest, " ")
		if !ok {
			return m, errors.New("prefix without command")
		}
		if login, _, found := strings.Cut(prefix[1:], "!"); found {
			m.Login = login
		}
		rest = strings.TrimLeft(tail, " ")
	}
	params, text, _ := strings.Cut(rest, " :")
	fields := strings.Fields(params)
	if len(fields) == 0 {
		return m, errors.New("missing command")
	}
	m.Command = fields[0]
	m.Text = text
	if len(fields) > 1 {
		m.Channel = strings.TrimPrefix(fields[1], "#")
	}
	if m.Command == "CLEARCHAT" && m.Text == "" && len(fields) > 2 {
		m.Text = fields[2]
	}
	if m.Command == "USERNOTICE" && m.Login == "" && loginPattern.MatchString(m.Tags["login"]) {
		m.Login = m.Tags["login"]
	}
	m.ID = m.Tags["id"]
	if ts := m.Tags["tmi-sent-ts"]; ts != "" {
		var err error
		m.Timestamp, err = strconv.ParseInt(ts, 10, 64)
		if err != nil {
			return m, errors.New("invalid message timestamp")
		}
	}
	return m, nil
}

func unescape(value string) string {
	var result strings.Builder
	for i := 0; i < len(value); i++ {
		if value[i] != '\\' {
			result.WriteByte(value[i])
			continue
		}
		i++
		if i == len(value) {
			break
		}
		switch value[i] {
		case 's':
			result.WriteByte(' ')
		case ':':
			result.WriteByte(';')
		case 'r':
			result.WriteByte('\r')
		case 'n':
			result.WriteByte('\n')
		default:
			result.WriteByte(value[i])
		}
	}
	return result.String()
}
