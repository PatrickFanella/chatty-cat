package metadata

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"time"
)

// Profile contains only public Twitch presentation fields, never credentials.
type Profile struct {
	ID        string `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	Bio       string `json:"bio"`
	Image     string `json:"image"`
	Color     string `json:"color"`
	Created   string `json:"created"`
	Followers *int64 `json:"followers"`
	Partner   bool   `json:"partner"`
	Affiliate bool   `json:"affiliate"`
}

// Profile retrieves bounded, coalesced public user data from the existing provider.
func (s *Service) Profile(ctx context.Context, login string) (Profile, error) {
	var result Profile
	if !channelPattern.MatchString(login) {
		return result, errors.New("invalid profile login")
	}
	data, err := s.get(ctx, s.endpoints.IVR+"/user?login="+login, 5*time.Minute)
	if len(data) == 0 {
		if err == nil {
			err = errors.New("profile unavailable")
		}
		return result, err
	}
	var users []struct {
		ID, Login, DisplayName, Bio, Logo, ChatColor, CreatedAt string
		Followers                                               *int64
		Roles                                                   struct{ IsPartner, IsAffiliate bool }
	}
	if json.Unmarshal(data, &users) != nil || len(users) != 1 || users[0].Login != login {
		return result, errors.New("invalid profile data")
	}
	user := users[0]
	clip := func(text string, max int) string { runes := []rune(text); return string(runes[:min(len(runes), max)]) }
	result = Profile{Login: login, Name: clip(user.DisplayName, 100), Bio: clip(user.Bio, 1000), Image: safeImage(user.Logo), Color: user.ChatColor, Partner: user.Roles.IsPartner, Affiliate: user.Roles.IsAffiliate}
	if regexp.MustCompile(`^[0-9]{1,32}$`).MatchString(user.ID) {
		result.ID = user.ID
	}
	if result.Name == "" {
		result.Name = login
	}
	if created, parseErr := time.Parse(time.RFC3339Nano, user.CreatedAt); parseErr == nil && created.Before(time.Now()) {
		result.Created = created.Format(time.RFC3339)
	}
	if user.Followers != nil && *user.Followers >= 0 {
		result.Followers = user.Followers
	}
	if !regexp.MustCompile(`^#[0-9a-fA-F]{6}$`).MatchString(result.Color) {
		result.Color = ""
	}
	if len(result.Image) > 2048 {
		result.Image = ""
	}
	return result, nil
}
