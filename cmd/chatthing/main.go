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

	"git.subcult.tv/subculture-collective/chatty-cat/internal/auth"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/chatlimits"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/config"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/cosmetics"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/devicesync"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/ircrelay"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/providerservices"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/server"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/uploads"
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
	capacity, err := config.Int("CHATTHING_WORKSPACE_CHANNELS", chatlimits.DefaultWorkspaceChannels, 1, chatlimits.MaxWorkspaceChannels)
	if err != nil {
		return err
	}
	subscriptions, err := config.Int("CHATTHING_CHAT_SUBSCRIPTIONS", chatlimits.MaxSubscriptions, 1, chatlimits.MaxSubscriptions)
	if err != nil {
		return err
	}
	capacity = min(capacity, subscriptions)
	optionalProviders, err := providerservices.Parse(os.Getenv("CHATTHING_PROVIDER_SERVICES"))
	if err != nil {
		return err
	}
	login, err := auth.New(auth.Config{WorkspaceChannels: capacity, ChatSubscriptions: subscriptions, ClientID: os.Getenv("TWITCH_CLIENT_ID"), ClientSecret: os.Getenv("TWITCH_CLIENT_SECRET"), PublicURL: os.Getenv("CHATTHING_PUBLIC_URL")})
	if err != nil {
		return err
	}
	imageStore, err := uploads.New(uploads.Config{Directory: os.Getenv("CHATTHING_UPLOAD_DIR")})
	if err != nil {
		login.Close()
		return err
	}
	defer func() {
		if err := imageStore.Close(); err != nil {
			slog.Error("upload storage close failed", "error", err)
		}
	}()
	cosmeticService, err := cosmetics.New(cosmetics.Config{Providers: os.Getenv("CHATTHING_COSMETIC_PROVIDERS")})
	if err != nil {
		return err
	}
	defer cosmeticService.Close()
	syncStore, err := devicesync.New(devicesync.Config{Directory: os.Getenv("CHATTHING_SYNC_DIR")})
	if err != nil {
		return err
	}
	defer func() {
		if err := syncStore.Close(); err != nil {
			slog.Error("sync storage close failed", "error", err)
		}
	}()
	ircNetworks, err := ircrelay.Load(os.Getenv("CHATTHING_IRC_CONFIG"))
	if err != nil {
		return err
	}
	ircRelay, err := ircrelay.New(ircNetworks)
	if err != nil {
		return err
	}
	app := server.New(server.Config{IRCRelay: ircRelay, ProviderServices: optionalProviders, Sync: syncStore, Cosmetics: cosmeticService, Uploads: imageStore, WorkspaceChannels: capacity, Subscriptions: subscriptions, Assets: assets, Auth: login, GiphyAPIKey: os.Getenv("GIPHY_API_KEY")})
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
