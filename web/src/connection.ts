import { parseEvent,parseWorkspaceChannels, type ServerEvent } from './protocol';

export class ChatConnection {
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private paused=false;
  private attempt = 0;
  private hiddenAt = 0;
  private listening = false;
  private generation=0;
  private refusal=false;
  private admissionAbort:AbortController|undefined;
  private channels:string[];

  constructor(channels: string[], private readonly receive: (event: ServerEvent) => void, private readonly path = '/api/chat') {this.channels=[...new Set(channels)].sort();}

  start(): void {
    if (this.stopped || this.paused || this.socket||this.refusal||!this.channels.length&&['/api/chat','/api/auth/chat'].includes(this.path)) return;
    this.generation++;this.admissionAbort?.abort();
    if(!this.listening){this.listening=true;window.addEventListener('online',this.online);document.addEventListener('visibilitychange',this.visibility);}
    const url = new URL(this.path, location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('channels', this.channels.join(','));
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onmessage = (message: MessageEvent<unknown>) => {
      if (this.stopped || this.socket !== socket || typeof message.data !== 'string') return;
      const event = parseEvent(message.data);
      if (event) { if(event.type==='status'&&event.state==='connected')this.attempt=0;this.receive(event); }
    };
    socket.onclose = () => {
      if(this.socket !== socket)return;
      this.socket = null;
      if (this.stopped) return;
      this.receive({ type: 'status', state: 'reconnecting', detail: 'Go service disconnected; retrying' });
      this.timer = setTimeout(() => {
        this.timer = null;
        this.start();
      }, Math.min(1000 * 2 ** this.attempt++, 30000));
      void this.admission(this.generation);
    };
  }
  setChannels(channels:readonly string[]):boolean {const next=channels.length?parseWorkspaceChannels(channels.join(',')).sort():[];if(next.join(',')===this.channels.join(','))return false;this.channels=next;if(!this.paused)this.reconnect();return true;}
  private async admission(generation:number):Promise<void>{
    if(!['/api/chat','/api/auth/chat'].includes(this.path))return;this.admissionAbort?.abort();const abort=new AbortController();this.admissionAbort=abort;
    try{const url=new URL(this.path+'-admission',location.href);url.searchParams.set('channels',this.channels.join(','));const response=await fetch(url,{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(3000)])});const value:unknown=await response.json();
      if(this.stopped||generation!==this.generation||abort.signal.aborted||!value||typeof value!=='object'||!('allowed' in value)||value.allowed!==false||!('detail' in value)||typeof value.detail!=='string'||value.detail.length>500||!('retryAfter' in value)||typeof value.retryAfter!=='number'||!Number.isInteger(value.retryAfter)||value.retryAfter<0||value.retryAfter>60)return;
      if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}this.refusal=value.retryAfter===0;
      this.receive({type:'status',state:'reconnecting',detail:value.detail+(value.retryAfter?'; retrying in '+value.retryAfter+' seconds':'; update channels or account permissions before reconnecting')});
      if(value.retryAfter)this.timer=setTimeout(()=>{this.timer=null;this.start();},value.retryAfter*1000);
    }catch{/* The existing bounded transport retry handles old/offline servers. */}
  }

  private online=():void=>{if(this.stopped||this.socket)return;if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}this.start();};
  disconnect():void{this.paused=true;this.generation++;this.admissionAbort?.abort();if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}const old=this.socket;this.socket=null;old?.close();this.receive({type:'status',state:'reconnecting',detail:'Disconnected by you; use /reconnect to resume'});}
  reconnect():void{if(this.stopped)return;this.paused=false;this.generation++;this.admissionAbort?.abort();this.refusal=false;if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}const old=this.socket;this.socket=null;old?.close();this.attempt=0;this.receive({type:'status',state:'reconnecting',detail:this.path==='/api/chat'?'Reconnecting public chat':'Reconnecting personal chat'});this.start();}
  private visibility=():void=>{
    if(document.hidden){this.hiddenAt=Date.now();return;}
    if(this.hiddenAt&&Date.now()-this.hiddenAt>60000){this.hiddenAt=0;this.socket?.close();this.online();}
  };
  stop(): void {
    this.stopped = true;window.removeEventListener('online',this.online);document.removeEventListener('visibilitychange',this.visibility);
    this.generation++;this.admissionAbort?.abort();
    if (this.timer !== null) clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
  }
}
