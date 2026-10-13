// This read-only acceptance probe prints catalog status, never user assignments.
package main

import (
	"context"
	"encoding/json"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/cosmetics"
	"os"
	"time"
)

func main() {
	s, err := cosmetics.New(cosmetics.Config{Providers: "FFZ,Chatterino"})
	if err != nil {
		panic(err)
	}
	defer s.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	result, err := s.Load(ctx, []string{"42"})
	status := struct {
		Providers []string `json:"providers"`
		Errors    []string `json:"errors"`
		OK        bool     `json:"ok"`
	}{result.Providers, result.Errors, err == nil && len(result.Errors) == 0}
	if err := json.NewEncoder(os.Stdout).Encode(status); err != nil {
		panic(err)
	}
	if !status.OK {
		os.Exit(1)
	}
}
