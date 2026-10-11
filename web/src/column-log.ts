import { VirtualLog, type LogItem } from './virtual-log';

// Page columns keep the newest pages visible and retire older pages into the
// first column's virtual history. The archive never becomes a 100k-node DOM.
export class ColumnLog {
 private views:VirtualLog[]=[];
 private columns:HTMLElement[]=[];
 private items:readonly LogItem[]=[];
 private pages:string[][]=[];
 private active=0;
 private count=1;
 private revision=-1;
 private reverse=false;
 private following=true;
 private pauseHover=false;
 private hovered=-1;
 private frame=0;
 private observer:ResizeObserver|undefined;
 constructor(private root:HTMLElement){
  this.rebuild(1);
  if(typeof ResizeObserver!=='undefined')this.observer=new ResizeObserver(this.refit);
  this.observer?.observe(root);
  root.addEventListener('logmetrics',this.refit);
  root.addEventListener('pointerover',this.over);root.addEventListener('pointerout',this.out);
 }
 private rebuild(count:number):void {
  for(const view of this.views)view.stop();this.views=[];this.columns=[];this.hovered=-1;this.count=count;this.active=count-1;this.pages=Array.from({length:count},()=>[]);this.root.replaceChildren();this.root.classList.toggle('page-columns',count>1);
  if(count===1){this.columns=[this.root];this.views=[new VirtualLog(this.root)];return;}
  for(let i=0;i<count;i++){const column=document.createElement('section');column.className='log-column';column.tabIndex=0;column.setAttribute('aria-label','Chat column '+(i+1));this.root.append(column);this.columns.push(column);this.views.push(new VirtualLog(column));}
 }
 set(items:readonly LogItem[],following:boolean,revision=0,reverse=false,mode=1,pauseHover=false):void {
  this.pauseHover=pauseHover;if(!pauseHover)this.hovered=-1;
  const count=mode===1?1:mode===3&&innerWidth>innerHeight?3:2;
  const reset=count!==this.count||reverse!==this.reverse||revision!==this.revision;
  const previousLast=this.items.at(-1)?.key;this.items=items;this.reverse=reverse;this.following=following;this.revision=revision;
  if(count!==this.count)this.rebuild(count);
  if(count===1){this.views[0]!.set(items,following&&this.hovered!==0,revision,reverse);return;}
  if(reverse){this.dealReverse();this.paint();return;}
  if(!following&&!reset)return;
  const indexes=new Map(items.map((item,i)=>[item.key,i]));
  if(reset||!previousLast||!indexes.has(previousLast)||!this.pages.some(page=>page.length))this.deal();
  else {
   for(const page of this.pages)for(let i=page.length-1;i>=0;i--)if(!indexes.has(page[i]!))page.splice(i,1);
   const start=indexes.get(previousLast)!+1;
   for(const item of items.slice(start)){
    let page=this.pages[this.active]!;
    if(page.length&&this.pageHeight(page)+this.height(item.key)>this.room()){this.active=this.nextActive();page=[];this.pages[this.active]=page;}
    page.push(item.key);
   }
   if(this.pages.some((page,i)=>i!==this.active&&page.length>1&&this.pageHeight(page)>this.room()+1))this.deal();
  }
  this.paint();
 }
 private nextActive():number {let next=(this.active+1)%this.count;if(next===this.hovered)next=(next+1)%this.count;return next;}
 private height(key:string):number {for(const view of this.views){const height=view.measuredHeight(key);if(height!==undefined)return height;}return 32;}
 private room():number {return Math.max(32,(this.columns[0]?.clientHeight||this.root.clientHeight||640)-16);}
 private pageHeight(keys:readonly string[]):number {return keys.reduce((sum,key)=>sum+this.height(key),0);}
 private deal():void {
  this.pages=Array.from({length:this.count},()=>[]);let column=this.active,used=0,pages=1;
  for(let i=this.items.length-1;i>=0;i--){const key=this.items[i]!.key,height=this.height(key);if(this.pages[column]!.length&&used+height>this.room()){if(pages===this.count)break;column=(column-1+this.count)%this.count;used=0;pages++;}this.pages[column]!.unshift(key);used+=height;}
 }
 private dealReverse():void {
  this.pages=Array.from({length:this.count},()=>[]);let column=0,used=0;
  for(const item of this.items){const height=this.height(item.key);if(column<this.count-1&&this.pages[column]!.length&&used+height>this.room()){column++;used=0;}this.pages[column]!.push(item.key);used+=height;}
  this.active=0;
 }
 private paint():void {
  const byKey=new Map(this.items.map(item=>[item.key,item]));
  const live=new Set(this.pages.flat());
  const archived=this.reverse?[]:this.items.filter(item=>!live.has(item.key));
  for(let i=0;i<this.count;i++){
   const page=this.pages[i]!.map(key=>byKey.get(key)).filter((item):item is LogItem=>!!item);
   const rows=i===0&&!this.reverse?[...archived,...page]:page;
   this.columns[i]!.dataset.active=String(i===this.active);this.views[i]!.set(rows,this.following&&i!==this.hovered,this.revision,this.reverse);
  }
  this.root.dispatchEvent(new Event('virtualpaint'));
 }
 private columnAt(target:EventTarget|null):number {
  if(!(target instanceof Element))return -1;
  const column=target.closest('.log-column');return this.count===1&&this.root.contains(target)?0:column instanceof HTMLElement?this.columns.indexOf(column):-1;
 }
 private over=(event:PointerEvent):void=>{
  if(!this.pauseHover||!this.following)return;const index=this.columnAt(event.target);
  const next=event.target instanceof Element&&event.target.closest('.row')?index:-1;
  if(next!==this.hovered){this.hovered=next;this.paintCurrent();}
 };
 private out=(event:PointerEvent):void=>{
  if(this.hovered<0)return;
  if(event.relatedTarget instanceof Element&&event.relatedTarget.closest('.row')&&this.columnAt(event.relatedTarget)===this.hovered)return;
  this.hovered=-1;this.paintCurrent();
 };
 private paintCurrent():void {if(this.count===1)this.views[0]!.set(this.items,this.following&&this.hovered!==0,this.revision,this.reverse);else this.paint();}
 hoverPaused(target:EventTarget|null):boolean {return this.hovered>=0&&this.columnAt(target)===this.hovered;}
 private refit=():void=>{
  if(this.frame||this.count===1||!this.following)return;
  this.frame=requestAnimationFrame(()=>{this.frame=0;if(this.reverse)this.dealReverse();else if(this.pages.some((page,i)=>i!==this.active&&page.length>1&&this.pageHeight(page)>this.room()+1))this.deal();else {const page=this.pages[this.active]!;let used=0,cut=page.length;for(let i=0;i<page.length;i++){const height=this.height(page[i]!);if(i>0&&used+height>this.room()){cut=i;break;}used+=height;}if(cut<page.length){const spill=page.splice(cut);this.active=this.nextActive();this.pages[this.active]=spill;if(this.pageHeight(spill)>this.room())this.deal();}}this.paint();});
 };
 isAtLive(target:EventTarget|null=this.root):boolean {
  const column=target instanceof HTMLElement&&this.columns.includes(target)?target:this.columns[this.active]!;
  return this.reverse?column.scrollTop<48:column.scrollHeight-column.clientHeight-column.scrollTop<48;
 }
 edgeKey(last:boolean):string|undefined {return this.items[last?this.items.length-1:0]?.key;}
 moveKey(current:string|undefined,delta:number):string|undefined {const index=current?this.items.findIndex(item=>item.key===current):-1;return this.items[index<0?(delta<0?this.items.length-1:0):Math.max(0,Math.min(this.items.length-1,index+delta))]?.key;}
 reveal(key:string):boolean {
  this.following=false;this.hovered=-1;
  if(this.count===1)return this.views[0]!.reveal(key);
  for(let i=0;i<this.pages.length;i++)if(this.pages[i]!.includes(key))return this.views[i]!.reveal(key);
  return this.views[0]!.reveal(key);
 }
 stop():void {this.root.removeEventListener('pointerover',this.over);this.root.removeEventListener('pointerout',this.out);cancelAnimationFrame(this.frame);this.observer?.disconnect();this.root.removeEventListener('logmetrics',this.refit);for(const view of this.views)view.stop();}
}
