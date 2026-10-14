import base64,json,subprocess,threading,time,http.server,sys,select,urllib.parse
from pathlib import Path
observed={}
if len(sys.argv)!=2: raise SystemExit("Usage: python3 scripts/verify-macos-overlay.py /absolute/path/to/ChattyOverlay")
def read_state(p):
 if not select.select([p.stdout],[],[],8)[0]:
  p.kill();raise RuntimeError("native overlay response timed out")
 line=p.stdout.readline()
 if not line: raise RuntimeError("native host exited: "+p.stderr.read()[:2000])
 return json.loads(line)
class Page(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path.startswith('/observe?'):
   observed.update(urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query));self.send_response(204);self.end_headers();return
  if self.path=='/style.css':
   self.send_response(200);self.send_header('Content-Type','text/css');self.end_headers();self.wfile.write((Path(__file__).resolve().parents[1]/'web/src/style.css').read_bytes());return
  self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(b'''<html data-overlay="true"><head><link rel="stylesheet" href="/style.css"></head><body><section class="chat-workspace"><div id="log"><div class="row"><span id="foreground">Controlled public overlay fixture. No provider connection.</span></div></div></section><script>setInterval(()=>{const row=document.querySelector('.row'),root=document.documentElement;fetch('/observe?'+new URLSearchParams({alpha:root.style.getPropertyValue('--overlay-background-alpha'),shadow:root.style.getPropertyValue('--overlay-content-shadow'),background:getComputedStyle(row).backgroundColor,filter:getComputedStyle(document.querySelector('#log')).filter,foreground:getComputedStyle(document.querySelector('#foreground')).opacity}));},100)</script></body></html>''')
 def log_message(self,*args):pass
server=http.server.HTTPServer(('127.0.0.1',0),Page);threading.Thread(target=server.serve_forever,daemon=True).start()
def start(account,settings):
 config={'url':f'http://127.0.0.1:{server.server_port}/?channel=fixture&overlay=1&video=off','account':account,'settings':settings}
 p=subprocess.Popen([sys.argv[1],'--config',base64.b64encode(json.dumps(config).encode()).decode()],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 state=read_state(p);return p,state
def ask(p,kind,settings=None):
 p.stdin.write(json.dumps({'kind':kind,**({'settings':settings} if settings else {})})+'\n');p.stdin.flush();return read_state(p)
def stop(p):p.terminate();p.wait(timeout=5)
settings={'channel':'fixture','opacity':.8,'scale':1,'width':420,'height':620,'shadow':True,'clickThrough':True}
p,initial=start('900000117',settings)
try:
 assert initial['open'] and not initial['interactive'],initial
 time.sleep(11)
 recovered=ask(p,'status');assert recovered['interactive'],recovered
 changed={**settings,'width':540,'height':700,'clickThrough':False,'scale':1.2,'opacity':.7,'shadow':False,'appearance':{'backgroundOpacity':128,'shadow':True,'shadowOpacity':128,'shadowColor':'#123456','shadowOffsetX':-3,'shadowOffsetY':4,'shadowRadius':6}}
 updated=ask(p,'update',changed);assert updated['settings']['width']==540 and updated['settings']['height']==700 and updated['interactive'],updated
 deadline=time.time()+3
 while observed.get('alpha')!=['50.19607843137255%'] and time.time()<deadline:time.sleep(.05)
 assert observed.get('foreground')==['1'] and observed.get('alpha')==['50.19607843137255%'],observed
 assert 'drop-shadow' in observed.get('filter',[''])[0] and '0.50196' in observed.get('background',[''])[0],observed
 rendering=dict(observed)
 explicit=ask(p,'recover');assert explicit['interactive'],explicit
finally:stop(p)
p,restored=start('900000117',settings)
try:assert restored['settings']['width']==540 and restored['settings']['height']==700,restored
finally:stop(p)
p,isolated=start('900000118',settings)
try:assert isolated['settings']['width']==420 and isolated['settings']['height']==620,isolated
finally:stop(p)
server.shutdown()
report={'initial':initial,'leaseRecovery':recovered,'updated':updated,'explicitRecovery':explicit,'restoredGeometry':restored,'separateAccount':isolated,'rendering':rendering}
print(json.dumps(report,indent=2))
