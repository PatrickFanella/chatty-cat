# Local QA only: synthetic account; public/provider API calls return 404.
from http.server import SimpleHTTPRequestHandler,HTTPServer
from functools import partial
import json
from pathlib import Path
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path.startswith('/api/auth/session'):
   body={'enabled':True,'authenticated':True,'loginURL':'http://127.0.0.1:5192/api/auth/login','userID':'42','login':'fixture','csrf':'fixture','followsEnabled':True,'chattersEnabled':True}
   data=json.dumps(body).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
  if self.path.startswith('/api/'):
   self.send_error(404);return
  super().do_GET()
 def log_message(self,*args):pass
HTTPServer(('127.0.0.1',5192),partial(Handler,directory=str(Path(__file__).resolve().parents[1] / 'dist'))).serve_forever()
