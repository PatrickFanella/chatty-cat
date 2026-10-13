# Local QA only: synthetic public archive data and account, no Twitch writes.
from http.server import SimpleHTTPRequestHandler,HTTPServer
from functools import partial
from pathlib import Path
import json
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path=='/fixture/seed':
   data=Path(__file__).with_name('logs-seed.html').read_bytes();self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(data);return
  if self.path.startswith('/api/auth/session'):
   data=json.dumps({'enabled':True,'authenticated':True,'loginURL':'http://127.0.0.1:5195/api/auth/login','userID':'42','login':'fixture','csrf':'fixture'}).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
  if self.path.startswith('/api/'):
   self.send_error(404);return
  super().do_GET()
 def log_message(self,*args):pass
HTTPServer(('127.0.0.1',5195),partial(Handler,directory=str(Path(__file__).resolve().parents[1]/'dist'))).serve_forever()
