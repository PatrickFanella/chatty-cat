package devicesync

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"regexp"
	"strings"
	"unicode/utf8"
)

const MaxDocumentBytes = 2 << 20

var channelPattern = regexp.MustCompile(`^[a-z0-9_]{1,25}$`)
var recordID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,80}$`)

type Document struct {
	Format      string            `json:"format"`
	Version     int               `json:"version"`
	Workspaces  []Workspace       `json:"workspaces,omitempty"`
	Preferences map[string]any    `json:"preferences,omitempty"`
	Bookmarks   *[]PublicBookmark `json:"bookmarks,omitempty"`
}
type Workspace struct {
	ID       string            `json:"id"`
	Name     string            `json:"name"`
	Channels []string          `json:"channels"`
	Target   string            `json:"target"`
	Focus    string            `json:"focus"`
	Settings Settings          `json:"settings"`
	Readers  []json.RawMessage `json:"readers"`
}
type Settings struct {
	Version int            `json:"version"`
	Display map[string]any `json:"display"`
	Extras  map[string]any `json:"extras"`
}
type BookmarkMessage struct {
	ID        string `json:"id"`
	Command   string `json:"command"`
	Channel   string `json:"channel"`
	Login     string `json:"login"`
	Text      string `json:"text"`
	Timestamp int64  `json:"timestamp"`
	Parent    string `json:"parent"`
	Root      string `json:"root"`
	Target    string `json:"target"`
	Duration  string `json:"duration"`
	Deleted   bool   `json:"deleted"`
}
type PublicBookmark struct {
	ID      string            `json:"id"`
	Kind    string            `json:"kind"`
	Message BookmarkMessage   `json:"message"`
	Context []BookmarkMessage `json:"context"`
	Created int64             `json:"created"`
	Updated int64             `json:"updated"`
}

func decode(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return errors.New("one JSON value required")
	}
	return nil
}

// Bound structural allocation before decoding the typed document.
func boundedJSON(data []byte) error {
	d := json.NewDecoder(bytes.NewReader(data))
	d.UseNumber()
	type frame struct {
		kind  json.Delim
		count int
	}
	stack := []frame{}
	tokens := 0
	for {
		token, err := d.Token()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		tokens++
		if tokens > 50000 {
			return errors.New("sync structure exceeds token limit")
		}
		if delimiter, ok := token.(json.Delim); ok {
			if delimiter == '{' || delimiter == '[' {
				if len(stack) > 0 {
					stack[len(stack)-1].count++
				}
				stack = append(stack, frame{kind: delimiter})
				if len(stack) > 16 {
					return errors.New("sync structure exceeds depth limit")
				}
			} else {
				stack = stack[:len(stack)-1]
			}
		} else {
			if len(stack) > 0 {
				stack[len(stack)-1].count++
			}
			if value, ok := token.(string); ok && len(value) > 16000 {
				return errors.New("sync string exceeds limit")
			}
		}
		if len(stack) > 0 {
			top := stack[len(stack)-1]
			limit := 200
			if top.kind == '{' {
				limit = 256
			}
			if top.count > limit {
				return errors.New("sync collection exceeds limit")
			}
		}
	}
}

func ParseDocument(data []byte) (Document, error) {
	var d Document
	if len(data) > MaxDocumentBytes {
		return d, errors.New("sync document exceeds two MiB")
	}
	if err := boundedJSON(data); err != nil {
		return d, err
	}
	if err := decode(data, &d); err != nil {
		return d, err
	}
	_, err := CanonicalDocument(d)
	return d, err
}
func CanonicalDocument(d Document) ([]byte, error) {
	if d.Format != "chatty-cat-device-sync" || d.Version != 1 || len(d.Workspaces) > 20 || len(d.Workspaces) == 0 && d.Preferences == nil && d.Bookmarks == nil {
		return nil, errors.New("select supported sync records")
	}
	seen := map[string]bool{}
	for _, w := range d.Workspaces {
		if !recordID.MatchString(w.ID) || seen[w.ID] || !text(w.Name, 60) || strings.TrimSpace(w.Name) == "" || len(w.Channels) < 1 || len(w.Channels) > 24 || len(w.Readers) > 0 || w.Settings.Version != 1 || !displaySchema(w.Settings.Display) || !extrasSchema(w.Settings.Extras) {
			return nil, errors.New("invalid portable workspace")
		}
		seen[w.ID] = true
		channels := map[string]bool{}
		for _, name := range w.Channels {
			if !channelPattern.MatchString(name) || channels[name] {
				return nil, errors.New("invalid workspace channels")
			}
			channels[name] = true
		}
		if !channels[w.Target] {
			return nil, errors.New("invalid workspace target")
		}
		if !slicesHas([]string{"log", "message", "picker-open", "archive-open", "display-open", "video-open"}, w.Focus) {
			return nil, errors.New("invalid workspace focus")
		}
	}
	if d.Preferences != nil {
		if len(d.Preferences) != 5 || !preferencesSchema(d.Preferences) {
			return nil, errors.New("invalid portable preferences")
		}
	}
	if d.Bookmarks != nil {
		if len(*d.Bookmarks) > 200 {
			return nil, errors.New("bookmark limit")
		}
		ids := map[string]bool{}
		for _, b := range *d.Bookmarks {
			if !recordID.MatchString(b.ID) || ids[b.ID] || (b.Kind != "message" && b.Kind != "conversation") || !validBookmarkMessage(b.Message) || len(b.Context) > 5 || b.Created < 0 || b.Updated < b.Created || b.Updated > 8640000000000000 {
				return nil, errors.New("invalid public bookmark")
			}
			ids[b.ID] = true
			for _, m := range b.Context {
				if !validBookmarkMessage(m) || m.Channel != b.Message.Channel {
					return nil, errors.New("invalid public bookmark context")
				}
			}
		}
	}
	data, err := json.Marshal(d)
	if err != nil {
		return nil, err
	}
	if len(data) > MaxDocumentBytes {
		return nil, errors.New("sync document exceeds two MiB")
	}
	return data, nil
}
func slicesHas(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}
func text(s string, max int) bool {
	return utf8.ValidString(s) && utf8.RuneCountInString(s) <= max && len(s) <= 4*max && !strings.ContainsAny(s, "\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0c\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f\x7f")
}
func validBookmarkMessage(m BookmarkMessage) bool {
	return text(m.ID, 200) && text(m.Parent, 200) && text(m.Root, 200) && text(m.Target, 200) && channelPattern.MatchString(m.Channel) && (m.Login == "" || channelPattern.MatchString(strings.ToLower(m.Login))) && text(m.Text, 1000) && m.Timestamp >= 0 && m.Timestamp <= 8640000000000000 && len(m.Duration) <= 8 && slicesHas([]string{"PRIVMSG", "USERNOTICE", "NOTICE", "CLEARCHAT", "CLEARMSG"}, m.Command)
}

type validator func(any) bool

func scalar(v any) bool {
	switch value := v.(type) {
	case string:
		return text(value, 4000)
	case bool:
		return true
	case json.Number:
		n, err := value.Float64()
		return err == nil && !math.IsNaN(n) && !math.IsInf(n, 0) && math.Abs(n) <= 8640000000000000
	case float64:
		return !math.IsNaN(value) && !math.IsInf(value, 0) && math.Abs(value) <= 8640000000000000
	case int:
		return true
	default:
		return false
	}
}
func fields(keys string) map[string]validator {
	result := map[string]validator{}
	for _, key := range strings.Fields(keys) {
		result[key] = scalar
	}
	return result
}
func object(allowed map[string]validator) validator {
	return func(v any) bool {
		m, ok := v.(map[string]any)
		if !ok || len(m) > 128 {
			return false
		}
		for key, value := range m {
			check, ok := allowed[key]
			if !ok || !check(value) {
				return false
			}
		}
		return true
	}
}
func array(check validator, max int) validator {
	return func(v any) bool {
		values, ok := v.([]any)
		if !ok || len(values) > max {
			return false
		}
		for _, value := range values {
			if !check(value) {
				return false
			}
		}
		return true
	}
}
func nullable(check validator) validator { return func(v any) bool { return v == nil || check(v) } }

var displaySchema = object(fields(displayFields))
var presentationSchema = object(fields(presentationFields))
var pickerSchema = func() validator { f := fields(pickerFields); f["enabled"] = array(scalar, 4); return object(f) }()
var geometrySchema = object(map[string]validator{"pinned": scalar, "open": scalar, "box": object(fields("left top width height"))})
var paneSchema = object(map[string]validator{"id": scalar, "channels": array(scalar, 6), "target": scalar, "filter": scalar, "rules": array(scalar, 32), "reverse": scalar, "pauseHover": scalar, "weight": scalar, "unread": scalar, "reader": nullable(object(fields("key offset")))})
var tabSchema = object(map[string]validator{"id": scalar, "name": scalar, "active": scalar, "panes": array(paneSchema, 6)})
var closedSchema = func(v any) bool {
	m, ok := v.(map[string]any)
	if !ok {
		return false
	}
	switch m["kind"] {
	case "pane":
		return object(map[string]validator{"kind": scalar, "tab": scalar, "pane": paneSchema})(v)
	case "tab":
		return object(map[string]validator{"kind": scalar, "tab": tabSchema})(v)
	default:
		return false
	}
}
var splitSchema = object(map[string]validator{"version": scalar, "enabled": scalar, "active": scalar, "tabs": array(tabSchema, 8), "closed": array(closedSchema, 8)})
var ruleSchema = object(fields("id name enabled field pattern regex caseSensitive action color sound notify inbox scope"))
var similaritySchema = object(fields("enabled threshold windowSeconds maxComparisons sameAuthorExempt selfExempt behavior highlightSimilar"))
var rulesSchema = object(map[string]validator{"version": scalar, "rules": array(ruleSchema, 32), "similarity": similaritySchema, "preferences": func() validator { f := fields("quietStart quietEnd"); f["muted"] = scalar; return object(f) }()})
var commandSchema = object(fields("trigger name group body"))
var bindingsSchema = func(v any) bool {
	m, ok := v.(map[string]any)
	if !ok || len(m) > 128 {
		return false
	}
	for key, value := range m {
		if !slicesHas(strings.Fields(hotkeyActions), key) || !scalar(value) {
			return false
		}
	}
	return true
}
var extrasSchema = object(map[string]validator{
	"picker":    object(map[string]validator{"options": pickerSchema, "floating": geometrySchema}),
	"video":     object(map[string]validator{"options": object(fields("channel volume muted docked rememberVolume")), "floating": geometrySchema}),
	"resources": object(map[string]validator{"tab": scalar, "authors": object(fields("info sort")), "floating": geometrySchema}),
	"stats": func() validator {
		f := fields("open badgeOrder scope channel excluded")
		f["windows"] = object(fields("users emotes badges links"))
		return object(f)
	}(),
	"rail": object(fields("fraction floating")), "presentation": presentationSchema, "splits": splitSchema, "hotkeys": object(map[string]validator{"version": scalar, "bindings": bindingsSchema}), "rules": rulesSchema, "commands": array(commandSchema, 32),
})
var providerSchema = object(map[string]validator{"version": scalar, "animated": scalar, "scale": scalar, "badges": object(fields("globalAuthority channelAuthority subscription predictions vanity")), "cosmetics": object(fields("FFZ Chatterino")), "providers": object(map[string]validator{"7TV": object(fields("global channel live")), "BTTV": object(fields("global channel live")), "FFZ": object(fields("global channel live")), "Twitch": object(fields("global channel live"))})})
var linkSchema = object(fields("version enabled tooltip thumbnails doubleClick unshorten lowercaseDomains emoteTooltip thumbnailSize streamSize searchEnabled engineURL engineName"))
var preferencesSchema = object(map[string]validator{"display": displaySchema, "presentation": presentationSchema, "picker": pickerSchema, "provider": providerSchema, "links": linkSchema})
