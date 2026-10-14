package providerservices

import (
	"reflect"
	"testing"
)

func TestOptionalServicesRequireExplicitClosedProviderList(t *testing.T) {
	for _, value := range []string{"unknown", "7TV,7TV", "BTTV,", "", "7TV,BTTV"} {
		got, err := Parse(value)
		if value == "" {
			if err != nil || len(got) != 0 {
				t.Fatal("services not disabled by default")
			}
		} else if value == "7TV,BTTV" {
			if err != nil || !reflect.DeepEqual(got, []Provider{SevenTV, BTTV}) || !Allows(got, "BTTV") || Allows(got, "https://other.example") {
				t.Fatal("invalid capability boundary")
			}
		} else if err == nil {
			t.Fatal("invalid service configuration accepted", value)
		}
	}
}
