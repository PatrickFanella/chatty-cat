// Pure extension protocol. No DOM, cookie, token, native or network APIs.
const appOrigin='https://chat.subcult.tv';
const id=/^[1-9][0-9]{0,19}$/;
const capability=/^[a-f0-9]{64}$/;
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
function random(){const bytes=crypto.getRandomValues(new Uint8Array(32));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
export function watchedChannel(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='www.twitch.tv'||u.port||u.username||u.password||!/^\/[a-zA-Z0-9_]{1,25}\/?$/.test(u.pathname))return null;const c=u.pathname.split('/')[1].toLowerCase();if(['directory','videos','downloads','settings','subscriptions','inventory','wallet','search','jobs','turbo','store','friends','messages','login','signup','activate','drops','p','broadcast','dashboard','moderator','popout','embed'].includes(c))return null;return c;}catch{return null;}
}
export function pairingCode(state,now=Date.now()){state.session=null;state.pending={code:random(),expires:now+300000,attempts:0};return state.pending.code;}
function validSender(sender){try{const u=new URL(sender.url);return !sender.id&&sender.frameId===0&&Number.isSafeInteger(sender.tab?.id)&&sender.tab.id>=0&&sender.origin===appOrigin&&u.origin===appOrigin&&u.pathname==='/'&&!u.username&&!u.password;}catch{return false;}}
export function external(state,message,sender,now=Date.now()){
 if(!validSender(sender)||!record(message)||JSON.stringify(message).length>2048||message.version!==1||!id.test(message.account))return {ok:false,error:'origin or request refused'};
 if(message.kind==='pair'){
  const p=state.pending;if(!p||p.attempts>=5||now>p.expires)return {ok:false,error:'generate a new pairing code'};p.attempts++;
  if(typeof message.code!=='string'||!capability.test(message.code)||p.code!==message.code)return {ok:false,error:'pairing refused'};
  const token=random();state.pending=null;state.session={account:message.account,tab:sender.tab.id,token,expires:now+8*3600000,lastSeen:now,lastPoll:0,seq:0,watched:null};return {ok:true,version:1,account:message.account,token};
 }
 const s=state.session;if(!s||now>s.expires||now-s.lastSeen>30000){state.session=null;return {ok:false,error:'pairing expired or app disconnected'};}
 if(s.tab!==sender.tab.id||s.account!==message.account||s.token!==message.token)return {ok:false,error:'paired tab/account refused'};
 if(message.kind==='unpair'){state.session=null;return {ok:true,version:1};}
 if(message.kind!=='poll')return {ok:false,error:'unsupported request'};
 if(now-s.lastPoll<1000)return {ok:false,error:'poll cooldown'};s.lastPoll=now;s.lastSeen=now;
 if(s.watched&&now>s.watched.expires)s.watched=null;
 return {ok:true,version:1,account:s.account,watched:s.watched?{channel:s.watched.channel,seq:s.watched.seq}:null};
}
export function sendWatched(state,url,now=Date.now()){
 const s=state.session,channel=watchedChannel(url);if(!s||now>s.expires||now-s.lastSeen>30000){state.session=null;throw new Error('Open and pair a connected Chatty Cat tab first');}if(!channel)throw new Error('Use the extension on a Twitch channel page');if(s.seq>=1000000)throw new Error('Pair again');s.seq++;s.watched={channel,seq:s.seq,expires:now+120000};return {tab:s.tab,channel};
}
