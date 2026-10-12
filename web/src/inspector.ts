import { privacyEnabled } from './privacy';
import type { AuthStatus } from './auth';
import type { ChatMessage } from './protocol';
import { parseSendResult } from './composer';
export class UserInspector {
  private message: ChatMessage | undefined;
  get selectedMessage():ChatMessage|undefined{return this.message;}
  private armed: string | undefined;
  private requestID: string | undefined;
  private busy = false;
  private abort = new AbortController();
  private status: HTMLElement;
  private confirm: HTMLButtonElement;
  constructor(private dialog: HTMLDialogElement, private log: HTMLElement,
    private messages: () => readonly ChatMessage[], private auth: () => AuthStatus | undefined,
    private reply: (message: ChatMessage) => void, private pronouns:(login:string)=>Promise<string|undefined>=async()=>undefined) {
    this.status=dialog.querySelector<HTMLElement>('[role=status]')!;this.confirm=dialog.querySelector<HTMLButtonElement>('[data-confirm]')!;
    log.addEventListener('click',this.inspect);dialog.addEventListener('click',this.click);dialog.addEventListener('close',this.closed);dialog.addEventListener('cancel',this.cancel);
  }
  private inspect=(event:MouseEvent):void=>{
    if(privacyEnabled())return;
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!(event.target instanceof Element))return;
    const name=event.target.closest<HTMLAnchorElement>('a.name,a.mention'),row=name?.closest<HTMLElement>('.row');if(!name||!row)return;
    if(this.busy){event.preventDefault();return;}
    const message=name.dataset.mention ? [...this.messages()].reverse().find(item=>item.login.toLowerCase()===name.dataset.mention&&item.channel===row.dataset.channel&&item.command==='PRIVMSG') : this.messages().find(item=>item.id===row.dataset.id&&item.channel===row.dataset.channel);
    if(!message||!message.login||!/^[a-z0-9_]{1,25}$/i.test(message.login))return;
    event.preventDefault();this.show(message);
  };
  openUser(login:string,channel:string):boolean{if(privacyEnabled()||this.busy)return false;const message=[...this.messages()].reverse().find(m=>m.login.toLowerCase()===login.toLowerCase()&&m.channel===channel&&m.command==='PRIVMSG');if(!message)return false;this.show(message);return true;}
  private show(message:ChatMessage):void{this.message=message;this.armed=undefined;this.requestID=undefined;this.status.textContent='';this.confirm.hidden=true;
    const records=this.messages().filter(item=>item.channel===message.channel&&item.login===message.login&&item.command==='PRIVMSG');
    this.dialog.querySelector<HTMLElement>('h2')!.textContent=message.tags['display-name']||message.login;
    const profile=this.dialog.querySelector<HTMLAnchorElement>('[data-profile]')!;profile.href='https://www.twitch.tv/'+message.login;
    this.dialog.querySelector<HTMLElement>('[data-facts]')!.textContent=`#${message.channel} · ${records.length.toLocaleString()} retained messages · badges: ${message.tags.badges||'none reported'}`;
    this.dialog.querySelector<HTMLElement>('[data-text]')!.textContent=message.text;
    const scopes=this.auth()?.commandPermissions??[];
    for(const button of this.dialog.querySelectorAll<HTMLButtonElement>('[data-command]'))button.disabled=this.busy||!scopes.includes(button.dataset.command==='delete'?'moderator:manage:chat_messages':'moderator:manage:banned_users')||!this.auth()?.authenticated||(button.dataset.command==='delete'&&(!message.id||message.command!=='PRIVMSG'));
    this.dialog.querySelector<HTMLButtonElement>('[data-reply]')!.disabled=!this.auth()?.authenticated||message.command!=='PRIVMSG'||!message.id;
    this.dialog.showModal();
    void this.pronouns(message.login).then(label=>{if(label&&this.message===message&&this.dialog.open){const facts=this.dialog.querySelector<HTMLElement>('[data-facts]')!;facts.textContent=label+' · '+facts.textContent;}});
  };
  private click=(event:MouseEvent):void=>{
    if(!(event.target instanceof Element))return;const button=event.target.closest<HTMLButtonElement>('button');if(!button||this.busy)return;
    if(button.hasAttribute('data-close'))this.dialog.close();
    else if(button.hasAttribute('data-reply')&&this.message){const message=this.message;this.dialog.close();this.reply(message);}
    else if(button.dataset.command&&this.message){
      const action=button.dataset.command, message=this.message;
      if(!['timeout','ban','delete'].includes(action))return;
      this.armed=action==='timeout'?`/timeout ${message.login} 600`:action==='ban'?`/ban ${message.login}`:`/delete ${message.id}`;
      this.requestID=undefined;this.confirm.hidden=false;this.confirm.disabled=false;this.confirm.textContent=`Confirm ${action} in #${message.channel}`;this.status.textContent=this.armed;
    } else if(button.hasAttribute('data-confirm'))void this.send();
  };
  private async send():Promise<void>{
    const auth=this.auth(),command=this.armed,message=this.message;if(!auth?.authenticated||!auth.csrf||!command||!message)return;
    this.busy=true;this.confirm.disabled=true;this.status.textContent='Sending command…';this.requestID??=crypto.randomUUID();
    try{
      const response=await fetch('/api/chat/send',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':auth.csrf},body:JSON.stringify({channel:message.channel,message:command,requestID:this.requestID}),signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(30000)])});
      const result=parseSendResult(await response.json());if(this.abort.signal.aborted)return;
      if(response.ok&&result.sent&&result.command){this.status.textContent='Command completed';this.armed=undefined;this.confirm.hidden=true;}
      else{this.status.textContent=result.error||'Command could not be confirmed';if(!result.uncertain)this.requestID=undefined;}
    }catch{if(!this.abort.signal.aborted)this.status.textContent='Command could not be confirmed; check Twitch before retrying';}
    finally{this.busy=false;this.confirm.disabled=false;}
  }
  private cancel=(event:Event):void=>{if(this.busy)event.preventDefault();};
  private closed=():void=>{if(!this.busy){this.message=undefined;this.armed=undefined;this.requestID=undefined;}};
  stop():void{this.abort.abort();this.log.removeEventListener('click',this.inspect);this.dialog.removeEventListener('click',this.click);this.dialog.removeEventListener('close',this.closed);this.dialog.removeEventListener('cancel',this.cancel);}
}
