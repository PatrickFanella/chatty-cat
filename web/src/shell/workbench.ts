// Workbench: wraps the chat column in dock zones and lets any dialog or panel be docked, floated, resized and dragged.
// Feature modules keep owning their panel contents and their open/close logic; the workbench only moves the root element
// and injects a small chrome bar. A docked or floating <dialog> is open non-modally; showModal() is redirected for it.
import {Box,Layout,ZoneName,ZONES,dock,emptyLayout,fit,float,moveWithin,parseLayout,placementOf,release,resizeZone,setClosed,setShares} from './layout';
import {closeMenus,openMenu} from './menu';
import {profileKey} from '../account-profiles';
import {registerSettings} from '../settings-bundle';
export interface WorkbenchOptions {
 titleFor:(root:HTMLElement)=>string;
 exclude:(root:HTMLElement)=>boolean;
 /** Elements moved into the centre column, in document order. */
 centre:string;
}
interface Managed {id:string;root:HTMLElement;chrome:HTMLElement;wrapper:HTMLElement;home:{parent:Node;next:Node|null};title:HTMLElement}
const ZONE_LABELS:Record<ZoneName,string>={left:'left side',right:'right side',bottom:'bottom'};
let patched=false;
function patchDialogs():void {
 if(patched||typeof HTMLDialogElement==='undefined')return;patched=true;
 const native=HTMLDialogElement.prototype.showModal;
 HTMLDialogElement.prototype.showModal=function(this:HTMLDialogElement){
  if(this.dataset.wbPlaced){if(!this.open)this.show();this.dispatchEvent(new Event('wb-reopen'));return;}
  native.call(this);
 };
}
function isOpen(root:HTMLElement):boolean {return root instanceof HTMLDialogElement?root.open:!root.hidden;}
function viewport():{width:number;height:number} {return {width:innerWidth,height:innerHeight};}
export class Workbench {
 readonly root=document.createElement('div');
 private row=document.createElement('div');
 private centre=document.createElement('div');
 private zones={} as Record<ZoneName,HTMLElement>;
 private splitters={} as Record<ZoneName,HTMLElement>;
 private layout:Layout;
 private managed=new Map<string,Managed>();
 private observer:MutationObserver|undefined;
 private transition=0;
 private anonymous=0;
 private drag:{id:number;managed:Managed;startX:number;startY:number;origin?:Box|undefined;active:boolean;target?:{zone:ZoneName;index:number}|undefined}|undefined;
 private zoneDrag:{id:number;zone:ZoneName}|undefined;
 private shareDrag:{id:number;zone:ZoneName;prev:string;next:string;start:number;length:number}|undefined;
 private bundleDispose:()=>void;
 constructor(private options:WorkbenchOptions){
  patchDialogs();
  this.layout=this.load();
  this.root.id='workbench';this.row.className='wb-row';this.centre.className='wb-centre';
  for(const zone of ZONES){
   const element=document.createElement('div');element.className='wb-zone';element.dataset.zone=zone;element.hidden=true;element.setAttribute('aria-label',`Docked panels, ${ZONE_LABELS[zone]}`);this.zones[zone]=element;
   const splitter=document.createElement('div');splitter.className='wb-splitter';splitter.dataset.zone=zone;splitter.hidden=true;splitter.tabIndex=0;splitter.setAttribute('role','separator');splitter.setAttribute('aria-orientation',zone==='bottom'?'horizontal':'vertical');splitter.setAttribute('aria-label',`Resize ${ZONE_LABELS[zone]} panels`);this.splitters[zone]=splitter;
   splitter.addEventListener('pointerdown',this.zoneDown);splitter.addEventListener('pointermove',this.zoneMove);splitter.addEventListener('pointerup',this.zoneUp);splitter.addEventListener('pointercancel',this.zoneUp);splitter.addEventListener('keydown',this.zoneKey);
  }
  this.row.append(this.zones.left,this.splitters.left,this.centre,this.splitters.right,this.zones.right);
  this.root.append(this.row,this.splitters.bottom,this.zones.bottom);
  const first=document.body.querySelector(options.centre);(first??document.body.firstChild)?.before(this.root);
  for(const element of [...document.body.querySelectorAll(options.centre)])if(element.parentElement===document.body)this.centre.append(element);
  this.bundleDispose=registerSettings('workbench',()=>this.layout,value=>{this.layout=parseLayout(value,viewport());this.render();this.save();});
  window.addEventListener('resize',this.resized);
  if(typeof MutationObserver!=='undefined'){this.observer=new MutationObserver(this.mutated);this.observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open','hidden']});}
  this.render();
 }
 /** Adopt a panel root now (static panels); runtime dialogs are adopted when they first open. */
 adopt(root:HTMLElement):void {this.manage(root);}
 releaseAll(ids:readonly string[]):void {for(const id of ids)if(this.managed.has(id)){this.layout=release(this.layout,id);}this.render();this.save();}
 private railMode=0;
 private railOpened=new Set<string>();
 /** The display option "columns and rail" (4: video, emotes and stats; 5: video and emotes; 6: emotes) docks those panels on the right. */
 setRail(mode:number,panels:readonly {name:string;root:HTMLElement;show:(open:boolean)=>void}[]):void {
  const effective=innerWidth>innerHeight&&mode>=4?mode:0;if(effective===this.railMode)return;
  const entering=this.railMode===0,leaving=effective===0;this.railMode=effective;
  const video=new URL(location.href).searchParams.get('video')??'';
  for(const panel of panels){
   const included=effective!==0&&(panel.name==='emotes'||panel.name==='video'&&effective<=5&&!['off','0'].includes(video)&&!(effective===4&&video==='float')||panel.name==='stats'&&effective===4);
   const entry=this.manage(panel.root);const place=placementOf(this.layout,entry.id);
   if(included){if(place.kind==='modal'||entering&&this.layout.closed.includes(entry.id))this.layout=dock(this.layout,entry.id,'right');this.layout=setClosed(this.layout,entry.id,false);this.render();if(!isOpen(panel.root)){this.railOpened.add(panel.name);panel.show(true);}}
   else if(leaving&&place.kind==='docked'&&place.zone==='right'){if(this.railOpened.has(panel.name)){this.transition++;try{panel.show(false);}finally{this.transition--;}}this.layout=release(this.layout,entry.id);}
   if(leaving)this.railOpened.delete(panel.name);
  }
  this.render();this.save();
 }
 placementLabel(id:string):string {const place=placementOf(this.layout,id);return place.kind==='docked'?`docked ${ZONE_LABELS[place.zone]}`:place.kind;}
 private load():Layout {try{return parseLayout(JSON.parse(localStorage.getItem(profileKey('chatthing:v1:workbench'))??'null'),viewport());}catch{return emptyLayout();}}
 private save():void {try{localStorage.setItem(profileKey('chatthing:v1:workbench'),JSON.stringify(this.layout));}catch{/* optional storage */}}
 private mutated=(records:MutationRecord[]):void=>{
  for(const record of records){
   const target=record.target;if(!(target instanceof HTMLElement))continue;
   if(record.attributeName==='open'&&target instanceof HTMLDialogElement&&target.open&&!this.options.exclude(target)&&!target.closest('#workbench .wb-chrome'))this.manage(target);
   const entry=target.id?this.managed.get(target.id):undefined;if(!entry||this.transition)continue;
   const open=isOpen(target);if(placementOf(this.layout,entry.id).kind!=='modal'){this.layout=setClosed(this.layout,entry.id,!open);entry.wrapper.hidden=!open;if(open)this.focusPanel(entry);this.save();this.syncZones();}
  }
 };
 private manage(root:HTMLElement):Managed {
  if(!root.id)root.id='wb-panel-'+(++this.anonymous);
  const existing=this.managed.get(root.id);if(existing){if(existing.chrome.parentNode!==root)root.prepend(existing.chrome);existing.title.textContent=this.options.titleFor(root);return existing;}
  const chrome=document.createElement('div');chrome.className='wb-chrome';chrome.setAttribute('role','toolbar');chrome.setAttribute('aria-label','Panel layout');
  const title=document.createElement('span');title.className='wb-title';title.tabIndex=0;title.textContent=this.options.titleFor(root);title.title='Drag to move; arrow keys move a floating panel';
  const menu=document.createElement('button');menu.type='button';menu.className='wb-menu';menu.setAttribute('aria-label','Panel placement');menu.setAttribute('aria-haspopup','menu');menu.textContent='⋯';
  const close=document.createElement('button');close.type='button';close.className='wb-close';close.setAttribute('aria-label','Close panel');close.textContent='×';
  chrome.append(title,menu,close);root.prepend(chrome);
  const wrapper=document.createElement('div');wrapper.className='wb-panel';wrapper.dataset.panel=root.id;
  const entry:Managed={id:root.id,root,chrome,wrapper,home:{parent:root.parentNode??document.body,next:root.nextSibling},title};
  this.managed.set(root.id,entry);
  menu.addEventListener('click',()=>this.openMenu(entry,menu));
  close.addEventListener('click',()=>this.closePanel(entry));
  title.addEventListener('pointerdown',event=>this.titleDown(entry,event));title.addEventListener('pointermove',this.titleMove);title.addEventListener('pointerup',this.titleUp);title.addEventListener('pointercancel',this.titleUp);
  title.addEventListener('keydown',event=>this.titleKey(entry,event));
  root.addEventListener('wb-reopen',()=>{if(placementOf(this.layout,entry.id).kind==='modal')return;this.layout=setClosed(this.layout,entry.id,false);entry.wrapper.hidden=false;this.save();this.syncZones();this.focusPanel(entry);});
  if(placementOf(this.layout,entry.id).kind!=='modal')this.render();
  return entry;
 }
 private focusPanel(entry:Managed):void {const target=entry.root.querySelector<HTMLElement>('input:not([type=hidden]),select,textarea,button:not(.wb-chrome button)');(target??entry.title).focus({preventScroll:true});}
 private closePanel(entry:Managed):void {
  const own=entry.root.querySelector<HTMLButtonElement>(':scope > button[id$="-close"],:scope > [data-action="close"],:scope > * > button[id$="-close"],:scope > * > [data-action="close"]');
  if(own&&!own.disabled){own.click();return;}
  if(entry.root instanceof HTMLDialogElement)entry.root.close();else entry.root.hidden=true;
 }
 private openMenu(entry:Managed,anchor:HTMLElement):void {
  const place=placementOf(this.layout,entry.id);
  const dockItems=ZONES.map(zone=>({label:`Dock ${ZONE_LABELS[zone]}`,checked:place.kind==='docked'&&place.zone===zone,run:()=>this.apply(dock(this.layout,entry.id,zone))}));
  const items=[
   ...dockItems,
   {label:'Float',checked:place.kind==='floating',run:()=>this.floatPanel(entry)},
   {label:'Open as dialog',checked:place.kind==='modal',run:()=>this.restoreModal(entry)},
  ];
  const order=place.kind==='docked'?[{label:place.zone==='bottom'?'Move left':'Move up',run:()=>this.apply(moveWithin(this.layout,entry.id,-1))},{label:place.zone==='bottom'?'Move right':'Move down',run:()=>this.apply(moveWithin(this.layout,entry.id,1))}]:[];
  openMenu(anchor,[{title:'Placement',items},{items:order},{items:[{label:'Close',run:()=>this.closePanel(entry)}]}],{align:'end',label:'Panel placement'});
 }
 private apply(layout:Layout):void {this.layout=layout;this.render();this.save();}
 private floatPanel(entry:Managed,box?:Box):void {
  const rect=(placementOf(this.layout,entry.id).kind==='modal'?entry.root:entry.wrapper).getBoundingClientRect();
  const size=box??{left:rect.left,top:rect.top,width:Math.min(rect.width||480,Math.max(320,innerWidth*.45)),height:Math.min(rect.height||400,Math.max(240,innerHeight*.6))};
  this.apply(float(this.layout,entry.id,size,viewport()));
 }
 private restoreModal(entry:Managed):void {this.apply(release(this.layout,entry.id));if(entry.root instanceof HTMLDialogElement&&entry.root.open){this.transition++;try{entry.root.close();entry.root.showModal();}finally{this.transition--;}}}
 /** Rebuild the DOM from the layout. Roots keep their identity; only wrappers move. */
 private render():void {
  const view=viewport();
  for(const zone of ZONES){const size=this.layout.sizes[zone];this.root.style.setProperty(`--wb-${zone}`,Math.min(size,(zone==='bottom'?view.height:view.width)*.6)+'px');}
  for(const entry of this.managed.values()){
   const place=placementOf(this.layout,entry.id);
   if(place.kind==='modal'){
    if(entry.root.dataset.wbPlaced){
     this.transition++;try{
      const wasOpen=entry.root instanceof HTMLDialogElement&&entry.root.open;
      delete entry.root.dataset.wbPlaced;if(entry.root.dataset.rail==='true'&&entry.root.dataset.wbRail)delete entry.root.dataset.rail;delete entry.root.dataset.wbRail;
      const home=entry.home;if(home.parent.isConnected&&(home.next===null||home.next.parentNode===home.parent))home.parent.insertBefore(entry.root,home.next);else document.body.append(entry.root);
      entry.wrapper.remove();entry.wrapper.removeAttribute('style');
      if(wasOpen&&entry.root instanceof HTMLDialogElement){entry.root.close();entry.root.showModal();}
     }finally{this.transition--;}
    }
    entry.chrome.dataset.placement='modal';
    continue;
   }
   if(!entry.root.dataset.wbPlaced){
    this.transition++;try{
     const dialog=entry.root instanceof HTMLDialogElement?entry.root:undefined;const modal=dialog?.open&&dialog.matches(':modal');
     if(modal)dialog!.close();
     entry.root.dataset.wbPlaced='true';if(entry.root.dataset.rail!=='true'){entry.root.dataset.rail='true';entry.root.dataset.wbRail='true';}
     entry.wrapper.append(entry.root);
     if(dialog&&!dialog.open&&(modal||!this.layout.closed.includes(entry.id)))dialog.show();
    }finally{this.transition--;}
   }
   entry.wrapper.hidden=this.layout.closed.includes(entry.id)||!isOpen(entry.root);
   entry.chrome.dataset.placement=place.kind;entry.wrapper.dataset.placement=place.kind;
   if(place.kind==='floating'){
    const box=fit(place.box,view);entry.wrapper.style.left=box.left+'px';entry.wrapper.style.top=box.top+'px';entry.wrapper.style.width=box.width+'px';entry.wrapper.style.height=box.height+'px';entry.wrapper.style.flex='';
    if(entry.wrapper.parentElement!==document.body)document.body.append(entry.wrapper);
   }else{
    entry.wrapper.style.left='';entry.wrapper.style.top='';entry.wrapper.style.width='';entry.wrapper.style.height='';
    entry.wrapper.style.flex=`${this.layout.zones[place.zone].shares[entry.id]??1} 1 0`;
   }
  }
  for(const zone of ZONES){
   const element=this.zones[zone];const ids=this.layout.zones[zone].panels.filter(id=>this.managed.has(id));
   const wanted:HTMLElement[]=[];
   ids.forEach((id,index)=>{if(index>0){const share=document.createElement('div');share.className='wb-share';share.tabIndex=0;share.setAttribute('role','separator');share.setAttribute('aria-orientation',zone==='bottom'?'vertical':'horizontal');share.setAttribute('aria-label','Resize neighbouring panels');share.dataset.prev=ids[index-1]!;share.dataset.next=id;share.dataset.zone=zone;share.addEventListener('pointerdown',this.shareDown);share.addEventListener('pointermove',this.shareMove);share.addEventListener('pointerup',this.shareUp);share.addEventListener('pointercancel',this.shareUp);share.addEventListener('keydown',this.shareKey);wanted.push(share);}wanted.push(this.managed.get(id)!.wrapper);});
   element.replaceChildren(...wanted);
  }
  this.syncZones();
  if(typeof ResizeObserver!=='undefined')this.observeFloating();
 }
 private syncZones():void {
  for(const zone of ZONES){const element=this.zones[zone];const visible=[...element.querySelectorAll<HTMLElement>(':scope > .wb-panel')].filter(wrapper=>!wrapper.hidden);
   element.hidden=!visible.length;this.splitters[zone].hidden=!visible.length;
   for(const share of element.querySelectorAll<HTMLElement>(':scope > .wb-share')){const prev=this.managed.get(share.dataset.prev!)?.wrapper,next=this.managed.get(share.dataset.next!)?.wrapper;share.hidden=!prev||!next||prev.hidden||next.hidden;}
  }
 }
 private floatObserver:ResizeObserver|undefined;
 private observeFloating():void {
  this.floatObserver?.disconnect();this.floatObserver=new ResizeObserver(entries=>{if(this.drag?.active)return;let changed=false;
   for(const record of entries){const wrapper=record.target as HTMLElement;const id=wrapper.dataset.panel!;const place=placementOf(this.layout,id);if(place.kind!=='floating'||wrapper.hidden)continue;const rect=wrapper.getBoundingClientRect();if(Math.abs(rect.width-place.box.width)<1&&Math.abs(rect.height-place.box.height)<1)continue;this.layout=float(this.layout,id,{left:rect.left,top:rect.top,width:rect.width,height:rect.height},viewport());changed=true;}
   if(changed)this.save();});
  for(const entry of this.managed.values())if(placementOf(this.layout,entry.id).kind==='floating')this.floatObserver.observe(entry.wrapper);
 }
 private resized=():void=>{this.render();};
 // Dragging a title: a modal or docked panel detaches into a floating one, then follows the pointer; dropping near an
 // edge or over a zone docks it there.
 private titleDown(entry:Managed,event:PointerEvent):void {
  if(event.button!==0)return;closeMenus();event.preventDefault();
  this.drag={id:event.pointerId,managed:entry,startX:event.clientX,startY:event.clientY,active:false};
  try{entry.title.setPointerCapture(event.pointerId);}catch{/* unsupported */}
 }
 private titleMove=(event:PointerEvent):void=>{
  const drag=this.drag;if(!drag||drag.id!==event.pointerId)return;
  if(!drag.active){if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<5)return;drag.active=true;
   const place=placementOf(this.layout,drag.managed.id);
   if(place.kind!=='floating'){const rect=(place.kind==='modal'?drag.managed.root:drag.managed.wrapper).getBoundingClientRect();this.floatPanel(drag.managed,{left:rect.left,top:rect.top,width:Math.min(rect.width,Math.max(320,innerWidth*.45)),height:Math.min(rect.height,Math.max(240,innerHeight*.6))});}
   const current=placementOf(this.layout,drag.managed.id);if(current.kind!=='floating')return;
   // Keep the grab point under the pointer when the panel shrank on detach.
   const box={...current.box};if(drag.startX>box.left+box.width)box.left=drag.startX-box.width/2;if(drag.startY>box.top+box.height)box.top=drag.startY-16;drag.origin=box;this.root.dataset.dragging='true';document.body.classList.add('wb-dragging');
  }
  const origin=drag.origin;if(!origin)return;
  const box=fit({...origin,left:origin.left+event.clientX-drag.startX,top:origin.top+event.clientY-drag.startY},viewport());
  const wrapper=drag.managed.wrapper;wrapper.style.left=box.left+'px';wrapper.style.top=box.top+'px';
  drag.target=this.dropTarget(event.clientX,event.clientY,drag.managed.id);
  for(const zone of ZONES){this.zones[zone].classList.toggle('wb-drop',drag.target?.zone===zone);this.zones[zone].hidden=this.zones[zone].hidden&&drag.target?.zone!==zone;}
  this.root.dataset.drop=drag.target?drag.target.zone:'';
  for(const zone of ZONES)for(const [index,wrapper] of [...this.zones[zone].querySelectorAll<HTMLElement>(':scope > .wb-panel')].entries())wrapper.classList.toggle('wb-drop-before',drag.target?.zone===zone&&drag.target.index===index);
 };
 private titleUp=(event:PointerEvent):void=>{
  const drag=this.drag;if(!drag||drag.id!==event.pointerId)return;this.drag=undefined;
  delete this.root.dataset.dragging;delete this.root.dataset.drop;document.body.classList.remove('wb-dragging');
  for(const zone of ZONES){this.zones[zone].classList.remove('wb-drop');for(const wrapper of this.zones[zone].querySelectorAll('.wb-drop-before'))wrapper.classList.remove('wb-drop-before');}
  if(!drag.active){this.syncZones();return;}
  if(drag.target)this.apply(dock(this.layout,drag.managed.id,drag.target.zone,drag.target.index));
  else{const rect=drag.managed.wrapper.getBoundingClientRect();this.apply(float(this.layout,drag.managed.id,{left:rect.left,top:rect.top,width:rect.width,height:rect.height},viewport()));}
  drag.managed.title.focus({preventScroll:true});
 };
 private dropTarget(x:number,y:number,self:string):{zone:ZoneName;index:number}|undefined {
  const edge=40;const centre=this.centre.getBoundingClientRect();const row=this.row.getBoundingClientRect();
  for(const zone of ZONES){const element=this.zones[zone];if(element.hidden)continue;const rect=element.getBoundingClientRect();
   if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom){
    const wrappers=[...element.querySelectorAll<HTMLElement>(':scope > .wb-panel')].filter(wrapper=>wrapper.dataset.panel!==self);let index=0;
    for(const wrapper of wrappers){const box=wrapper.getBoundingClientRect();const middle=zone==='bottom'?box.left+box.width/2:box.top+box.height/2;if((zone==='bottom'?x:y)>middle)index++;}
    return {zone,index:this.layout.zones[zone].panels.filter(id=>id!==self).length>=index?index:0};
   }}
  if(y<row.top||y>this.root.getBoundingClientRect().bottom)return undefined;
  if(x<=centre.left+edge&&x>=row.left)return {zone:'left',index:this.layout.zones.left.panels.length};
  if(x>=centre.right-edge&&x<=row.right)return {zone:'right',index:this.layout.zones.right.panels.length};
  if(y>=centre.bottom-edge&&x>=centre.left&&x<=centre.right)return {zone:'bottom',index:this.layout.zones.bottom.panels.length};
  return undefined;
 }
 private titleKey(entry:Managed,event:KeyboardEvent):void {
  const place=placementOf(this.layout,entry.id);
  const delta:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};const move=delta[event.key];
  if(place.kind==='floating'&&move&&!event.altKey){event.preventDefault();const step=event.shiftKey?40:10;this.apply(float(this.layout,entry.id,{...place.box,left:place.box.left+move[0]*step,top:place.box.top+move[1]*step},viewport()));return;}
  if(place.kind==='docked'&&move&&event.altKey){event.preventDefault();this.apply(moveWithin(this.layout,entry.id,(place.zone==='bottom'?move[0]:move[1])||0));return;}
  if(event.key==='Escape'&&place.kind!=='modal'){event.preventDefault();this.closePanel(entry);}
 }
 // Zone splitters.
 private zoneDown=(event:PointerEvent):void=>{const zone=(event.currentTarget as HTMLElement).dataset.zone as ZoneName;if(event.button!==0)return;event.preventDefault();this.zoneDrag={id:event.pointerId,zone};(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);document.body.classList.add('wb-resizing');};
 private zoneMove=(event:PointerEvent):void=>{const drag=this.zoneDrag;if(!drag||drag.id!==event.pointerId)return;const row=this.row.getBoundingClientRect(),root=this.root.getBoundingClientRect();
  const size=drag.zone==='left'?event.clientX-row.left:drag.zone==='right'?row.right-event.clientX:root.bottom-event.clientY;this.layout=resizeZone(this.layout,drag.zone,size,viewport());this.root.style.setProperty(`--wb-${drag.zone}`,this.layout.sizes[drag.zone]+'px');};
 private zoneUp=(event:PointerEvent):void=>{if(this.zoneDrag?.id!==event.pointerId)return;this.zoneDrag=undefined;document.body.classList.remove('wb-resizing');this.save();};
 private zoneKey=(event:KeyboardEvent):void=>{const zone=(event.currentTarget as HTMLElement).dataset.zone as ZoneName;const grow=zone==='bottom'?{ArrowUp:1,ArrowDown:-1}:zone==='left'?{ArrowRight:1,ArrowLeft:-1}:{ArrowLeft:1,ArrowRight:-1};const step=(grow as Record<string,number>)[event.key];if(!step)return;event.preventDefault();this.apply(resizeZone(this.layout,zone,this.layout.sizes[zone]+step*(event.shiftKey?80:20),viewport()));};
 // Share splitters between neighbouring docked panels.
 private shareDown=(event:PointerEvent):void=>{const share=event.currentTarget as HTMLElement;if(event.button!==0)return;const prev=this.managed.get(share.dataset.prev!)?.wrapper,next=this.managed.get(share.dataset.next!)?.wrapper;if(!prev||!next)return;event.preventDefault();
  const zone=share.dataset.zone as ZoneName;const a=prev.getBoundingClientRect(),b=next.getBoundingClientRect();const start=zone==='bottom'?a.left:a.top;const length=(zone==='bottom'?b.right:b.bottom)-start;if(length<=0)return;
  this.shareDrag={id:event.pointerId,zone,prev:share.dataset.prev!,next:share.dataset.next!,start,length};share.setPointerCapture(event.pointerId);document.body.classList.add('wb-resizing');};
 private shareMove=(event:PointerEvent):void=>{const drag=this.shareDrag;if(!drag||drag.id!==event.pointerId)return;const ratio=Math.max(.1,Math.min(.9,((drag.zone==='bottom'?event.clientX:event.clientY)-drag.start)/drag.length));
  const shares=this.layout.zones[drag.zone].shares;const total=(shares[drag.prev]??1)+(shares[drag.next]??1);this.layout=setShares(this.layout,drag.zone,{[drag.prev]:ratio*total,[drag.next]:(1-ratio)*total});
  this.managed.get(drag.prev)!.wrapper.style.flex=`${this.layout.zones[drag.zone].shares[drag.prev]} 1 0`;this.managed.get(drag.next)!.wrapper.style.flex=`${this.layout.zones[drag.zone].shares[drag.next]} 1 0`;};
 private shareUp=(event:PointerEvent):void=>{if(this.shareDrag?.id!==event.pointerId)return;this.shareDrag=undefined;document.body.classList.remove('wb-resizing');this.save();};
 private shareKey=(event:KeyboardEvent):void=>{const share=event.currentTarget as HTMLElement;const zone=share.dataset.zone as ZoneName;const dir=zone==='bottom'?{ArrowRight:1,ArrowLeft:-1}:{ArrowDown:1,ArrowUp:-1};const step=(dir as Record<string,number>)[event.key];if(!step)return;event.preventDefault();
  const shares=this.layout.zones[zone].shares;const prev=share.dataset.prev!,next=share.dataset.next!;const total=(shares[prev]??1)+(shares[next]??1);const ratio=Math.max(.1,Math.min(.9,(shares[prev]??1)/total+step*.05));this.apply(setShares(this.layout,zone,{[prev]:ratio*total,[next]:(1-ratio)*total}));};
 stop():void {this.bundleDispose();this.observer?.disconnect();this.floatObserver?.disconnect();window.removeEventListener('resize',this.resized);this.save();}
}
