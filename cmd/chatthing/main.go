package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/PatrickFanella/hasanabi.neocities.org/rebuild/internal/auth"
	"github.com/PatrickFanella/hasanabi.neocities.org/rebuild/internal/config"
	"github.com/PatrickFanella/hasanabi.neocities.org/rebuild/internal/server"
)

func main() {
	if err := run(); err != nil {
		slog.Error("service stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	envFile := os.Getenv("CHATTHING_ENV_FILE")
	if envFile == "" {
		envFile = "../.env"
	}
	if err := config.LoadEnv(envFile); err != nil {
		return err
	}
	assets := os.Getenv("CHATTHING_ASSETS")
	if assets == "" {
		assets = "web/dist"
	}
	if _, err := os.Stat(assets + "/index.html"); err != nil {
		return errors.New("frontend build missing; run npm ci && npm run build in rebuild/web")
	}
	addr := os.Getenv("CHATTHING_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8080"
	}
	login, err := auth.New(auth.Config{ClientID: os.Getenv("TWITCH_CLIENT_ID"), ClientSecret: os.Getenv("TWITCH_CLIENT_SECRET"), PublicURL: os.Getenv("CHATTHING_PUBLIC_URL")})
	if err != nil {
		return err
	}
	app := server.New(server.Config{Assets: assets, Auth: login})
	defer app.Close()
	httpServer := &http.Server{Addr: addr, Handler: app.Handler(), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	done := make(chan error, 1)
	go func() { done <- httpServer.ListenAndServe() }()
	slog.Info("migration preview listening", "address", addr)
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		app.Close()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			return err
		}
		err := <-done
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}
