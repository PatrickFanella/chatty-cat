// Real private sync/auth handlers with synthetic loopback OAuth for device QA.
package main

import (
	"encoding/json"
	"fmt"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/auth"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/devicesync"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
)

func main() {
	encode := func(w http.ResponseWriter, value any) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(value)
	}
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			_ = r.ParseForm()
			id := r.Form.Get("code")
			if id != "42" && id != "43" {
				http.Error(w, "fixture account", http.StatusBadRequest)
				return
			}
			encode(w, map[string]any{"access_token": "fixture:" + id, "refresh_token": "fixture-refresh", "expires_in": 3600, "token_type": "bearer"})
		case "/validate":
			id := strings.TrimPrefix(r.Header.Get("Authorization"), "OAuth fixture:")
			login := "alice"
			if id == "43" {
				login = "bob"
			}
			encode(w, map[string]any{"client_id": "fixture", "user_id": id, "login": login, "scopes": []string{"user:write:chat"}, "expires_in": 3600})
		default:
			encode(w, map[string]any{"data": []any{}})
		}
	}))
	defer provider.Close()
	service, err := auth.New(auth.Config{ClientID: "fixture", ClientSecret: "fixture", PublicURL: "http://127.0.0.1:5196", AuthorizeURL: "http://127.0.0.1:5196/fixture/consent", TokenURL: provider.URL + "/token", ValidateURL: provider.URL + "/validate", HelixURL: provider.URL + "/helix"})
	if err != nil {
		panic(err)
	}
	defer service.Close()
	directory, err := os.MkdirTemp("", "chatty-device-sync-qa-")
	if err != nil {
		panic(err)
	}
	if err := os.Chmod(directory, 0700); err != nil {
		panic(err)
	}
	store, err := devicesync.New(devicesync.Config{Directory: directory})
	if err != nil {
		panic(err)
	}
	defer func() { _ = store.Close() }()
	mux := http.NewServeMux()
	service.Register(mux)
	store.Register(mux, service.StorageAccount)
	var mu sync.Mutex
	putAttempts, changes := 0, 0
	dropReply := false
	mux.HandleFunc("GET /fixture/consent", func(w http.ResponseWriter, r *http.Request) {
		state := r.URL.Query().Get("state")
		w.Header().Set("Content-Type", "text/html")
		_, _ = fmt.Fprintf(w, `<h1>Local synthetic sign-in</h1><a href="/api/auth/callback?state=%s&code=42">Sign in fixture Alice</a><p><a href="/api/auth/callback?state=%s&code=43">Sign in fixture Bob</a>`, state, state)
	})
	mux.HandleFunc("GET /fixture/counts", func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		encode(w, map[string]any{"putAttempts": putAttempts, "revisionChanges": changes, "dropNextReceipt": dropReply})
	})
	mux.HandleFunc("POST /fixture/drop-next-receipt", func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		dropReply = true
		mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /api/public-config", func(w http.ResponseWriter, _ *http.Request) {
		encode(w, map[string]int{"paneChannels": 6, "workspaceChannels": 24, "subscriptions": 96})
	})
	mux.HandleFunc("GET /api/channels/{channel}", func(w http.ResponseWriter, r *http.Request) {
		encode(w, map[string]any{"channel": r.PathValue("channel"), "emotes": map[string]any{}, "badges": map[string]any{}, "stream": map[string]string{"uptime": "offline", "viewers": "0", "title": "Device sync fixture"}, "errors": []string{}})
	})
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.FileServer(http.Dir("web/dist")).ServeHTTP(w, r)
			return
		}
		data, err := os.ReadFile("web/dist/index.html")
		if err != nil {
			http.Error(w, "build first", http.StatusInternalServerError)
			return
		}
		mock := `<script>window.WebSocket=class{static OPEN=1;readyState=1;constructor(){setTimeout(()=>this.onmessage?.({data:JSON.stringify({type:'status',state:'connected',detail:'synthetic public fixture'})}),100);}close(){this.readyState=3;}};</script>`
		controls := `<div id="fixture-tools"><button data-fixture-seed="A">Fixture: seed device A</button><button data-fixture-seed="B">Fixture: seed device B</button><button id="fixture-state-button">Fixture: show public/private counts</button><button id="fixture-drop">Fixture: drop next publish receipt</button><pre id="fixture-state"></pre></div><script>
const prefix='chatthing:v1:profile:42:';for(const button of document.querySelectorAll('[data-fixture-seed]'))button.onclick=()=>{const raw=localStorage.getItem(prefix+'workspaces');if(!raw){document.getElementById('fixture-state').textContent='Sign in as fixture Alice first';return;}const file=JSON.parse(raw),kind=button.dataset.fixtureSeed;file.workspaces[0].name='Device '+kind;file.workspaces[0].settings.display.size=kind==='A'?18:12;localStorage.setItem(prefix+'workspaces',JSON.stringify(file));const entry={id:'bookmark-'+kind,kind:'message',message:{id:'message-'+kind,command:'PRIVMSG',channel:'one',login:'fixture',text:'public excerpt '+kind,timestamp:1,parent:'',root:'',target:'',duration:'',deleted:false},context:[],note:'private-note-'+kind,tags:['private'],created:1,updated:2};localStorage.setItem('chatthing:v1:bookmarks:42',JSON.stringify({format:'chatty-cat-bookmarks',version:1,bookmarks:[entry]}));localStorage.setItem(prefix+'fixture-private-alias','private-alias-'+kind);location.reload();};
document.getElementById('fixture-state-button').onclick=async()=>{const counts=await fetch('/fixture/counts').then(r=>r.json()),raw=localStorage.getItem(prefix+'workspaces'),file=raw?JSON.parse(raw):null,marks=JSON.parse(localStorage.getItem('chatthing:v1:bookmarks:42')||'{"bookmarks":[]}').bookmarks,backup=JSON.parse(localStorage.getItem(prefix+'sync-annotation-backup')||'{"bookmarks":[]}').bookmarks;document.getElementById('fixture-state').textContent=JSON.stringify({counts,workspaces:file?.workspaces.map(w=>({id:w.id,name:w.name,size:w.settings.display.size})),bookmarks:marks.map(m=>({id:m.id,notePresent:!!m.note,tags:m.tags.length})),privateBackupRows:backup.length,privateBackupHasB:backup.some(m=>m.note==='private-note-B'),aliasRetained:!!localStorage.getItem(prefix+'fixture-private-alias')});};document.getElementById('fixture-drop').onclick=()=>fetch('/fixture/drop-next-receipt',{method:'POST'});const move=()=>{const panel=document.querySelector('dialog[aria-label="Device sync"]'),tools=document.getElementById('fixture-tools');if(panel&&tools&&tools.parentElement!==panel)panel.append(tools);};new MutationObserver(move).observe(document.body,{childList:true,subtree:true});move();</script>`
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(strings.Replace(strings.Replace(string(data), "<head>", "<head>"+mock, 1), "</body>", controls+"</body>", 1)))
	})
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/sync" || r.Method != http.MethodPut {
			mux.ServeHTTP(w, r)
			return
		}
		mu.Lock()
		putAttempts++
		drop := dropReply
		dropReply = false
		mu.Unlock()
		account := r.Header.Get("X-Account-ID")
		before := store.Read(account).Revision
		if drop {
			record := httptest.NewRecorder()
			mux.ServeHTTP(record, r)
			after := store.Read(account).Revision
			mu.Lock()
			if after != before {
				changes++
			}
			mu.Unlock()
			if record.Code == http.StatusOK {
				http.Error(w, "fixture lost receipt", http.StatusServiceUnavailable)
			} else {
				for k, values := range record.Header() {
					w.Header()[k] = values
				}
				w.WriteHeader(record.Code)
				_, _ = w.Write(record.Body.Bytes())
			}
			return
		}
		mux.ServeHTTP(w, r)
		after := store.Read(account).Revision
		mu.Lock()
		if after != before {
			changes++
		}
		mu.Unlock()
	})
	fmt.Println("Device sync fixture: http://127.0.0.1:5196/?channel=one&video=off; retained private QA directory:", directory)
	if err := http.ListenAndServe("127.0.0.1:5196", handler); err != nil {
		panic(err)
	}
}
