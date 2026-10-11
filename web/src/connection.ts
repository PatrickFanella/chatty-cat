import { parseEvent, type ServerEvent } from './protocol';

export class ChatConnection {
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private attempt = 0;
  private hiddenAt = 0;
  private listening = false;

  constructor(private readonly channels: string[], private readonly receive: (event: ServerEvent) => void, private readonly path = '/api/chat') {}

  start(): void {
    if (this.stopped || this.socket) return;
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
    };
  }

  private online=():void=>{if(this.stopped||this.socket)return;if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}this.start();};
  private visibility=():void=>{
    if(document.hidden){this.hiddenAt=Date.now();return;}
    if(this.hiddenAt&&Date.now()-this.hiddenAt>60000){this.hiddenAt=0;this.socket?.close();this.online();}
  };
  stop(): void {
    this.stopped = true;window.removeEventListener('online',this.online);document.removeEventListener('visibilitychange',this.visibility);
    if (this.timer !== null) clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
  }
}
