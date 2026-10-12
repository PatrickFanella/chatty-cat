import {ColumnLog} from './column-log';
import {VirtualLog,type LogItem} from './virtual-log';
import {SplitLayout,type SplitPane} from './splits';
import {registerSettings} from './settings-bundle';
import {privacyEnabled} from './privacy';

interface PaneView {pane:SplitPane;root:HTMLElement;view:VirtualLog;items:readonly LogItem[];restore:boolean;unread:HTMLElement;send:HTMLButtonElement}
interface SplitActions {target:(channel:string)=>void;changed:()=>void;popout:(pane:string)=>void;canChange?:()=>boolean}
function button(label:string,action:()=>void):HTMLButtonElement{const node=document.createElement('button');node.type='button';node.textContent=label;node.addEventListener('click',action);return node;}

// One source transcript feeds every pane; only visible tabs mount virtual readers.
export class SplitLog {
 readonly layout:SplitLayout;
 private legacy:ColumnLog|undefined;
 private views:PaneView[]=[];
 private signature='';
 private contexts=new Map<string,{keys:string[];items:readonly LogItem[]}>();
 private following=true;
 private tabs:HTMLElement|undefined;
 private grid:HTMLElement|undefined;
 private paneSelect:HTMLSelectElement|undefined;
 private status:HTMLElement;
 private dialog:HTMLDialogElement;
 private stopSettings:()=>void;
 private stopped=false;
 private observed=new Set<string>();
 private keyboardManaged=false;
 constructor(private root:HTMLElement,private toggle:HTMLButtonElement,private joined:readonly string[],private actions:SplitActions,private popoutID=''){
  this.layout=new SplitLayout(joined);this.status=document.createElement('p');this.status.className='split-status';this.status.setAttribute('role','status');
  this.dialog=document.createElement('dialog');this.dialog.id='split-settings';this.dialog.setAttribute('aria-label','Pane settings');document.body.append(this.dialog);
  this.legacy=new ColumnLog(root);toggle.addEventListener('click',this.toggleLayout);root.addEventListener('pointerdown',this.pointer);root.addEventListener('keydown',this.key);
  this.stopSettings=registerSettings('splits',()=>this.snapshot(),value=>{if(this.layout.restore(value)){if(this.popoutID)this.narrowPopout();this.rebuild();this.actions.changed();}else this.status.textContent='Saved pane layout is invalid; the current view was retained';});
  if(popoutID)toggle.hidden=true;
 }
 private narrowPopout():void {
  const state=this.layout.snapshot(),tab=state.tabs.find(t=>t.panes.some(p=>p.id===this.popoutID)),pane=tab?.panes.find(p=>p.id===this.popoutID);
  if(!tab||!pane){this.status.textContent='This pane is no longer saved in the workspace';return;}
  this.layout.restore({...state,enabled:true,active:tab.id,tabs:[{...tab,active:pane.id,panes:[pane]}],closed:[]});
 }
 private snapshot():unknown{this.captureReaders();return this.layout.snapshot();}
 private captureReaders():void{for(const entry of this.views)entry.pane.reader=entry.view.readerPosition()??null;}
 private canChange():boolean{if(this.actions.canChange?.()===false){this.status.textContent='Wait for the current send outcome before changing panes';return false;}return true;}
 private run(action:()=>void):void{if(!this.canChange())return;this.captureReaders();const previous=this.layout.activePane.id;try{action();if(previous!==this.layout.activePane.id)this.actions.target(this.layout.activePane.target);this.status.textContent='';this.rebuild();this.actions.changed();}catch(error){this.status.textContent=error instanceof Error?error.message:'Layout change failed';}}
 private toggleLayout=():void=>{if(this.popoutID)return;this.run(()=>this.layout.enable(!this.layout.enabled));};
 private rebuild():void{this.signature='';}
 private clear():void{this.legacy?.stop();this.legacy=undefined;for(const entry of this.views)entry.view.stop();this.views=[];this.root.replaceChildren();this.root.classList.remove('page-columns');}
 private paintLayout():void {
  const signature=this.layout.enabled?'split:'+this.layout.activeTab.id+':'+this.layout.activeTab.panes.map(p=>p.id+':'+p.channels.join(',')+':'+p.filter+':'+p.reverse+':'+p.pauseHover).join('|'):'legacy';
  if(signature===this.signature)return;
  this.clear();this.signature=signature;this.toggle.setAttribute('aria-pressed',String(this.layout.enabled));this.root.classList.toggle('independent-splits',this.layout.enabled);
  const ids=new Set(this.layout.tabs.flatMap(tab=>tab.panes.map(p=>p.id)));for(const id of this.contexts.keys())if(!ids.has(id))this.contexts.delete(id);
  if(!this.layout.enabled){this.legacy=new ColumnLog(this.root);return;}
  this.tabs=document.createElement('div');this.tabs.className='split-tabs';this.tabs.setAttribute('role','tablist');this.tabs.setAttribute('aria-label','Chat layouts');
  for(const tab of this.layout.tabs){const node=button(tab.name,()=>this.run(()=>{this.layout.selectTab(tab.id);this.actions.target(this.layout.activePane.target);}));node.dataset.tab=tab.id;node.setAttribute('role','tab');this.tabs.append(node);}
  this.root.append(this.tabs);
  this.paneSelect=document.createElement('select');this.paneSelect.className='split-select';this.paneSelect.setAttribute('aria-label','Active chat pane');
  for(const [index,pane] of this.layout.activeTab.panes.entries()){const option=document.createElement('option');option.value=pane.id;option.textContent=(index+1)+': '+pane.channels.join(', ');this.paneSelect.append(option);}
  this.paneSelect.addEventListener('change',()=>this.activate(this.paneSelect!.value,true));this.root.append(this.paneSelect);
  if(!this.popoutID){const controls=document.createElement('details');controls.className='split-actions';const summary=document.createElement('summary');summary.textContent='Layout actions';controls.append(summary);
   const row=document.createElement('div');controls.append(row);
   row.append(button('New tab',()=>this.run(()=>this.layout.addTab())),button('Duplicate tab',()=>this.run(()=>this.layout.duplicateTab(this.layout.activeTab.id))),button('Rename tab',()=>this.rename()),button('Tab left',()=>this.run(()=>this.layout.moveTab(this.layout.activeTab.id,-1))),button('Tab right',()=>this.run(()=>this.layout.moveTab(this.layout.activeTab.id,1))),button('Close tab',()=>this.run(()=>this.layout.closeTab(this.layout.activeTab.id))),button('Add pane',()=>this.run(()=>this.layout.addPane())),button('Reopen closed',()=>this.run(()=>this.layout.reopen())));
   this.root.append(controls);
  }
  this.root.append(this.status);this.grid=document.createElement('div');this.grid.className='split-grid';this.root.append(this.grid);
  this.layout.activeTab.panes.forEach((pane,index)=>{
   const section=document.createElement('section');section.className='split-pane';section.dataset.pane=pane.id;
   const header=document.createElement('div');header.className='split-heading';const focus=button(pane.channels.join(', '),()=>this.activate(pane.id,true));focus.title='Focus pane; send to '+pane.target;header.append(focus);
   const unread=document.createElement('span');unread.className='split-unread';header.append(unread);
   const send=button('Send: '+pane.target,()=>{this.activate(pane.id,true);document.getElementById('message')?.focus();});header.append(send);
   header.append(button('Live',()=>{const entry=this.views.find(v=>v.pane.id===pane.id);this.contexts.delete(pane.id);entry?.view.resume();if(entry)entry.restore=false;pane.reader=null;pane.unread=0;this.actions.changed();}));
   if(!this.popoutID){header.append(button('Settings',()=>this.configure(pane.id)),button('Copy',()=>this.run(()=>this.layout.duplicatePane(pane.id))),button('←',()=>this.run(()=>this.layout.movePane(pane.id,-1))),button('→',()=>this.run(()=>this.layout.movePane(pane.id,1))),button('Pop out',()=>this.actions.popout(pane.id)),button('Close',()=>this.run(()=>this.layout.closePane(pane.id))));
    const label=document.createElement('label');label.textContent='Width ';const range=document.createElement('input');range.type='range';range.min='1';range.max='4';range.step='.25';range.value=String(pane.weight);range.setAttribute('aria-label','Pane width: '+pane.channels.join(', '));range.addEventListener('input',()=>{this.layout.resize(pane.id,Number(range.value));this.paintActive();});label.append(range);header.append(label);
   }
   const reader=document.createElement('div');reader.className='split-reader';reader.tabIndex=0;reader.setAttribute('aria-label','Chat: '+pane.channels.join(', '));section.append(header,reader);this.grid!.append(section);
   this.views.push({pane,root:reader,view:new VirtualLog(reader,'split:'+index),items:[],restore:!!pane.reader,unread,send});
  });
  this.paintActive();
 }
 private paintActive():void{
  if(this.paneSelect)this.paneSelect.value=this.layout.activePane.id;
  for(const node of this.tabs?.querySelectorAll<HTMLElement>('[data-tab]')??[]){const tab=this.layout.tabs.find(t=>t.id===node.dataset.tab);if(!tab)continue;const count=tab.panes.reduce((sum,p)=>sum+p.unread,0),active=tab.id===this.layout.activeTab.id;node.textContent=tab.name+(count?' ('+count+')':'');node.setAttribute('aria-selected',String(active));node.tabIndex=active?0:-1;}
  for(const entry of this.views){const section=entry.root.parentElement!;section.dataset.active=String(entry.pane.id===this.layout.activePane.id);section.style.flex=String(entry.pane.weight)+' 1 0';entry.unread.textContent=entry.pane.unread?'Unread '+entry.pane.unread:'';entry.send.textContent='Send: '+entry.pane.target;}
 }
 private activate(id:string,send:boolean):void{if(send&&!this.canChange()){this.paintActive();return;}const changed=this.layout.activePane.id!==id;this.layout.selectPane(id);if(send)this.actions.target(this.layout.activePane.target);this.paintActive();if(send||changed)this.actions.changed();}
 private pointer=(event:PointerEvent):void=>{if(!this.layout.enabled||!(event.target instanceof Element))return;const pane=event.target.closest<HTMLElement>('[data-pane]');if(pane)this.activate(pane.dataset.pane!,true);};
 private key=(event:KeyboardEvent):void=>{
  if(!this.layout.enabled||event.isComposing||event.ctrlKey||event.metaKey||event.target instanceof Element&&event.target.closest('input,select,textarea'))return;
  if(event.target instanceof Element&&event.target.closest('[role=tab]')&&!event.altKey&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){event.preventDefault();this.switchTab(event.key==='ArrowLeft'?-1:1);return;}
  if(this.keyboardManaged)return;
  if(!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
  const delta=event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1;
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){if(event.shiftKey&&!this.popoutID)this.run(()=>this.layout.moveTab(this.layout.activeTab.id,delta));else this.switchTab(delta);}
  else if(event.shiftKey&&!this.popoutID)this.run(()=>this.layout.movePane(this.layout.activePane.id,delta));
  else{const panes=this.layout.activeTab.panes,index=panes.findIndex(p=>p.id===this.layout.activePane.id),next=panes[(index+delta+panes.length)%panes.length]!;this.activate(next.id,true);this.views.find(v=>v.pane.id===next.id)?.root.focus();}
 };
 private switchTab(delta:number):void{const tabs=this.layout.tabs,index=tabs.findIndex(t=>t.id===this.layout.activeTab.id);this.run(()=>{this.layout.selectTab(tabs[(index+delta+tabs.length)%tabs.length]!.id);this.actions.target(this.layout.activePane.target);});this.paintLayout();this.tabs?.querySelector<HTMLElement>('[aria-selected=true]')?.focus();}
 private rename():void{if(privacyEnabled())return;this.dialog.replaceChildren();const form=document.createElement('form'),input=document.createElement('input');input.value=this.layout.activeTab.name;input.maxLength=60;input.setAttribute('aria-label','Tab name');const submit=button('Save',()=>{this.run(()=>this.layout.renameTab(this.layout.activeTab.id,input.value));if(!this.status.textContent)this.dialog.close();});form.append(input,submit,button('Cancel',()=>this.dialog.close()));form.addEventListener('submit',event=>{event.preventDefault();submit.click();});this.dialog.append(form);this.dialog.showModal();}
 private configure(id:string):void {
  if(privacyEnabled()||!this.canChange())return;const pane=this.layout.activeTab.panes.find(p=>p.id===id);if(!pane)return;this.dialog.replaceChildren();const form=document.createElement('form');form.className='split-form';
  const channels=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent='Display channels';channels.append(legend);
  const checks=this.joined.map(channel=>{const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.value=channel;check.checked=pane.channels.includes(channel);label.append(check,channel);channels.append(label);return check;});
  const target=document.createElement('select');target.setAttribute('aria-label','Pane send target');for(const channel of this.joined){const option=document.createElement('option');option.value=channel;option.textContent=channel;target.append(option);}target.value=pane.target;
  const filter=document.createElement('input');filter.type='search';filter.maxLength=200;filter.value=pane.filter;filter.setAttribute('aria-label','Pane text filter');filter.placeholder='Only messages containing…';
  const checkbox=(text:string,on:boolean):{label:HTMLLabelElement;input:HTMLInputElement}=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=on;label.append(input,text);return {label,input};};
  const reverse=checkbox('Newest first',pane.reverse),hover=checkbox('Pause on hover',pane.pauseHover);const error=document.createElement('p');error.setAttribute('role','status');
  const save=button('Apply pane settings',()=>{this.captureReaders();try{this.layout.configure(id,{channels:checks.filter(c=>c.checked).map(c=>c.value),target:target.value,filter:filter.value,reverse:reverse.input.checked,pauseHover:hover.input.checked});if(this.layout.activePane.id===id)this.actions.target(target.value);this.rebuild();this.dialog.close();this.actions.changed();}catch(e){error.textContent=e instanceof Error?e.message:'Invalid pane';}});
  form.append(channels,target,filter,reverse.label,hover.label,error,save,button('Cancel',()=>this.dialog.close()));form.addEventListener('submit',event=>{event.preventDefault();save.click();});this.dialog.append(form);this.dialog.showModal();
 }
 set(items:readonly LogItem[],following:boolean,revision=0,reverse=false,mode=1,pauseHover=false):void {
  if(this.stopped)return;this.following=following;this.paintLayout();
  if(this.legacy){this.legacy.set(items,following,revision,reverse,mode,pauseHover);return;}
  for(const entry of this.views){const p=entry.pane,filter=p.filter.toLowerCase(),context=this.contexts.get(p.id);entry.items=context?.items??items.filter(item=>p.channels.includes(item.channel??item.key.split(':')[0]!)&&(!filter||(item.text??'').toLowerCase().includes(filter)));
   // Main's source order follows its global display setting; panes own theirs.
   const visible=!(innerWidth<=650||innerHeight>=innerWidth)||p.id===this.layout.activePane.id;
   if(reverse!==p.reverse)entry.items=[...entry.items].reverse();entry.view.set(entry.items,following&&!context&&visible,revision,p.reverse,p.pauseHover);
   if(entry.restore&&p.reader&&entry.view.restoreReader(p.reader))entry.restore=false;
   if(entry.view.isFollowing()&&!entry.view.pausedByHover()&&!entry.restore)p.unread=0;
  }
  this.paintActive();
 }
 observe(channel:string,text:string,key?:string):void{if(!this.layout.enabled)return;if(key){if(this.observed.has(key))return;this.observed.add(key);if(this.observed.size>5000)this.observed.delete(this.observed.values().next().value!);}for(const tab of this.layout.tabs)for(const pane of tab.panes){if(!pane.channels.includes(channel)||pane.filter&&!text.toLowerCase().includes(pane.filter.toLowerCase()))continue;const entry=this.views.find(v=>v.pane.id===pane.id);if(tab.id!==this.layout.activeTab.id||!entry||!entry.view.isFollowing()||entry.view.pausedByHover()||entry.restore)pane.unread=Math.min(9999,pane.unread+1);}this.paintActive();}
 finishReaderRestore():void{for(const entry of this.views)if(entry.restore){entry.restore=false;entry.pane.reader=null;this.status.textContent='Some pane reader positions are no longer in retained history';}}
 private active():PaneView|undefined{return this.views.find(v=>v.pane.id===this.layout.activePane.id);}
 manageKeyboard():void{this.keyboardManaged=true;}
 hold():void{this.active()?.view.hold();}
 selectPane(id:string):void{this.activate(id,true);if(this.layout.activePane.id===id)this.views.find(v=>v.pane.id===id)?.root.focus();}
 selectTab(id:string):void{this.run(()=>this.layout.selectTab(id));}
 updateTarget(channel:string):void{if(this.layout.enabled&&this.layout.activePane.channels.includes(channel)){this.layout.activePane.target=channel;this.paintActive();}}
 focusChannel(channel:string):void{if(!this.canChange())return;if(this.popoutID&&!this.layout.activePane.channels.includes(channel)){this.status.textContent='This popout is limited to its saved pane';return;}if(!this.layout.enabled){this.actions.target(channel);return;}const tab=this.layout.tabs.find(t=>t.panes.some(p=>p.channels.includes(channel))),pane=this.layout.activePane.channels.includes(channel)?this.layout.activePane:tab?.panes.find(p=>p.channels.includes(channel));if(pane){this.run(()=>{pane.target=channel;this.layout.selectPane(pane.id);});this.actions.target(channel);}else this.run(()=>{const next=this.layout.activeTab.panes.length<6?this.layout.addPane():this.layout.addTab(channel).panes[0]!;this.layout.configure(next.id,{channels:[channel],target:channel,filter:'',reverse:false,pauseHover:true});});}
 moveFocus(kind:'pane'|'tab',delta:number):void{if(!this.layout.enabled)return;if(kind==='tab')this.switchTab(delta);else{const panes=this.layout.activeTab.panes,index=panes.findIndex(p=>p.id===this.layout.activePane.id);this.selectPane(panes[(index+delta+panes.length)%panes.length]!.id);}}
 rearrange(kind:'pane'|'tab',delta:number):void{if(!this.layout.enabled||this.popoutID)return;this.run(()=>kind==='pane'?this.layout.movePane(this.layout.activePane.id,delta):this.layout.moveTab(this.layout.activeTab.id,delta));}
 hasContexts():boolean{return this.contexts.size>0;}
 contextKeys():Set<string>{return new Set([...this.contexts.values()].flatMap(context=>context.keys));}
 refreshContexts(make:(keys:readonly string[])=>readonly LogItem[]):void{for(const context of this.contexts.values())context.items=make(context.keys);}
 private at(target:EventTarget|null):PaneView|undefined{return target instanceof Node?this.views.find(v=>v.root===target||v.root.contains(target)):undefined;}
 hoverPaused(target:EventTarget|null):boolean{return this.legacy?.hoverPaused(target)??this.at(target)?.view.pausedByHover()??false;}
 trackScroll(target:EventTarget|null,following:boolean):boolean{if(this.legacy)return this.legacy.trackScroll(target,following);return following;}
 readerPositions():{column:number;key:string;offset:number}[]{return this.legacy?.readerPositions()??[];}
 restoreReaders(positions:readonly {column:number;key:string;offset:number}[]):boolean{return this.legacy?.restoreReaders(positions)??true;}
 private visible(entry:PaneView):boolean{return !(innerWidth<=650||innerHeight>=innerWidth)||entry.pane.id===this.layout.activePane.id;}
 hasManualPause():boolean{return this.legacy?.hasManualPause()??this.views.some(v=>this.visible(v)&&!v.view.isFollowing());}
 allFollowing():boolean{return this.legacy?.allFollowing()??(this.following&&this.views.filter(v=>this.visible(v)).every(v=>v.view.isFollowing()&&!v.restore));}
 resume():void{if(this.legacy){this.legacy.resume();return;}const entry=this.active();if(entry)this.contexts.delete(entry.pane.id);entry?.view.resume();if(entry){entry.restore=false;entry.pane.reader=null;entry.pane.unread=0;}}
 showContext(items:readonly LogItem[],keys=items.map(item=>item.key)):void{if(!this.layout.enabled||!keys.length)return;const channel=items[0]?.channel??keys[0]?.split(':')[0];const tab=this.layout.tabs.find(t=>t.panes.some(p=>p.channels.includes(channel??''))),pane=this.layout.activePane.channels.includes(channel??'')?this.layout.activePane:tab?.panes.find(p=>p.channels.includes(channel??''));if(pane){this.captureReaders();this.activate(pane.id,false);this.contexts.set(pane.id,{keys:[...keys].slice(0,501),items});this.rebuild();}}
 edgeKey(last:boolean):string|undefined{return this.legacy?.edgeKey(last)??this.active()?.view.edgeKey(last);}
 moveKey(current:string|undefined,delta:number):string|undefined{return this.legacy?.moveKey(current,delta)??this.active()?.view.moveKey(current,delta);}
 reveal(key:string):boolean{if(this.legacy)return this.legacy.reveal(key);const entry=this.active()?.items.some(i=>i.key===key)?this.active():this.views.find(v=>v.items.some(i=>i.key===key));if(!entry)return false;this.activate(entry.pane.id,false);return entry.view.reveal(key);}
 stop():void{if(this.stopped)return;this.stopped=true;this.stopSettings();this.toggle.removeEventListener('click',this.toggleLayout);this.root.removeEventListener('pointerdown',this.pointer);this.root.removeEventListener('keydown',this.key);this.dialog.remove();this.clear();}
}
