export interface RailPanel { name:'video'|'emotes'|'stats'; root:HTMLElement; show:(open:boolean)=>void; isOpen:()=>boolean; float?:()=>void }
interface Parked {panel:RailPanel;parent:Node;next:Node|null;wasOpen:boolean;floating:boolean;button:HTMLButtonElement;grow:string}
export class PanelRail {
 private mode=0;
 private rail:HTMLElement;
 private panels:Parked[];
 private splitter:HTMLElement;
 private fraction=.5;
 private pointer:number|undefined;

 constructor(log:HTMLElement,panels:RailPanel[]){
  const workspace=document.createElement('div');workspace.className='chat-workspace';log.before(workspace);workspace.append(log);this.rail=document.createElement('aside');this.rail.id='panel-rail';this.rail.hidden=true;this.rail.setAttribute('aria-label','Video, emotes and statistics rail');workspace.append(this.rail);
  this.panels=panels.map(panel=>{const button=document.createElement('button');button.type='button';button.className='rail-float';button.textContent='Float';button.hidden=true;panel.root.prepend(button);return {panel,parent:panel.root.parentNode!,next:panel.root.nextSibling,wasOpen:panel.isOpen(),floating:false,button,grow:panel.root.style.flexGrow};});
  this.splitter=document.createElement('div');this.splitter.id='rail-split';this.splitter.tabIndex=0;this.splitter.setAttribute('role','separator');this.splitter.setAttribute('aria-orientation','horizontal');this.splitter.setAttribute('aria-label','Resize emote and statistics panes');this.splitter.setAttribute('aria-valuemin','8');this.splitter.setAttribute('aria-valuemax','92');this.splitter.hidden=true;
  try {const saved=Number(localStorage.getItem('chatthing:v1:rail:split'));if(Number.isFinite(saved)&&saved>=.08&&saved<=.92)this.fraction=saved;}catch{/* optional geometry */}
  this.splitter.addEventListener('pointerdown',this.start);this.splitter.addEventListener('pointermove',this.move);this.splitter.addEventListener('pointerup',this.end);this.splitter.addEventListener('pointercancel',this.end);this.splitter.addEventListener('keydown',this.key);
  for(const entry of this.panels)entry.button.addEventListener('click',this.toggle);
 }
 set(mode:number):void{
  const effective=innerWidth>innerHeight&&mode>=4?mode:0;if(effective===this.mode)return;
  const entering=this.mode===0&&effective!==0;this.mode=effective;this.rail.hidden=!effective;
  for(const entry of this.panels){
   if(entering){entry.wasOpen=entry.panel.isOpen();entry.floating=false;}
   const included=effective!==0&&(entry.panel.name==='emotes'||entry.panel.name==='video'&&effective<=5||entry.panel.name==='stats'&&effective===4);
   entry.button.hidden=!included;
   if(included&&!entry.floating)this.dock(entry);
   else if(entry.panel.root.dataset.rail==='true')this.restore(entry,entry.wasOpen);
  }
  this.syncSplit();
 }
 private dock(entry:Parked):void {entry.panel.root.dataset.rail='true';entry.panel.root.classList.add('rail-panel');this.rail.append(entry.panel.root);entry.panel.show(true);entry.button.textContent='Float';entry.floating=false;}
 private restore(entry:Parked,open:boolean):void {delete entry.panel.root.dataset.rail;entry.panel.root.style.flexGrow=entry.grow;entry.panel.root.classList.remove('rail-panel');entry.parent.insertBefore(entry.panel.root,entry.next?.parentNode===entry.parent?entry.next:null);entry.panel.show(open);entry.button.textContent='Dock in rail';}
 private toggle=(event:Event):void=>{const entry=this.panels.find(item=>item.button===event.currentTarget);if(!entry||!this.mode)return;if(entry.panel.root.dataset.rail==='true'){this.restore(entry,true);entry.panel.float?.();entry.floating=true;}else this.dock(entry);this.syncSplit();};
 private syncSplit():void {
  const emotes=this.panels.find(entry=>entry.panel.name==='emotes')?.panel.root;
  const stats=this.panels.find(entry=>entry.panel.name==='stats')?.panel.root;
  const shown=!!emotes&&!!stats&&this.mode===4&&emotes.parentNode===this.rail&&stats.parentNode===this.rail;
  this.splitter.hidden=!shown;
  if(!shown)for(const entry of this.panels)if(entry.panel.root.parentNode===this.rail)entry.panel.root.style.flexGrow=entry.grow;
  if(shown){this.rail.append(emotes,this.splitter,stats);emotes.style.flexGrow=String(this.fraction);stats.style.flexGrow=String(1-this.fraction);this.splitter.setAttribute('aria-valuenow',String(Math.round(this.fraction*100)));}
 }
 private adjust(value:number):void {this.fraction=Math.max(.08,Math.min(.92,value));this.syncSplit();try{localStorage.setItem('chatthing:v1:rail:split',String(this.fraction));}catch{/* optional geometry */}}
 private start=(event:PointerEvent):void=>{if(event.button!==0||this.splitter.hidden)return;event.preventDefault();this.pointer=event.pointerId;this.splitter.setPointerCapture?.(event.pointerId);};
 private move=(event:PointerEvent):void=>{if(this.pointer!==event.pointerId||this.splitter.hidden)return;const emotes=this.panels.find(entry=>entry.panel.name==='emotes')?.panel.root,stats=this.panels.find(entry=>entry.panel.name==='stats')?.panel.root;if(!emotes||!stats)return;const top=emotes.getBoundingClientRect().top,height=stats.getBoundingClientRect().bottom-top;if(height>0)this.adjust((event.clientY-top)/height);};
 private end=(event:PointerEvent):void=>{if(this.pointer===event.pointerId){this.pointer=undefined;if(this.splitter.hasPointerCapture?.(event.pointerId))this.splitter.releasePointerCapture(event.pointerId);}};
 private key=(event:KeyboardEvent):void=>{const step=event.shiftKey ? .1 : .02;const value=event.key==='ArrowUp'?this.fraction-step:event.key==='ArrowDown'?this.fraction+step:event.key==='Home' ? .08 : event.key==='End' ? .92 : undefined;if(value===undefined)return;event.preventDefault();this.adjust(value);};
 stop():void {this.splitter.removeEventListener('pointerdown',this.start);this.splitter.removeEventListener('pointermove',this.move);this.splitter.removeEventListener('pointerup',this.end);this.splitter.removeEventListener('pointercancel',this.end);this.splitter.removeEventListener('keydown',this.key);this.splitter.remove();for(const entry of this.panels){entry.button.removeEventListener('click',this.toggle);entry.button.remove();if(entry.panel.root.dataset.rail==='true')this.restore(entry,entry.wasOpen);}}
}
