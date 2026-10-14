"""Built-app read-service fixture. No real provider sockets or activity writes."""
import importlib.util,json
from functools import partial
from http.server import HTTPServer
from pathlib import Path
spec=importlib.util.spec_from_file_location('provider_fixture',Path(__file__).with_name('provider-browser-fixture.py'))
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
base.MOCK=base.MOCK.replace("'display-name':'Alice',emotes", "'display-name':'Alice','user-id':'2',emotes")+'''<script>
window.fixtureActivityWrites=[];const nativeFetch=window.fetch.bind(window);window.fetch=(url,options)=>{if(String(url).startsWith('https://7tv.io/v3/users/twitch/'))return Promise.resolve(new Response(JSON.stringify({id:'42',platform:'TWITCH',user:{id:'own7tv'}}),{headers:{'Content-Type':'application/json'}}));if(String(url)==='https://7tv.io/v3/users/own7tv/presences'){window.fixtureActivityWrites.push({url,method:options.method,body:JSON.parse(options.body),credentials:options.credentials,headers:options.headers});return Promise.resolve(new Response(null,{status:204}));}return nativeFetch(url,options);};
window.fixtureProviderSockets=[];
const PublicSocket=window.WebSocket;
window.WebSocket=class{static OPEN=1;constructor(url){if(!String(url).startsWith('wss://'))return new PublicSocket(url);this.url=url;this.readyState=0;this.bufferedAmount=0;this.sent=[];window.fixtureProviderSockets.push(this);setTimeout(()=>{this.readyState=1;this.onopen?.();if(url.includes('7tv'))this.deliver({op:1,d:{heartbeat_interval:45000,subscription_limit:500}});},20);}send(value){this.sent.push(JSON.parse(value));}close(){this.readyState=3;}deliver(value){this.onmessage?.({data:JSON.stringify(value)});}};
window.fixtureDeliverBadges=()=>{for(const socket of window.fixtureProviderSockets){if(socket.readyState!==1)continue;if(socket.url.includes('betterttv'))socket.deliver({name:'lookup_user',data:{providerId:'2',badge:{url:'https://cdn.betterttv.net/badges/pro.svg'}}});else{socket.deliver({op:0,d:{type:'cosmetic.create',body:{object:{kind:'BADGE',data:{id:'fixture',tooltip:'Fixture supporter',host:{url:'//cdn.7tv.app/badge/fixture',files:[{name:'2x.webp'}]}}}}}});socket.deliver({op:0,d:{type:'entitlement.create',body:{object:{kind:'BADGE',ref_id:'fixture',user:{connections:[{platform:'TWITCH',id:'2'}]}}}}});}}};
window.fixtureHint=()=>window.fixtureProviderSockets.filter(s=>s.readyState===1&&s.url.includes('7tv')).forEach(s=>s.deliver({op:0,d:{type:'emote_set.update',body:{id:'set'}}}));
</script>'''
class Handler(base.Handler):
 def do_GET(self):
  if self.path=='/api/provider-services/config':
   data=json.dumps({'providers':['BTTV','7TV'],'maxChannels':24,'maxSockets':3,'refreshSeconds':30}).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(data);return
  return super().do_GET()
HTTPServer(('127.0.0.1',5198),partial(Handler,directory='web/dist')).serve_forever()
