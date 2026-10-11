export interface RailPanel { name:'video'|'emotes'|'stats'; root:HTMLElement; show:(open:boolean)=>void; isOpen:()=>boolean; float?:()=>void }
interface Parked {panel:RailPanel;parent:Node;next:Node|null;wasOpen:boolean;floating:boolean;button:HTMLButtonElement}
export class PanelRail {
 private mode=0;
 private rail:HTMLElement;
 private panels:Parked[];
 constructor(log:HTMLElement,panels:RailPanel[]){
  const workspace=document.createElement('div');workspace.className='chat-workspace';log.before(workspace);workspace.append(log);this.rail=document.createElement('aside');this.rail.id='panel-rail';this.rail.hidden=true;this.rail.setAttribute('aria-label','Video, emotes and statistics rail');workspace.append(this.rail);
  this.panels=panels.map(panel=>{const button=document.createElement('button');button.type='button';button.className='rail-float';button.textContent='Float';button.hidden=true;panel.root.prepend(button);return {panel,parent:panel.root.parentNode!,next:panel.root.nextSibling,wasOpen:panel.isOpen(),floating:false,button};});
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
 }
 private dock(entry:Parked):void {entry.panel.root.dataset.rail='true';entry.panel.root.classList.add('rail-panel');this.rail.append(entry.panel.root);entry.panel.show(true);entry.button.textContent='Float';entry.floating=false;}
 private restore(entry:Parked,open:boolean):void {delete entry.panel.root.dataset.rail;entry.panel.root.classList.remove('rail-panel');entry.parent.insertBefore(entry.panel.root,entry.next?.parentNode===entry.parent?entry.next:null);entry.panel.show(open);entry.button.textContent='Dock in rail';}
 private toggle=(event:Event):void=>{const entry=this.panels.find(item=>item.button===event.currentTarget);if(!entry||!this.mode)return;if(entry.panel.root.dataset.rail==='true'){this.restore(entry,true);entry.panel.float?.();entry.floating=true;}else this.dock(entry);};
 stop():void {for(const entry of this.panels){entry.button.removeEventListener('click',this.toggle);entry.button.remove();if(entry.panel.root.dataset.rail==='true')this.restore(entry,entry.wasOpen);}}
}
