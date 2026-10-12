import {DisplaySettings} from '../src/display';
import {loadRowPronouns} from '../src/row-pronouns';
import {streamHeader} from '../src/stream-header';
import '../src/style.css';
import {PresentationPanel} from '../src/presentation-ui';
import {getPresentation} from '../src/presentation';
import {messageRow,decoratePresentation} from '../src/render';
import {VirtualLog,type LogItem} from '../src/virtual-log';
import type {ChatMessage} from '../src/protocol';
const root=document.querySelector<HTMLElement>('#log')!,view=new VirtualLog(root);let revision=0;const messages:ChatMessage[]=Array.from({length:200},(_,i)=>({id:'fixture-'+i,channel:'fixture',login:i%2?'alice':'bob',command:i===196?'JOIN':i===197?'PART':'PRIVMSG',text:i===199?'Long public row '.repeat(100):i===198?'Deleted public text '.repeat(20):'Public row '+i+' Alice, unknown @bob',timestamp:Date.now()-200000+i*1000,tags:{'display-name':i%2?'艾丽丝':'Bob',color:'#aabbcc'}}));
const streamInfo=document.createElement('span');streamInfo.id='fixture-stream';document.querySelector('header')!.append(streamInfo);
const display=new DisplaySettings(document.querySelector<HTMLDialogElement>('#fixture-display')!,document.querySelector<HTMLButtonElement>('#display-open')!,()=>{revision++;requestAnimationFrame(paint);});
const panel=new PresentationPanel(()=>{revision++;requestAnimationFrame(paint);});
function paint():void{const items:LogItem[]=messages.filter(m=>(!getPresentation().hideModerated||m.id!=='fixture-198')&&(m.command!=='JOIN'||getPresentation().showJoins)&&(m.command!=='PART'||getPresentation().showParts)).map(message=>({key:message.id,highlight:()=>Number(message.id.split('-').at(-1))%20===0,render:()=>{const row=messageRow(message,undefined,false,new Map([['alice',true],['bob',true]]));decoratePresentation(row,message,message.id==='fixture-198',!message.id.startsWith('live'));if(message.command==='PRIVMSG')loadRowPronouns(row,message.login,async()=> 'they/them');return row;}}));view.set(items,false,revision);streamInfo.textContent=streamHeader({uptime:'2h',viewers:'12',title:'Synthetic stream',game:'Music'});document.querySelector('#summary')!.textContent=messages.length+' observed records · '+items.length+' visible';}
document.querySelector('#arrival')!.addEventListener('click',()=>{messages.push({id:'live-'+crypto.randomUUID(),channel:'fixture',login:'alice',command:'PRIVMSG',text:'Synthetic live arrival',timestamp:Date.now(),tags:{'display-name':'艾丽丝'}});paint();});
paint();window.addEventListener('pagehide',()=>{display.stop();panel.stop();view.stop();});
