# Local QA only: synthetic account and public archive range, no chat/provider writes.
from http.server import SimpleHTTPRequestHandler, HTTPServer
from functools import partial
from pathlib import Path
from datetime import datetime, timezone, timedelta
import json
now=datetime.now(timezone.utc)
RANGE={'start':(now-timedelta(hours=1)).isoformat(),'end':(now+timedelta(hours=1)).isoformat(),'url':'https://www.twitch.tv/videos/123','title':'Fixture VOD'}
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path=='/fixture/seed':
   data=(Path(__file__).with_name('comparison-seed.html')).read_bytes();self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(data);return
  if self.path.startswith('/api/auth/session'):
   return self.json({'enabled':True,'authenticated':True,'loginURL':'http://127.0.0.1:5194/api/auth/login','userID':'42','login':'fixture','csrf':'fixture'})
  if self.path=='/api/channels/one/vod/123':return self.json(RANGE)
  if self.path=='/fixture/range':return self.json(RANGE)
  if self.path.startswith('/api/'):
   self.send_error(404);return
  super().do_GET()
 def json(self,body):
  data=json.dumps(body).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def log_message(self,*args):pass
HTTPServer(('127.0.0.1',5194),partial(Handler,directory=str(Path(__file__).resolve().parents[1]/'dist'))).serve_forever()
