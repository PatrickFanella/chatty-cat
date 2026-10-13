from http.server import SimpleHTTPRequestHandler, HTTPServer
from functools import partial
from pathlib import Path
import json,time
MOCK='''<script>window.WebSocket=class{static OPEN=1;readyState=1;constructor(url){const u=new URL(url);setTimeout(()=>{if(this.readyState!==1)return;this.onmessage?.({data:JSON.stringify({type:'status',state:'connected',detail:'synthetic context fixture'})});if(u.pathname!=='/api/chat')return;const base={command:'PRIVMSG',login:'alice',text:'Shared reward Kappa',timestamp:Date.now(),tags:{'display-name':'Alice','room-id':'200','source-room-id':'100','source-id':'11111111-1111-4111-8111-111111111111','source-badges':'subscriber/1','custom-reward-id':'reward-one',emotes:'25:14-18'}};const messages=[{...base,id:'copy-one',channel:'current'},{...base,id:'copy-replayed',channel:'current'},{...base,id:'11111111-1111-4111-8111-111111111111',channel:'origin',tags:{...base.tags,'room-id':'100'}},{id:'streak',channel:'current',command:'USERNOTICE',login:'bob',text:'A supplied streak',timestamp:Date.now(),tags:{'msg-id':'viewermilestone','msg-param-category':'watch-streak','msg-param-value':'10','msg-param-copoReward':'450'}},{id:'effect',channel:'current',command:'PRIVMSG',login:'bob',text:'Effect body',timestamp:Date.now(),tags:{'msg-id':'animated-message'}}];for(const message of messages)this.onmessage?.({data:JSON.stringify({type:'message',replay:message.id==='copy-replayed',message})});},300);}close(){this.readyState=3;this.onclose?.({code:1000});}};</script>'''
class Handler(SimpleHTTPRequestHandler):
 version=1
 writes=0
 reads=0
 def do_GET(self):
  if self.path.startswith('/fixture-count'):body={'writes':Handler.writes,'chatterReads':Handler.reads}
  elif self.path.startswith('/api/auth/session'):body={'enabled':True,'authenticated':True,'loginURL':'http://127.0.0.1:5194/api/auth/login','userID':'42','login':'fixture','csrf':'fixture','chattersEnabled':True}
  elif self.path.startswith('/api/auth/discovery'):
   Handler.reads+=1;body={'kind':'chatters','channel':'current','accountID':'42','after':'not-fetched','observedAt':int(time.time()*1000),'total':200,'items':[{'id':'2','login':'bob','name':'Bob'}]}
  elif self.path.startswith('/api/channels/'):
   channel=self.path.split('?')[0].split('/')[-1];body={'channel':channel,'broadcasterID':'100' if channel=='origin' else '200','emotes':{},'badges':{'subscriber':{'1':{'url':'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0','title':'Origin subscriber','description':'Known origin badge'}}},'errors':[],'stream':{'uptime':'live','viewers':'10','title':'Synthetic context fixture','game':'Just Chatting'}}
  elif self.path.startswith('/api/'):
   self.send_error(404);return
  elif self.path.split('?')[0] in ('/','/index.html'):
   data=Path('web/dist/index.html').read_text().replace('<head>','<head>'+MOCK).encode();self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(data);return
  else:super().do_GET();return
  data=json.dumps(body).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def do_POST(self):
  if self.path=='/fixture-next':Handler.version=2;self.send_response(204);self.end_headers();return
  Handler.writes+=1;self.send_error(405)
 def log_message(self,*args):pass
HTTPServer(('127.0.0.1',5194),partial(Handler,directory='web/dist')).serve_forever()
