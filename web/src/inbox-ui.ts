import { ConversationInbox, type InboxKind } from './inbox';
import type { ChatMessage } from './protocol';
import { privacyEnabled } from './privacy';
export class InboxPanel {
 private model=new ConversationInbox();
 private root=document.createElement('dialog');
 private trigger=document.createElement('button');
 private section:InboxKind='mentions';
 private channel='';
 private frame=0;
 constructor(channels:readonly string[],private jump:(message:ChatMessage)=>void,private answer:(login:string)=>void){
  this.trigger.id='inbox-open';this.trigger.type='button';this.trigger.textContent='Inbox';document.getElementById('workspace-open')?.after(this.trigger);this.trigger.addEventListener('click',this.open);
  this.root.id='inbox-panel';this.root.setAttribute('aria-label','Conversation inbox');
  this.root.innerHTML='<h2>Conversation inbox</h2><button type="button" data-inbox-action="close">Close</button><label>Section<select id="inbox-section"><option value="mentions">Mentions</option><option value="replies">Reply threads</option><option value="whispers">Private whispers</option></select></label><label>Channel<select id="inbox-channel"><option value="">All joined channels</option></select></label><button type="button" data-inbox-action="read-all">Mark section read</button><p id="inbox-status" role="status"></p><div id="inbox-items"></div><p>Public read state is saved for this account. Whisper contents and read state stay in memory and are cleared on sign-out or reload. Only observed conversations are available.</p>';
  const channel=this.root.querySelector<HTMLSelectElement>('#inbox-channel')!;for(const name of channels){const option=document.createElement('option');option.value=name;option.textContent='#'+name;channel.append(option);}
  this.root.addEventListener('change',this.change);this.root.addEventListener('click',this.click);window.addEventListener('storage',this.storage);document.body.append(this.root);this.paint();
 }
 setAccount(id:string,login:string):boolean{const changed=this.model.setAccount(id,login);if(changed){this.root.close();this.root.querySelector('#inbox-items')!.replaceChildren();this.paint();}return changed;}
 observe(message:ChatMessage,forceMention=false):void{if(this.model.observe(message,forceMention))this.schedule();}
 whisper(message:ChatMessage,outgoing:boolean):void{this.model.whisper(message,outgoing);this.schedule();}
 private schedule():void{if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.paint();});}
 private storage=(event:StorageEvent):void=>{if(event.key?.startsWith('chatthing:v1:inbox-read:'))try{this.model.refreshReads();this.schedule();}catch{this.status('Public read state could not be synchronized');}};
 private open=():void=>{if(privacyEnabled())return;try{this.model.refreshReads();}catch{this.status('Public read state could not be synchronized');}this.root.showModal();this.paint();this.root.querySelector<HTMLSelectElement>('#inbox-section')!.focus();};
 show():void{this.open();}
 private status(text:string):void{this.root.querySelector<HTMLElement>('#inbox-status')!.textContent=text;}
 private paint():void{
  const counts={mentions:this.model.unread('mentions'),replies:this.model.unread('replies'),whispers:this.model.unread('whispers')};const unread=counts.mentions+counts.replies+counts.whispers;this.trigger.textContent='Inbox'+(unread?' ('+unread+')':'');
  for(const option of this.root.querySelectorAll<HTMLOptionElement>('#inbox-section option')){const kind=option.value;option.textContent=kind==='mentions'?'Mentions ('+counts.mentions+')':kind==='replies'?'Reply threads ('+counts.replies+')':'Private whispers ('+counts.whispers+')';}
  if(!this.root.open)return;
  const channel=this.root.querySelector<HTMLSelectElement>('#inbox-channel')!;channel.disabled=this.section==='whispers';
  const filter=this.section==='whispers'?'':this.channel;const items=this.model.items(this.section,filter);const container=this.root.querySelector<HTMLElement>('#inbox-items')!,edge=container.getBoundingClientRect().top,top=container.scrollTop;const anchor=[...container.children].find(node=>node.getBoundingClientRect().bottom>edge);const anchorKey=anchor instanceof HTMLElement?anchor.dataset.key:undefined,offset=anchor?.getBoundingClientRect().top;const focused=document.activeElement instanceof HTMLButtonElement&&container.contains(document.activeElement)?{key:document.activeElement.dataset.key,action:document.activeElement.dataset.inboxAction}:undefined;container.replaceChildren();
  this.root.querySelector<HTMLButtonElement>('[data-inbox-action=read-all]')!.disabled=!this.model.authenticated;
  this.status(this.model.error||(!this.model.authenticated?'Log in with Twitch to collect conversations':items.length+' retained items · '+this.model.unread(this.section,filter)+' unread'));
  for(const item of items){const article=document.createElement('article');article.className='inbox-item';article.dataset.key=item.key;article.dataset.read=String(item.read);const text=document.createElement('p');text.textContent=(item.outgoing?'Requested → ':'')+(item.message.tags['display-name']||item.message.login)+(item.message.channel?' · #'+item.message.channel:'')+' · '+new Date(item.message.timestamp).toLocaleString()+': '+item.message.text;
   const jump=document.createElement('button');jump.type='button';jump.dataset.inboxAction='jump';jump.dataset.key=item.key;jump.textContent=item.kind==='whispers'?'Reply privately':'Jump to public context';const read=document.createElement('button');read.type='button';read.dataset.inboxAction='read';read.dataset.key=item.key;read.textContent=item.read?'Read':'Mark read';read.disabled=item.read;article.append(text,jump,read);container.append(article);
  }
  const restored=[...container.children].find(node=>node instanceof HTMLElement&&node.dataset.key===anchorKey);if(restored&&offset!==undefined)container.scrollTop+=restored.getBoundingClientRect().top-offset;else container.scrollTop=top;
  if(focused){const replacement=[...container.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.dataset.key===focused.key&&button.dataset.inboxAction===focused.action&&!button.disabled)??[...container.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.dataset.key===focused.key&&!button.disabled);replacement?.focus({preventScroll:true});}
 }
 private change=():void=>{this.root.querySelector<HTMLElement>('#inbox-items')!.scrollTop=0;const value=this.root.querySelector<HTMLSelectElement>('#inbox-section')!.value;if(value==='mentions'||value==='replies'||value==='whispers')this.section=value;this.channel=this.root.querySelector<HTMLSelectElement>('#inbox-channel')!.value;this.paint();};
 private click=(event:MouseEvent):void=>{
  if(!(event.target instanceof Element))return;const button=event.target.closest<HTMLButtonElement>('[data-inbox-action]');if(!button)return;
  try{const action=button.dataset.inboxAction;if(action==='close'){this.root.close();this.trigger.focus();return;}if(action==='read-all'){this.model.markAll(this.section,this.section==='whispers'?'':this.channel);this.paint();return;}
   const item=this.model.items(this.section).find(item=>item.key===button.dataset.key);if(!item)return;if(action==='jump'){try{this.model.markRead(item.key);}catch{this.model.error='Public read state could not be saved; public context remains available';}this.root.close();if(item.kind==='whispers')this.answer(item.message.login);else this.jump(item.message);}else{this.model.markRead(item.key);this.paint();}
  }catch(error){this.status(error instanceof Error?error.message:'Inbox action failed');}
 };
 stop():void{cancelAnimationFrame(this.frame);window.removeEventListener('storage',this.storage);this.model.clear();this.trigger.removeEventListener('click',this.open);this.root.removeEventListener('change',this.change);this.root.removeEventListener('click',this.click);this.root.remove();this.trigger.remove();}
}
