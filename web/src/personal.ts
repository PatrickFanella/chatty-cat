import type { AuthStatus } from './auth';
import { ChatConnection } from './connection';
import type { ChatMessage, ServerEvent } from './protocol';
export class PersonalState {
  private global: Record<string,string> = {};
  private state = new Map<string,Record<string,string>>();
  private timeouts = new Map<string,number>();
  private banned = new Set<string>();
  private sent = new Map<string,number>();
  login='';
  reset(login=''):void {this.login=login;this.global={};this.state.clear();this.timeouts.clear();this.banned.clear();this.sent.clear();}
  observe(message:ChatMessage):void {
    if(message.command==='GLOBALUSERSTATE')this.global={...this.global,...message.tags};
    if(message.command==='USERSTATE')this.state.set(message.channel,{...this.global,...this.state.get(message.channel),...message.tags});
    if(this.login&&message.command==='CLEARCHAT'&&message.text.toLowerCase()===this.login.toLowerCase()){
      const duration=Number(message.tags['ban-duration']);if(Number.isSafeInteger(duration)&&duration>0)this.timeouts.set(message.channel,message.timestamp+duration*1000);else this.banned.add(message.channel);
    }
  }
  accepted(channel:string,now=Date.now()):void {this.sent.set(channel,now);this.banned.delete(channel);this.timeouts.delete(channel);}
  tags(channel:string):Record<string,string> { return {...this.global,...this.state.get(channel)}; }
  labels(channel:string,now=Date.now()):string[]{
    const tags=this.state.get(channel)??this.global;const labels:string[]=[];
    if(tags.mod==='1'||tags.badges?.includes('moderator/'))labels.push('Moderator');
    if(tags.badges?.includes('broadcaster/'))labels.push('Broadcaster');
    if(tags.badges?.includes('vip/'))labels.push('VIP');
    if(tags.subscriber==='1')labels.push('Subscriber');
    const remaining=Math.ceil(((this.timeouts.get(channel)??0)-now)/1000);if(remaining>0)labels.push(`Your timeout: ${remaining}s`);
    if(this.banned.has(channel))labels.push('Your ban was reported; Twitch will check current permission when you send');return labels;
  }
  block(channel:string,slow:number,now=Date.now()):string {
    const remaining=Math.ceil(((this.timeouts.get(channel)??0)-now)/1000);if(remaining>0)return `Timed out in #${channel} for ${remaining}s`;
    const tags=this.state.get(channel)??this.global;const exempt=tags.mod==='1'||/\b(moderator|broadcaster|vip)\//.test(tags.badges??'');
    const wait=exempt||!this.sent.has(channel)?0:Math.ceil(((this.sent.get(channel)??0)+slow*1000-now)/1000);return wait>0?`Slow mode: wait ${wait}s in #${channel}`:'';
  }
}
export class PersonalChat {
  private connection:ChatConnection|undefined;
  private identity='';
  constructor(private channels:string[],private receive:(event:ServerEvent)=>void,private status:HTMLElement,private reset:(login:string)=>void){}
  update(auth:AuthStatus|undefined):void {
    const identity=auth?.authenticated?`${auth.userID}:${auth.personalChatEnabled}`:'';if(identity===this.identity)return;
    this.identity=identity;this.connection?.stop();this.connection=undefined;this.reset(auth?.authenticated?auth.login??'':'');this.status.textContent='';
    if(!auth?.authenticated)return;if(!auth.personalChatEnabled){this.status.textContent='Log in again to enable personal room state';return;}
    this.connection=new ChatConnection(this.channels,event=>{if(event.type==='status')this.status.textContent=event.detail||`Personal chat: ${event.state}`;else this.receive(event);},'/api/auth/chat');this.connection.start();
  }
  stop():void {this.connection?.stop();}
  setChannels(channels:readonly string[]):void{this.channels=[...channels];this.connection?.setChannels(channels);}
}
