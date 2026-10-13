from http.server import SimpleHTTPRequestHandler, HTTPServer
from functools import partial
from pathlib import Path
import json,time
MOCK='''<script>window.fixtureBootID=crypto.randomUUID();window.fixtureChatSockets=0;window.WebSocket=class{static OPEN=1;readyState=1;constructor(url){const u=new URL(url);if(u.pathname==='/api/chat')window.fixtureChatSockets++;setTimeout(()=>{if(this.readyState!==1)return;this.onmessage?.({data:JSON.stringify({type:'status',state:'connected',detail:'synthetic fixture'})});if(u.pathname!=='/api/chat')return;const channel=u.searchParams.get('channels').split(',')[0];for(const [i,login,text,tags] of [[1,'alice','Wave Overlay Kappa',{'display-name':'Alice',emotes:'25:13-17',badges:'moderator/1,subscriber/1'}],[2,'patrick__eff','Real login retained',{'display-name':'Patrick'}],[3,'fixture','Unlisted Wave  Overlay end',{}],[4,'fixture','Cheer100 hello Kappa50',{bits:'150'}]])this.onmessage?.({data:JSON.stringify({type:'message',replay:false,message:{id:'fixture-'+i,command:'PRIVMSG',channel,login,text,timestamp:Date.now(),tags}})});},300);}close(){this.readyState=3;this.onclose?.({code:1000});}};</script>'''
class Handler(SimpleHTTPRequestHandler):
 version=1
 writes=0
 reads=0
 metadata_reads=0
 def do_GET(self):
  if self.path.startswith('/fixture-count'):body={'writes':Handler.writes,'chatterReads':Handler.reads,'metadataReads':Handler.metadata_reads}
  elif self.path.startswith('/api/auth/session'):body={'enabled':True,'authenticated':True,'loginURL':'http://127.0.0.1:5192/api/auth/login','userID':'42','login':'fixture','csrf':'fixture','chattersEnabled':True}
  elif self.path.startswith('/api/auth/discovery'):
   Handler.reads+=1;body={'kind':'chatters','channel':'current','accountID':'42','after':'not-fetched','observedAt':int(time.time()*1000),'total':200,'items':[{'id':'2','login':'bob','name':'Bob'}]}
  elif self.path.startswith('/api/channels/'):
   Handler.metadata_reads+=1
   channel=self.path.split('?')[0].split('/')[-1]
   def emote(source,code,url,overlay=False):return {'code':code,'source':source,'url':'https://static-cdn.jtvnw.net/emoticons/v2/25/animated/dark/2.0?fixture='+source,'staticUrl':'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0?fixture='+source,'animated':True,'zeroWidth':overlay}
   global7={'Wave':emote('7TV','Wave','https://cdn.example/global'),'Unlisted':{**emote('7TV','Unlisted','https://cdn.example/unlisted'),'unlisted':True}}
   channelffz={} if Handler.version==2 else {'Wave':emote('FFZ','Wave','https://cdn.example/channel'),'Overlay':emote('FFZ','Overlay','https://cdn.example/overlay',True)}
   body={'channel':channel,'emotes':{**global7,**channelffz},'emoteSets':[{'provider':'7TV','scope':'global','emotes':global7},{'provider':'FFZ','scope':'channel','emotes':channelffz}],'badges':{'moderator':{'1':{'url':'https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/2','title':'Moderator','description':'Native Twitch'}}},'ffzRoleBadges':{'moderator':{'url':'https://cdn.frankerfacez.com/badge/2/2','title':'Moderator','description':'FFZ artwork for native Twitch moderator badge'},'vip':{'url':'https://cdn.frankerfacez.com/badge/2/2','title':'VIP','description':'FFZ artwork for native Twitch vip badge'}},'errors':[],'stream':{'uptime':'live','viewers':'10','title':'Synthetic provider fixture','game':'Just Chatting'}}
  elif self.path.startswith('/api/'):
   self.send_error(404);return
  elif self.path.split('?')[0] in ('/','/index.html'):
   data=Path('web/dist/index.html').read_text().replace('<head>','<head>'+MOCK).replace('</body>','<button id="fixture-next">Remove channel emotes in fixture</button><script>document.getElementById("fixture-next").onclick=()=>fetch("/fixture-next",{method:"POST"});</script></body>').encode();self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(data);return
  else:super().do_GET();return
  data=json.dumps(body).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def do_POST(self):
  if self.path=='/fixture-next':Handler.version=2;self.send_response(204);self.end_headers();return
  Handler.writes+=1;self.send_error(405)
 def log_message(self,*args):pass
HTTPServer(('127.0.0.1',5192),partial(Handler,directory='web/dist')).serve_forever()
