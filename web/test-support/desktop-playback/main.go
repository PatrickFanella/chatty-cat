// Local-only integration fixture. Never included in the production server.
package main

import (
	"context"
	"fmt"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/companion"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	// The test child exits successfully only for this exact canonical request.
	if len(os.Args) == 4 && os.Args[1] == "--playback-fixture" {
		if os.Args[2] != "https://www.twitch.tv/one" || os.Args[3] != "audio_only" {
			os.Exit(3)
		}
		return
	}
	executable, err := os.Executable()
	if err != nil {
		log.Fatal(err)
	}
	service, err := companion.New(companion.Config{Origin: "http://127.0.0.1:5195", Tools: []companion.Tool{{ID: "fixture", Label: "Fixture child (no stream)", Executable: executable, Arguments: []string{"--playback-fixture", "{url}", "{quality}"}}, {ID: "missing", Label: "Missing player", Executable: "/missing/chatty-cat-player", Arguments: []string{"{url}"}}}})
	if err != nil {
		log.Fatal(err)
	}
	defer service.Close()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	server := &http.Server{Addr: companion.Address, Handler: service, ReadHeaderTimeout: 3 * time.Second}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = fmt.Fprintf(w, `<!doctype html><title>Desktop playback fixture</title><button id="commands-open">Commands</button><p>Fixture Alice, channel one. The configured child checks canonical arguments and exits; no real provider or player is launched.</p><script type="module">import {setProfileScope} from 'http://127.0.0.1:5174/src/account-profiles.ts';import {DesktopPlaybackPanel} from 'http://127.0.0.1:5174/src/desktop-companion-ui.ts';setProfileScope('42');window.fixtureAuth={enabled:true,authenticated:true,loginURL:'http://127.0.0.1:5195/api/auth/login',userID:'42',login:'alice',csrf:'fixture-only'};window.fixturePanel=new DesktopPlaybackPanel(()=>window.fixtureAuth,()=>['one'],()=> 'one');document.querySelector('input').value=%q;</script>`, service.PairCode())
	})
	fixture := &http.Server{Addr: "127.0.0.1:5195", Handler: mux, ReadHeaderTimeout: 3 * time.Second}
	go func() {
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			log.Print(err)
			stop()
		}
	}()
	go func() {
		if err := fixture.ListenAndServe(); err != http.ErrServerClosed {
			log.Print(err)
			stop()
		}
	}()
	fmt.Println("Desktop fixture at http://127.0.0.1:5195; requires Vite on 127.0.0.1:5174. No Twitch action.")
	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = fixture.Shutdown(shutdown)
	_ = server.Shutdown(shutdown)
}
