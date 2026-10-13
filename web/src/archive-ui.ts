import {privacyEnabled} from './privacy';
import {MessageArchive,type ArchiveCursor,type ArchivePage} from './archive';
import {archiveFields,formatArchiveClause,parseArchiveQuery} from './archive-query';
import {SavedArchiveQueries} from './archive-saved';
import type {ChatMessage} from './protocol';
export class ArchiveSearch {
 private controller:AbortController|undefined;private generation=0;
 private input:HTMLInputElement;private channel:HTMLSelectElement;private results:HTMLElement;private status:HTMLElement;
 private previous=document.createElement('button');private next=document.createElement('button');private cancel=document.createElement('button');private coverage=document.createElement('p');
 private cursor:ArchiveCursor|undefined;private cursors:(ArchiveCursor|undefined)[]=[undefined];private page=0;private source='';private activeChannel='';private running=false;
 private saved=new SavedArchiveQueries();private savedList=document.createElement('select');private name=document.createElement('input');private savedStatus=document.createElement('p');private savedControls:HTMLButtonElement[]=[];
 private builderValue=document.createElement('input');private builderField=document.createElement('select');private negate=document.createElement('input');private account:string|undefined;
 constructor(private dialog:HTMLDialogElement,private trigger:HTMLButtonElement,private archive:Pick<MessageArchive,'searchPage'>,private channels:string[],private select:(message:ChatMessage)=>void,private bookmark?:(message:ChatMessage)=>void,private vod?:(message:ChatMessage)=>void){
  this.input=dialog.querySelector<HTMLInputElement>('#archive-query')!;this.channel=dialog.querySelector<HTMLSelectElement>('#archive-channel')!;this.results=dialog.querySelector<HTMLElement>('#archive-results')!;this.status=dialog.querySelector<HTMLElement>('#archive-status')!;
  for(const channel of channels){const option=document.createElement('option');option.value=channel;option.textContent='#'+channel;this.channel.append(option);}
  const builder=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent='Add a filter';builder.append(legend);
  for(const field of archiveFields){const option=document.createElement('option');option.value=field;option.textContent=field;this.builderField.append(option);}
  this.builderValue.maxLength=500;this.builderValue.placeholder='Value; comma separates alternatives';this.negate.type='checkbox';
  this.label(builder,'Archive filter',this.builderField);this.label(builder,'Filter value',this.builderValue);this.label(builder,'Exclude matches',this.negate);
  builder.append(this.button('Add filter',()=>{try{const field=archiveFields.find(f=>f===this.builderField.value)!;const values=field==='text'||field==='regex'?[this.builderValue.value]:this.builderValue.value.split(',').map(v=>v.trim());const clause=formatArchiveClause(field,values,this.negate.checked);const query=[this.input.value,clause].filter(Boolean).join(' ');parseArchiveQuery(query);this.input.value=query;this.builderValue.value='';this.status.textContent='Filter added; Search to apply';}catch(e){this.error(e);}}));
  const help=document.createElement('p');help.textContent='AND between filters; comma-separated alternatives use OR. Prefix - to exclude. Quote phrases, for example sender:alice,bob -badge:moderator text:"hello world". Dates use UTC midnight or ISO time with an offset. Regex supports at most one .* or .+ wildcard, no groups/backreferences, and checks the first 2,000 characters. Emotes use native IDs or literal case-sensitive message tokens. Moderation/deletion filters use retained notices or recorded deletion flags. source uses the supplied origin room ID; sourcebadge, reward, streak and effect match only supplied Twitch context. is:shared/reward/streak/effect test its presence.';
  this.input.closest('form')?.after(builder,help);
  const saved=document.createElement('fieldset');const savedLegend=document.createElement('legend');savedLegend.textContent='Saved queries';saved.append(savedLegend);
  this.name.maxLength=80;this.label(saved,'Saved query',this.savedList);this.label(saved,'Query name',this.name);
  for(const [name,action] of [
   ['Save query',()=>{const source=[this.input.value,this.channel.value?formatArchiveClause('channel',[this.channel.value]):''].filter(Boolean).join(' ');this.saved.save(this.name.value,source);this.paintSaved();this.savedStatus.textContent='Query saved locally';}],
   ['Run saved query',()=>{const entry=this.saved.list().find(q=>q.id===this.savedList.value);if(!entry)throw new Error('Select a saved query');this.input.value=entry.query;this.channel.value='';void this.search(new Event('submit'));}],
   ['Delete selected query',()=>{this.saved.delete(this.savedList.value);this.paintSaved();}],
   ['Delete all saved queries',()=>{this.saved.clear();this.paintSaved();}],
  ] as const){const button=this.button(name,()=>{try{if(privacyEnabled())return;action();}catch(e){this.savedStatus.textContent=e instanceof Error?e.message:'Saved query unavailable';}});this.savedControls.push(button);saved.append(button);}
  this.savedStatus.setAttribute('role','status');const savedNote=document.createElement('p');savedNote.textContent='Up to 20 queries on this device, isolated by signed-in account or signed-out profile. Names and query text stay private. Saving an existing name replaces its query. The selected Channel is included as a query filter.';saved.append(savedNote,this.savedStatus);this.results.before(saved);
  this.previous=this.button('Previous results',()=>{if(this.page>0){this.page--;void this.run(this.cursors[this.page]);}});this.next=this.button('Next results',()=>{if(this.cursor){this.cursors[++this.page]=this.cursor;void this.run(this.cursor);}});this.cancel=this.button('Cancel search',()=>{this.generation++;this.controller?.abort();this.running=false;this.status.textContent='Search cancelled';this.paintPaging();});this.results.before(this.previous,this.next,this.cancel,this.coverage);
  trigger.addEventListener('click',this.open);dialog.querySelector('#archive-close')?.addEventListener('click',this.close);dialog.querySelector('form')?.addEventListener('submit',this.search);dialog.addEventListener('close',this.closed);document.addEventListener('privacychange',this.privacy);window.addEventListener('storage',this.storage);this.paintSaved();this.paintPaging();
 }
 private label(root:HTMLElement,name:string,input:HTMLElement):void{const label=document.createElement('label');label.append(name+' ',input);input.setAttribute('aria-label',name);root.append(label);}
 private button(name:string,action:()=>void):HTMLButtonElement{const button=document.createElement('button');button.type='button';button.textContent=name;button.addEventListener('click',action);return button;}
 private error(error:unknown):void{this.status.textContent=error instanceof Error?error.message:'Local archive search unavailable; live chat continues';}
 setAccount(account:string|undefined):void{if(account===this.account)return;this.account=account;this.saved.setAccount(account);this.reset();this.paintSaved();}
 private reset():void{this.generation++;this.controller?.abort();this.running=false;this.cursor=undefined;this.cursors=[undefined];this.page=0;this.source='';this.input.value='';this.builderValue.value='';this.name.value='';this.results.replaceChildren();this.coverage.textContent='';this.status.textContent='';this.paintPaging();}
 private paintSaved():void{this.savedList.replaceChildren();const option=document.createElement('option');option.textContent='Select a saved query';option.value='';this.savedList.append(option);for(const b of this.savedControls)b.disabled=this.account===undefined||privacyEnabled();this.savedList.disabled=this.name.disabled=this.account===undefined||privacyEnabled();this.savedStatus.textContent='';if(privacyEnabled())return;try{for(const entry of this.saved.list()){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.name;this.savedList.append(option);}}catch(e){this.savedStatus.textContent=e instanceof Error?e.message:'Saved queries could not be read';}}
 private paintPaging():void{this.previous.disabled=this.running||this.page===0||privacyEnabled();this.next.disabled=this.running||!this.cursor||privacyEnabled();this.cancel.disabled=!this.running;}
 show(channel?:string):void{if(privacyEnabled())return;this.channel.value=channel&&this.channels.includes(channel)?channel:'';this.paintSaved();this.dialog.showModal();this.input.focus();}
 private open=():void=>this.show();
 private close=():void=>this.dialog.close();
 private closed=():void=>{this.generation++;this.controller?.abort();this.running=false;this.paintPaging();this.trigger.focus();};
 private privacy=():void=>{if(privacyEnabled()){this.reset();if(this.dialog.open)this.dialog.close();}this.paintSaved();};
 private storage=(event:StorageEvent):void=>{if(event.key===this.saved.key)this.paintSaved();this.privacy();};
 private search=async(event:Event):Promise<void>=>{event.preventDefault();if(privacyEnabled())return;this.source=this.input.value;this.activeChannel=this.channel.value;this.page=0;this.cursors=[undefined];await this.run();};
 private async run(cursor?:ArchiveCursor):Promise<void>{
  if(privacyEnabled())return;this.controller?.abort();const controller=this.controller=new AbortController(),generation=++this.generation;this.cursor=undefined;this.results.replaceChildren();this.coverage.textContent='';
  try{
   const query=parseArchiveQuery(this.source);this.running=true;this.paintPaging();this.status.textContent='Searching retained local messages…';
   const result=await this.archive.searchPage({text:'',channels:this.channels,...(this.activeChannel?{channel:this.activeChannel}:{}),matches:query.matches,limit:100},cursor,controller.signal,count=>{if(generation===this.generation)this.status.textContent='Searching retained local messages… '+count.toLocaleString()+' rows scanned';});
   if(generation!==this.generation||privacyEnabled())return;this.cursor=result.next;this.paintResults(result);
  }catch(error){if(generation===this.generation&&!controller.signal.aborted)this.error(error);}
  finally{if(generation===this.generation){this.running=false;this.paintPaging();}}
 }
 private paintResults(result:ArchivePage):void{
  this.status.textContent=`Page ${this.page+1} · ${result.messages.length} matches${result.next?' · more results available':' · end of results'}`;
  const bounds=result.bounds;this.coverage.textContent=bounds.rows?`This device retains ${bounds.rows.toLocaleString()} public rows across all channels, ${new Date(bounds.oldest!).toLocaleString()} → ${new Date(bounds.newest!).toLocaleString()}. Results are limited to joined channels. ${result.scanned.toLocaleString()} rows scanned on this page. Gaps and unsaved chat are unavailable; these boundaries do not prove continuous coverage.`:'No public messages retained on this device.';
  for(const message of result.messages){const button=document.createElement('button');button.type='button';button.className='archive-result';button.textContent=`${new Date(message.timestamp).toLocaleString()} · #${message.channel} · ${message.login}: ${message.text||message.tags['system-msg']||message.command}`;button.addEventListener('click',()=>{if(privacyEnabled())return;this.select(message);this.dialog.close();});this.results.append(button);if(this.bookmark){const mark=this.button('Bookmark result',()=>{if(!privacyEnabled())this.bookmark?.(message);});this.results.append(mark);}if(this.vod)this.results.append(this.button('VOD context',()=>{if(!privacyEnabled()){this.dialog.close();this.vod?.(message);}}));}
 }
 stop():void{this.controller?.abort();this.generation++;this.trigger.removeEventListener('click',this.open);this.dialog.querySelector('#archive-close')?.removeEventListener('click',this.close);this.dialog.querySelector('form')?.removeEventListener('submit',this.search);this.dialog.removeEventListener('close',this.closed);document.removeEventListener('privacychange',this.privacy);window.removeEventListener('storage',this.storage);}
}
