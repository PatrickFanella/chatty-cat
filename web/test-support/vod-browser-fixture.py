# Local QA only. Synthetic public VOD metadata; this does not prove Twitch playback.
from http.server import SimpleHTTPRequestHandler, HTTPServer
from functools import partial
from pathlib import Path
import json
RANGE = {'start':'2026-10-10T12:00:00Z','end':'2026-10-10T14:00:00Z','url':'https://www.twitch.tv/videos/123','title':'Fixture archive'}
class Handler(SimpleHTTPRequestHandler):
 available = True
 def do_GET(self):
  if self.path in ['/fixture/deleted','/fixture/available']:
   Handler.available = self.path.endswith('/available')
   return self.json({'available':Handler.available})
  if self.path.startswith('/api/auth/session'):
   return self.json({'enabled':True,'authenticated':True,'loginURL':'http://127.0.0.1:5193/api/auth/login','userID':'42','login':'fixture','csrf':'fixture'})
  if self.path == '/api/channels/one/vod/123':
   if not Handler.available:
    self.send_error(404);return
   return self.json(RANGE)
  if self.path == '/api/channels/one':
   return self.json({'channel':'one','emotes':{},'badges':{},'emoteUse':{},'stream':{'uptime':'Offline','viewers':'0','title':'Fixture','game':''},'errors':[],'lastVod':RANGE})
  if self.path.startswith('/api/'):
   self.send_error(404);return
  super().do_GET()
 def json(self, body):
  data=json.dumps(body).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def log_message(self,*args):pass
HTTPServer(('127.0.0.1',5193),partial(Handler,directory=str(Path(__file__).resolve().parents[1] / 'dist'))).serve_forever()
