import '../src/style.css';
import {PresentationPanel} from '../src/presentation-ui';
import {getPresentation} from '../src/presentation';
import {messageRow,decoratePresentation} from '../src/render';
import {VirtualLog,type LogItem} from '../src/virtual-log';
import type {ChatMessage} from '../src/protocol';
const root=document.querySelector<HTMLElement>('#log')!,view=new VirtualLog(root);let revision=0;const messages:ChatMessage[]=Array.from({length:200},(_,i)=>({id:'fixture-'+i,channel:'fixture',login:i%2?'alice':'bob',command:'PRIVMSG',text:i===199?'Long public row '.repeat(100):i===198?'Deleted public text '.repeat(20):'Public row '+i,timestamp:Date.now()-200000+i*1000,tags:{'display-name':i%2?'艾丽丝':'Bob',color:'#aabbcc'}}));
const panel=new PresentationPanel(()=>{revision++;requestAnimationFrame(paint);});
function paint():void{const items:LogItem[]=messages.filter(m=>!getPresentation().hideModerated||m.id!=='fixture-198').map(message=>({key:message.id,highlight:()=>Number(message.id.split('-').at(-1))%20===0,render:()=>{const row=messageRow(message);decoratePresentation(row,message,message.id==='fixture-198',!message.id.startsWith('live'));return row;}}));view.set(items,false,revision);document.querySelector('#summary')!.textContent=messages.length+' observed records · '+items.length+' visible';}
document.querySelector('#arrival')!.addEventListener('click',()=>{messages.push({id:'live-'+crypto.randomUUID(),channel:'fixture',login:'alice',command:'PRIVMSG',text:'Synthetic live arrival',timestamp:Date.now(),tags:{'display-name':'艾丽丝'}});paint();});
paint();window.addEventListener('pagehide',()=>{panel.stop();view.stop();});
