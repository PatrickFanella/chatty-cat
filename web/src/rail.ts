export interface RailPanel { name:'video'|'emotes'|'stats'; root:HTMLElement; show:(open:boolean)=>void; isOpen:()=>boolean; float?:()=>void }
interface Parked {panel:RailPanel;parent:Node;next:Node|null;wasOpen:boolean;floating:boolean;button:HTMLButtonElement;flexGrow:string}
export class PanelRail {
 private mode=0;
 private rail:HTMLElement;
 private panels:Parked[];
 private splitter=document.createElement('div');
 private proportion=1/3;
 private drag:{id:number;top:number;height:number}|null=null;
 private observer:ResizeObserver|undefined;
 constructor(log:HTMLElement,panels:RailPanel[]){
  const workspace=document.createElement('div');workspace.className='chat-workspace';log.before(workspace);workspace.append(log);this.rail=document.createElement('aside');this.rail.id='panel-rail';this.rail.hidden=true;this.rail.setAttribute('aria-label','Video, emotes and statistics rail');workspace.append(this.rail);
  this.panels=panels.map(panel=>{const button=document.createElement('button');button.type='button';button.className='rail-float';button.textContent='Float';button.hidden=true;panel.root.prepend(button);return {panel,parent:panel.root.parentNode!,next:panel.root.nextSibling,wasOpen:panel.isOpen(),floating:false,button,flexGrow:panel.root.style.flexGrow};});
  for(const entry of this.panels)entry.button.addEventListener('click',this.toggle);
  try{const saved:unknown=JSON.parse(localStorage.getItem('chatthing:v1:rail:split')??'null');if(typeof saved==='number'&&Number.isFinite(saved)&&saved>=.08&&saved<=.92)this.proportion=saved;}catch{/* optional storage */}
  this.splitter.className='rail-splitter';this.splitter.hidden=true;this.splitter.tabIndex=0;this.splitter.setAttribute('role','separator');this.splitter.setAttribute('aria-orientation','horizontal');this.splitter.setAttribute('aria-label','Resize emote and statistics panes');this.splitter.setAttribute('aria-valuemin','8');this.splitter.setAttribute('aria-valuemax','92');this.rail.append(this.splitter);
  this.splitter.addEventListener('pointerdown',this.down);this.splitter.addEventListener('pointermove',this.move);this.splitter.addEventListener('pointerup',this.end);this.splitter.addEventListener('pointercancel',this.end);this.splitter.addEventListener('lostpointercapture',this.end);this.splitter.addEventListener('keydown',this.key);
  if(typeof ResizeObserver!=='undefined'){this.observer=new ResizeObserver(()=>{this.syncSplit();this.compact();});this.observer.observe(this.rail);const stats=this.panels.find(entry=>entry.panel.name==='stats');if(stats)this.observer.observe(stats.panel.root);}
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
 private restore(entry:Parked,open:boolean):void {delete entry.panel.root.dataset.rail;entry.panel.root.classList.remove('rail-panel','stats-low','stats-min');entry.panel.root.style.flexGrow=entry.flexGrow;entry.parent.insertBefore(entry.panel.root,entry.next?.parentNode===entry.parent?entry.next:null);entry.panel.show(open);entry.button.textContent='Dock in rail';}
 private toggle=(event:Event):void=>{const entry=this.panels.find(item=>item.button===event.currentTarget);if(!entry||!this.mode)return;if(entry.panel.root.dataset.rail==='true'){this.restore(entry,true);entry.panel.float?.();entry.floating=true;}else this.dock(entry);this.syncSplit();};
 private panes():{emotes:HTMLElement;stats:HTMLElement}|undefined {const emotes=this.panels.find(entry=>entry.panel.name==='emotes')?.panel.root,stats=this.panels.find(entry=>entry.panel.name==='stats')?.panel.root;return emotes&&stats&&emotes.parentNode===this.rail&&stats.parentNode===this.rail?{emotes,stats}:undefined;}
 private syncSplit():void {const panes=this.panes();this.splitter.hidden=!panes||this.mode!==4;this.rail.dataset.split=String(!this.splitter.hidden);if(this.splitter.hidden){this.end();return;}this.rail.insertBefore(this.splitter,panes!.stats);panes!.emotes.style.flexGrow=String(this.proportion);panes!.stats.style.flexGrow=String(1-this.proportion);this.splitter.setAttribute('aria-valuenow',String(Math.round(this.proportion*100)));const video=this.panels.find(entry=>entry.panel.name==='video')?.panel.root;const videoHeight=video?.parentNode===this.rail?video.getBoundingClientRect().height:0;this.rail.style.setProperty('--rail-pane-space',Math.max(500,this.rail.clientHeight-videoHeight-40)+'px');this.rail.style.setProperty('--rail-emote-share',String(this.proportion));this.compact();}
 private resize(value:number):void {this.proportion=Math.max(.08,Math.min(.92,value));this.syncSplit();try{localStorage.setItem('chatthing:v1:rail:split',JSON.stringify(this.proportion));}catch{/* optional storage */}}
 private down=(event:PointerEvent):void=>{const panes=this.panes();if(event.button!==0||this.splitter.hidden||!panes)return;const top=panes.emotes.getBoundingClientRect().top,height=panes.stats.getBoundingClientRect().bottom-top;if(height<=0)return;event.preventDefault();this.drag={id:event.pointerId,top,height};this.splitter.setPointerCapture(event.pointerId);};
 private move=(event:PointerEvent):void=>{if(this.drag?.id===event.pointerId)this.resize((event.clientY-this.drag.top)/this.drag.height);};
 private end=():void=>{const drag=this.drag;this.drag=null;if(drag&&this.splitter.hasPointerCapture(drag.id))this.splitter.releasePointerCapture(drag.id);};
 private key=(event:KeyboardEvent):void=>{if(this.splitter.hidden||event.altKey||event.ctrlKey||event.metaKey)return;const value=event.key==='Home'?.08:event.key==='End'?.92:event.key==='ArrowUp'?this.proportion-.05:event.key==='ArrowDown'?this.proportion+.05:undefined;if(value===undefined)return;event.preventDefault();this.resize(value);};
 private compact=():void=>{const stats=this.panels.find(entry=>entry.panel.name==='stats')?.panel.root;if(!stats)return;const height=stats.parentNode===this.rail?stats.getBoundingClientRect().height:0;stats.classList.toggle('stats-low',height>0&&height<240);stats.classList.toggle('stats-min',height>0&&height<160);};
 stop():void {this.end();this.observer?.disconnect();this.splitter.removeEventListener('pointerdown',this.down);this.splitter.removeEventListener('pointermove',this.move);this.splitter.removeEventListener('pointerup',this.end);this.splitter.removeEventListener('pointercancel',this.end);this.splitter.removeEventListener('lostpointercapture',this.end);this.splitter.removeEventListener('keydown',this.key);this.splitter.remove();for(const entry of this.panels){entry.button.removeEventListener('click',this.toggle);entry.button.remove();if(entry.panel.root.dataset.rail==='true')this.restore(entry,entry.wasOpen);}}
}
