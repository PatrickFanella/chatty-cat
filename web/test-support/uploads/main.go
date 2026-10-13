// Local QA only. Synthetic account and IRC; no Twitch traffic or credentials.
package main

import (
	"encoding/json"
	"git.subcult.tv/subculture-collective/chatty-cat/internal/uploads"
	"log"
	"net/http"
	"os"
	"strings"
)

func main() {
	dir := os.Getenv("UPLOAD_FIXTURE_DIR")
	if dir == "" {
		var err error
		dir, err = os.MkdirTemp("", "chatty-upload-fixture-")
		if err != nil {
			log.Fatal(err)
		}
	}
	store, err := uploads.New(uploads.Config{Directory: dir})
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		if err := store.Close(); err != nil {
			log.Print(err)
		}
	}()
	mux := http.NewServeMux()
	store.Register(mux, func(w http.ResponseWriter, r *http.Request, write bool) (string, bool) {
		if r.Header.Get("X-Account-ID") != "42" || write && r.Header.Get("X-CSRF-Token") != "fixture" {
			http.Error(w, "fixture account", http.StatusForbidden)
			return "", false
		}
		return "42", true
	})
	mux.HandleFunc("GET /api/auth/session", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{"enabled": true, "authenticated": true, "userID": "42", "login": "fixture", "csrf": "fixture", "loginURL": "http://127.0.0.1:5190/api/auth/login"}); err != nil {
			log.Print(err)
		}
	})
	mux.HandleFunc("GET /api/channels/{channel}", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{"channel": r.PathValue("channel"), "emotes": map[string]any{}, "badges": map[string]any{}, "errors": []string{}, "stream": map[string]string{"uptime": "live", "viewers": "10", "title": "Disposable upload fixture", "game": "Just Chatting"}}); err != nil {
			log.Print(err)
		}
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "no fixture provider writes", http.StatusNotFound)
	})
	assets := http.FileServer(http.Dir("web/dist"))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			assets.ServeHTTP(w, r)
			return
		}
		data, err := os.ReadFile("web/dist/index.html")
		if err != nil {
			http.Error(w, "build web first", http.StatusServiceUnavailable)
			return
		}
		html := strings.Replace(string(data), "<head>", "<head>"+mock, 1)
		html = strings.Replace(html, "</body>", controls+"</body>", 1)
		w.Header().Set("Content-Type", "text/html")
		if _, err := w.Write([]byte(html)); err != nil {
			log.Print(err)
		}
	})
	log.Print("Disposable upload fixture: http://127.0.0.1:5190/?channel=current&video=off; storage ", dir)
	if err := http.ListenAndServe("127.0.0.1:5190", mux); err != nil {
		log.Fatal(err)
	}
}

const mock = `<script>window.WebSocket=class{static OPEN=1;readyState=1;constructor(url){const u=new URL(url);setTimeout(()=>{if(this.readyState!==1)return;this.onmessage?.({data:JSON.stringify({type:'status',state:'connected',detail:'synthetic fixture'})});if(u.pathname!=='/api/chat')return;const channel=u.searchParams.get('channels').split(',')[0];for(const [i,login,text,tags] of [[1,'alice','Kappa Kapp',{'display-name':'Alice',emotes:'25:0-4/26:6-9'}],[2,'patrick__eff','Real login retained',{'display-name':'Patrick'}]])this.onmessage?.({data:JSON.stringify({type:'message',replay:false,message:{id:'fixture-'+i,command:'PRIVMSG',channel,login,text,timestamp:Date.now(),tags}})});},300);}close(){this.readyState=3;this.onclose?.({code:1000});}};</script>`
const controls = `<section aria-label="Upload fixture controls"><button id="fixture-paste">Generate disposable PNG paste</button><button id="fixture-drop">Generate disposable PNG drop</button></section><script>for(const kind of ['paste','drop'])document.getElementById('fixture-'+kind).onclick=()=>{const c=document.createElement('canvas');c.width=2;c.height=2;c.getContext('2d').fillRect(0,0,2,2);c.toBlob(blob=>{const data=new DataTransfer();data.items.add(new File([blob],'disposable-fixture.png',{type:'image/png'}));document.getElementById('message').dispatchEvent(kind==='paste'?new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}):new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));});};</script>`
