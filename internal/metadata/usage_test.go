package metadata

import "testing"

func TestUsageSeeds(t *testing.T) {
	counts, err := parseUsage([]byte(`{"bttvEmotes":[{"emote":"wave","amount":10},{"emote":"bad code","amount":3},{"emote":"negative","amount":-1}],"twitchEmotes":[{"emote":"wave","amount":20},{"emote":"big","amount":9007199254740992}]}`))
	if err != nil || counts["wave"] != 30 || len(counts) != 1 {
		t.Fatalf("counts=%v error=%v", counts, err)
	}
	for _, bad := range []string{`null`, `[]`, `{"bttvEmotes":{}}`, `{"bttvEmotes":[{"amount":1.5}]}`} {
		if _, err := parseUsage([]byte(bad)); err == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
}
