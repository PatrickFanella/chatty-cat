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
 private pauseOnText=false;
 private frame=0;
 private observer:ResizeObserver|undefined;
 constructor(private root:HTMLElement){
  this.rebuild(1);
  if(typeof ResizeObserver!=='undefined')this.observer=new ResizeObserver(this.refit);
  this.observer?.observe(root);
  root.addEventListener('logmetrics',this.refit);
 }
 private rebuild(count:number):void {
  for(const view of this.views)view.stop();this.views=[];this.columns=[];this.count=count;this.active=count-1;this.pages=Array.from({length:count},()=>[]);this.root.replaceChildren();this.root.classList.toggle('page-columns',count>1);
  if(count===1){this.columns=[this.root];this.views=[new VirtualLog(this.root)];return;}
  for(let i=0;i<count;i++){const column=document.createElement('section');column.className='log-column';column.tabIndex=0;column.setAttribute('aria-label','Chat column '+(i+1));this.root.append(column);this.columns.push(column);this.views.push(new VirtualLog(column));}
 }
 set(items:readonly LogItem[],following:boolean,revision=0,reverse=false,mode=1,pauseOnText=false):void {
  const count=mode===1?1:mode===3&&innerWidth>innerHeight?3:2;
  const reset=count!==this.count||reverse!==this.reverse||revision!==this.revision;
  const previousLast=this.items.at(-1)?.key;this.items=items;this.reverse=reverse;this.following=following;this.revision=revision;this.pauseOnText=pauseOnText;
  if(count!==this.count)this.rebuild(count);
  if(count===1){this.views[0]!.set(items,following,revision,reverse,pauseOnText);return;}
  if(reverse){this.dealReverse();this.paint();return;}
  if(!following&&!reset)return;
  const indexes=new Map(items.map((item,i)=>[item.key,i]));
  if(reset||!previousLast||!indexes.has(previousLast)||!this.pages.some(page=>page.length))this.deal();
  else {
   for(const page of this.pages)for(let i=page.length-1;i>=0;i--)if(!indexes.has(page[i]!))page.splice(i,1);
   const start=indexes.get(previousLast)!+1;
   for(const item of items.slice(start)){
    let page=this.pages[this.active]!;
    if(page.length&&this.pageHeight(page)+this.height(item.key)>this.room()){this.active=(this.active+1)%count;page=[];this.pages[this.active]=page;}
    page.push(item.key);
   }
   if(this.pages.some((page,i)=>i!==this.active&&page.length>1&&this.pageHeight(page)>this.room()+1))this.deal();
  }
  this.paint();
 }
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
   this.columns[i]!.dataset.active=String(i===this.active);this.views[i]!.set(rows,this.following,this.revision,this.reverse,this.pauseOnText);
  }
  this.root.dispatchEvent(new Event('virtualpaint'));
 }
 private refit=():void=>{
  if(this.frame||this.count===1||!this.following)return;
  this.frame=requestAnimationFrame(()=>{this.frame=0;if(this.reverse)this.dealReverse();else if(this.pages.some((page,i)=>i!==this.active&&page.length>1&&this.pageHeight(page)>this.room()+1))this.deal();else {const page=this.pages[this.active]!;let used=0,cut=page.length;for(let i=0;i<page.length;i++){const height=this.height(page[i]!);if(i>0&&used+height>this.room()){cut=i;break;}used+=height;}if(cut<page.length){const spill=page.splice(cut);this.active=(this.active+1)%this.count;this.pages[this.active]=spill;if(this.pageHeight(spill)>this.room())this.deal();}}this.paint();});
 };
 isAtLive(target:EventTarget|null=this.root):boolean {
  const column=target instanceof HTMLElement&&this.columns.includes(target)?target:this.columns[this.active]!;
  return this.reverse?column.scrollTop<48:column.scrollHeight-column.clientHeight-column.scrollTop<48;
 }
 edgeKey(last:boolean):string|undefined {return this.items[last?this.items.length-1:0]?.key;}
 pausedByHover(target:EventTarget|null):boolean {const index=this.columns.findIndex(column=>column===target);return index>=0&&(this.views[index]?.pausedByHover()??false);}
 allFollowing():boolean {return this.views.every(view=>view.isFollowing());}
 resume():void {for(const view of this.views)view.resume();}
 moveKey(current:string|undefined,delta:number):string|undefined {const index=current?this.items.findIndex(item=>item.key===current):-1;return this.items[index<0?(delta<0?this.items.length-1:0):Math.max(0,Math.min(this.items.length-1,index+delta))]?.key;}
 reveal(key:string):boolean {
  this.following=false;
  if(this.count===1)return this.views[0]!.reveal(key);
  for(let i=0;i<this.pages.length;i++)if(this.pages[i]!.includes(key))return this.views[i]!.reveal(key);
  return this.views[0]!.reveal(key);
 }
 stop():void {cancelAnimationFrame(this.frame);this.observer?.disconnect();this.root.removeEventListener('logmetrics',this.refit);for(const view of this.views)view.stop();}
}
