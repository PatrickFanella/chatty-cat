package metadata

import "testing"

func TestPublicNativeEmotes(t *testing.T) {
	target := map[string]Emote{"Kappa": {Code: "Kappa", Source: "BTTV", ZeroWidth: true}}
	err := addTwitch(target, []byte(`{"data":[{"id":"25","name":"Kappa","format":["static"]},{"id":"emotesv2_abc","name":"Wave","format":["static","animated"]},{"id":"../evil","name":"bad"}]}`))
	if err != nil || target["Kappa"].Source != "Twitch" || target["Kappa"].ZeroWidth || !target["Wave"].Animated || target["Wave"].StaticURL == "" || len(target) != 2 {
		t.Fatalf("%+v %v", target, err)
	}
	if err := addTwitch(target, []byte(`not JSON`)); err == nil {
		t.Fatal("accepted invalid JSON")
	}
}
