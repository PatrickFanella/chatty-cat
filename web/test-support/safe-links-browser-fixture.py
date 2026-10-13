from http.server import SimpleHTTPRequestHandler, HTTPServer
from functools import partial
from pathlib import Path
import json,time
MOCK='''<script>window.WebSocket=class{static OPEN=1;readyState=1;constructor(url){const u=new URL(url);setTimeout(()=>{if(this.readyState!==1)return;this.onmessage?.({data:JSON.stringify({type:'status',state:'connected',detail:'synthetic fixture'})});if(u.pathname!=='/api/chat')return;const channel=u.searchParams.get('channels').split(',')[0];for(const [i,login,text,tags] of [[1,'alice','Try https://Example.com/short?utm_source=fixture public search & 😀',{'display-name':'Alice'}],[2,'patrick__eff','Real login retained',{'display-name':'Patrick'}]])this.onmessage?.({data:JSON.stringify({type:'message',replay:false,message:{id:'fixture-'+i,command:'PRIVMSG',channel,login,text,timestamp:Date.now(),tags}})});},300);}close(){this.readyState=3;this.onclose?.({code:1000});}};</script>'''
class Handler(SimpleHTTPRequestHandler):
 writes=0
 reads=0
 previews=0
 def do_GET(self):
  if self.path.startswith('/fixture-count'):body={'writes':Handler.writes,'previewReads':Handler.previews}
  elif self.path.startswith('/api/preview'):
   Handler.previews+=1;body={'url':'https://example.com/resolved','title':'Synthetic resolved destination','description':'Public fixture only','site':'Example','image':'','icon':'','author':'','published':'','contentType':'text/html','ttl':60}
  elif self.path.startswith('/api/auth/session'):body={'enabled':True,'authenticated':True,'loginURL':'http://127.0.0.1:5186/api/auth/login','userID':'42','login':'fixture','csrf':'fixture','chattersEnabled':True}
  elif self.path.startswith('/api/auth/discovery'):
   Handler.reads+=1;body={'kind':'chatters','channel':'current','accountID':'42','after':'not-fetched','observedAt':int(time.time()*1000),'total':200,'items':[{'id':'2','login':'bob','name':'Bob'}]}
  elif self.path.startswith('/api/channels/'):
   channel=self.path.split('?')[0].split('/')[-1];body={'channel':channel,'emotes':{},'badges':{},'errors':[],'stream':{'uptime':'live','viewers':'10','title':'Synthetic fixture','game':'Just Chatting'}}
  elif self.path.startswith('/api/'):
   self.send_error(404);return
  elif self.path.split('?')[0] in ('/','/index.html'):
   data=Path('web/dist/index.html').read_text().replace('<head>','<head>'+MOCK).replace('</body>','''<button id="fixture-select">Select disposable public chat text</button><script>document.getElementById('fixture-select').onclick=()=>{const log=document.getElementById('log');const row=log.querySelector('.row');const range=document.createRange();range.selectNodeContents(row);const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range);};</script></body>''').encode();self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(data);return
  else:super().do_GET();return
  data=json.dumps(body).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def do_POST(self):Handler.writes+=1;self.send_error(405)
 def log_message(self,*args):pass
HTTPServer(('127.0.0.1',5186),partial(Handler,directory='web/dist')).serve_forever()
