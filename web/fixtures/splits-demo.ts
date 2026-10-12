import '../src/style.css';
import {SplitLog} from '../src/split-log';
import {type LogItem} from '../src/virtual-log';
const root=document.querySelector<HTMLElement>('#log'),toggle=document.querySelector<HTMLButtonElement>('#toggle'),arrival=document.querySelector<HTMLButtonElement>('#arrival'),target=document.querySelector<HTMLElement>('#target');
if(!root||!toggle||!arrival||!target)throw new Error('Fixture elements missing');
const items:LogItem[]=Array.from({length:100000},(_,index)=>record(index));
function record(index:number):LogItem {const channel=index%2?'bob':'alice',text='Synthetic '+channel+' message '+index;const cache=new Map<string,HTMLElement>();return {key:channel+':'+index,channel,text,render:scope=>{let row=cache.get(scope??'default');if(!row){row=document.createElement('article');row.className='row';row.textContent=text;cache.set(scope??'default',row);}return row;}};}
const view=new SplitLog(root,toggle,['alice','bob'],{target:channel=>{target.textContent='Send target: '+channel;},changed:()=>paint(),popout:()=>{target.textContent='Popout is verified in the full app; this fixture has no workspace store';}});
view.layout.enable();const first=view.layout.activePane;view.layout.configure(first.id,{channels:['alice'],target:'alice',filter:'',reverse:false,pauseHover:true});const second=view.layout.duplicatePane(first.id);view.layout.configure(second.id,{channels:['bob'],target:'bob',filter:'',reverse:false,pauseHover:true});
function paint():void{view.set(items,true);}
paint();arrival.addEventListener('click',()=>{const next=record(items.length);items.push(next);view.observe(next.channel??'',next.text??'',next.key);paint();});window.addEventListener('resize',paint);window.addEventListener('pagehide',()=>{view.stop();window.removeEventListener('resize',paint);});
