// chatty-companion is manually installed and run on the viewer's desktop.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/companion"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
func run() error {
	configPath := flag.String("config", "", "owner-reviewed local JSON configuration (required)")
	flag.Parse()
	if *configPath == "" {
		return fmt.Errorf("use -config with a local executable allowlist")
	}
	f, err := os.Open(*configPath)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if info.Size() > 64*1024 {
		return fmt.Errorf("configuration exceeds 64 KiB")
	}
	decoder := json.NewDecoder(io.LimitReader(f, 64*1024))
	decoder.DisallowUnknownFields()
	var config companion.Config
	if err = decoder.Decode(&config); err != nil {
		return err
	}
	if decoder.Decode(new(any)) != io.EOF {
		return fmt.Errorf("invalid trailing configuration")
	}
	service, err := companion.New(config)
	if err != nil {
		return err
	}
	defer service.Close()
	listener, err := net.Listen("tcp4", companion.Address)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	server := &http.Server{Handler: service, ReadHeaderTimeout: 3 * time.Second, ReadTimeout: 5 * time.Second, WriteTimeout: 5 * time.Second, IdleTimeout: 15 * time.Second, MaxHeaderBytes: 8192}
	fmt.Printf("Chatty Cat companion on %s for %s\nPairing code (one use, expires in five minutes): %s\nCtrl+C revokes pairing and stops managed playback.\n", companion.Address, config.Origin, service.PairCode())
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	err = server.Serve(listener)
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}
