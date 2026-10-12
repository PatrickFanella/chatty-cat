import type {ChatMessage} from './protocol';
export const THREAD_LIMIT=500;
export interface ThreadView {channel:string;root:string;read:string[]}
export interface ThreadState {views:ThreadView[];active:string;open:boolean}
export function threadKey(view:Pick<ThreadView,'channel'|'root'>):string{return view.channel+':'+view.root;}
export function replyRoot(message:ChatMessage):string{return message.tags['reply-thread-parent-msg-id']||message.tags['reply-parent-msg-id']||message.id;}
export class ThreadMessages {
 readonly messages=new Map<string,ChatMessage>();private deleted=new Set<string>();private cleared=new Map<string,number>();private allClear=-1;truncated=false;
 constructor(readonly channel:string,readonly root:string){}
 observe(message:ChatMessage):boolean {
  if(message.channel!==this.channel)return false;
  if(message.command==='CLEARMSG'){const id=message.tags['target-msg-id'];if(id){this.deleted.add(id);if(this.deleted.size>1000){const unused=[...this.deleted].find(key=>!this.messages.has(key));if(unused)this.deleted.delete(unused);}}return !!id&&this.messages.has(id);}
  if(message.command==='CLEARCHAT'){const login=message.text.toLowerCase();if(!login)this.allClear=Math.max(this.allClear,message.timestamp);else {this.cleared.set(login,Math.max(this.cleared.get(login)??-1,message.timestamp));if(this.cleared.size>1000){const authors=new Set([...this.messages.values()].map(m=>m.login.toLowerCase()));const unused=[...this.cleared.keys()].find(key=>!authors.has(key));if(unused)this.cleared.delete(unused);}}return true;}
  if(message.command!=='PRIVMSG'||!message.id||!(message.id===this.root||replyRoot(message)===this.root||this.messages.has(message.tags['reply-parent-msg-id']??'')))return false;
  if(this.messages.get(message.id)?.tags['local-echo']==='1'&&message.tags['local-echo']!=='1'){this.messages.set(message.id,message);return true;}
  if(this.messages.has(message.id)){if((message.tags.deleted==='1'||message.tags.deleted==='true')&&!this.deleted.has(message.id)){this.deleted.add(message.id);return true;}return false;}
  if(this.messages.size>=THREAD_LIMIT){this.truncated=true;return false;}
  this.messages.set(message.id,message);return true;
 }
 rows():ChatMessage[]{return [...this.messages.values()].sort((a,b)=>a.timestamp-b.timestamp||a.id.localeCompare(b.id));}
 removed(message:ChatMessage):boolean{return message.tags.deleted==='1'||message.tags.deleted==='true'||this.deleted.has(message.id)||message.timestamp<=Math.max(this.allClear,this.cleared.get(message.login.toLowerCase())??-1);}
 missing():string[]{const missing=new Set<string>();if(!this.messages.has(this.root))missing.add(this.root);for(const m of this.messages.values()){const parent=m.tags['reply-parent-msg-id'];if(parent&&!this.messages.has(parent))missing.add(parent);}return [...missing];}
 context(query=''):string{return this.rows().filter(m=>this.matches(m,query)).map(m=>`${new Date(m.timestamp).toISOString()} #${m.channel} ${m.login}: ${this.removed(m)?'[removed message]':m.text}`).join('\n');}
 matches(message:ChatMessage,query:string):boolean{return (message.login+' '+(this.removed(message)?'[removed message]':message.text)).toLowerCase().includes(query.toLowerCase());}
}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function identifier(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value);}
export class ThreadViews {
 private account:string|undefined;private workspace='';state:ThreadState={views:[],active:'',open:false};
 get key():string|undefined{return this.account===undefined?undefined:'chatthing:v1:threads:'+encodeURIComponent(this.account)+':'+encodeURIComponent(this.workspace);}
 setScope(account:string|undefined,workspace:string):void{if(account===this.account&&workspace===this.workspace)return;this.account=account;this.workspace=workspace;this.reload();}
 reload():void{this.state={views:[],active:'',open:false};if(!this.key)return;const raw=localStorage.getItem(this.key);if(!raw)return;if(raw.length>1000000)throw new Error('Saved threads exceed the storage limit');const value:unknown=JSON.parse(raw);if(!record(value)||!Array.isArray(value.views)||value.views.length>8||typeof value.active!=='string'||typeof value.open!=='boolean')throw new Error('Saved threads are invalid');
  const views:ThreadView[]=[];for(const v of value.views){if(!record(v)||typeof v.channel!=='string'||!/^[a-z0-9_]{1,25}$/.test(v.channel)||!identifier(v.root)||!Array.isArray(v.read)||v.read.length>THREAD_LIMIT||!v.read.every(identifier))throw new Error('Saved threads are invalid');const view={channel:v.channel,root:v.root,read:[...new Set(v.read)]};if(views.some(old=>threadKey(old)===threadKey(view)))throw new Error('Duplicate saved thread');views.push(view);}
  this.state={views,active:views.some(v=>threadKey(v)===value.active)?value.active:'',open:value.open};
 }
 save():void{if(!this.key)throw new Error('Wait for account status before saving a thread');localStorage.setItem(this.key,JSON.stringify(this.state));}
 open(channel:string,root:string):ThreadView{if(!/^[a-z0-9_]{1,25}$/.test(channel)||!identifier(root))throw new Error('Invalid public thread');let view=this.state.views.find(v=>v.channel===channel&&v.root===root);if(!view){if(this.state.views.length>=8)throw new Error('Close a thread before opening another (maximum 8)');view={channel,root,read:[]};this.state.views.push(view);}this.state.active=threadKey(view);this.state.open=true;this.save();return view;}
 unread(view:ThreadView,messages:ThreadMessages):number{return messages.rows().filter(m=>m.id!==view.root&&!view.read.includes(m.id)).length;}
 markRead(view:ThreadView,messages:ThreadMessages):void{view.read=messages.rows().map(m=>m.id).slice(0,THREAD_LIMIT);this.save();}
 close(key:string):void{this.state.views=this.state.views.filter(v=>threadKey(v)!==key);if(this.state.active===key)this.state.active=this.state.views[0]?threadKey(this.state.views[0]):'';if(!this.state.views.length)this.state.open=false;this.save();}
}
