package irc

import "testing"

func TestParse(t *testing.T) {
	tests := []struct {
		name, line, command, channel, login, text string
		bad                                       bool
	}{
		{"message", "@id=abc;tmi-sent-ts=123 :alice!alice@alice.tmi.twitch.tv PRIVMSG #hasanabi :hi : there", "PRIVMSG", "hasanabi", "alice", "hi : there", false},
		{"reply", "@reply-parent-msg-body=hello\\sworld :a!a@a PRIVMSG #room :yes", "PRIVMSG", "room", "a", "yes", false},
		{"notice", ":tmi.twitch.tv NOTICE #room :slow mode", "NOTICE", "room", "", "slow mode", false},
		{"room", "@slow=10 :tmi.twitch.tv ROOMSTATE #room", "ROOMSTATE", "room", "", "", false},
		{"ban", ":tmi.twitch.tv CLEARCHAT #room :alice", "CLEARCHAT", "room", "", "alice", false},
		{"bare ban", ":tmi.twitch.tv CLEARCHAT #room alice", "CLEARCHAT", "room", "", "alice", false},
		{"clear", ":tmi.twitch.tv CLEARCHAT #room", "CLEARCHAT", "room", "", "", false},
		{"sub", "@msg-id=sub :tmi.twitch.tv USERNOTICE #room", "USERNOTICE", "room", "", "", false},
		{"delete", "@target-msg-id=abc :tmi.twitch.tv CLEARMSG #room :removed", "CLEARMSG", "room", "", "removed", false},
		{"whisper", ":alice!alice@alice WHISPER bob :hello", "WHISPER", "bob", "alice", "hello", false},
		{"ping", "PING :tmi.twitch.tv", "PING", "", "", "tmi.twitch.tv", false},
		{"crlf", ":a!a@a PRIVMSG #room :hi\r\n", "PRIVMSG", "room", "a", "hi", false},
		{"empty", "", "", "", "", "", true},
		{"tags only", "@id=abc", "", "", "", "", true},
		{"prefix only", ":alice", "", "", "", "", true},
		{"bad timestamp", "@tmi-sent-ts=no :a!a@a PRIVMSG #room :hi", "", "", "", "", true},
		{"injection", "PRIVMSG #room :hi\r\nJOIN #other", "", "", "", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Parse(tt.line)
			if tt.bad {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got.Command != tt.command || got.Channel != tt.channel || got.Login != tt.login || got.Text != tt.text {
				t.Fatalf("unexpected parse: %#v", got)
			}
		})
	}
}

func TestTagEscapes(t *testing.T) {
	for _, tt := range []struct{ in, out string }{
		{`a\sb\:c\\d\re\nf`, "a b;c\\d\re\nf"},
		{`unknown\q`, "unknownq"}, {"trailing\\", "trailing"},
	} {
		if got := unescape(tt.in); got != tt.out {
			t.Errorf("%q: got %q want %q", tt.in, got, tt.out)
		}
	}
	m, err := Parse("@id=abc;tmi-sent-ts=123;display-name=Alice\\sA :a!a@a PRIVMSG #room :hi")
	if err != nil {
		t.Fatal(err)
	}
	if m.ID != "abc" || m.Timestamp != 123 || m.Tags["display-name"] != "Alice A" {
		t.Fatalf("tags: %#v", m)
	}
}

func FuzzParse(f *testing.F) {
	f.Add("@id=abc :a!a@a PRIVMSG #room :hello")
	f.Add("PING :tmi.twitch.tv")
	f.Fuzz(func(t *testing.T, raw string) {
		_, err := Parse(raw)
		if err != nil {
			return
		}
	})
}
