import '../src/style.css';
import { InboxPanel } from '../src/inbox-ui';
import type { ChatMessage } from '../src/protocol';
const result=document.getElementById('demo-result')!;
const publicMessage:ChatMessage={id:'fixture-mention',command:'PRIVMSG',channel:'room',login:'demo_friend',text:'@demo_viewer synthetic public mention',timestamp:1000,tags:{'display-name':'Demo Friend'}};
const panel=new InboxPanel(['room','other'],message=>{result.textContent='Public context selected: '+message.channel+':'+message.id+'; send target '+(document.getElementById('send-channel') as HTMLSelectElement).value;},login=>{result.textContent='Private reply prepared for '+login+'; no message sent';});
let account='fixture-a';
function seed():void {panel.setAccount(account,'demo_viewer');panel.observe(publicMessage);panel.observe(publicMessage);panel.observe({...publicMessage,id:'fixture-reply',text:'Synthetic reply',tags:{'reply-parent-user-login':'demo_viewer'}});panel.whisper({...publicMessage,id:'fixture-whisper',command:'WHISPER',channel:'',text:'Synthetic private whisper'},false);}
seed();document.getElementById('demo-account')!.addEventListener('click',()=>{account=account==='fixture-a'?'fixture-b':'fixture-a';panel.setAccount(account,'demo_viewer');result.textContent='Switched to '+account+'; previous private items cleared';});
window.addEventListener('pagehide',()=>panel.stop());

document.getElementById('demo-large')!.addEventListener('click',()=>{for(let i=0;i<200;i++)panel.observe({...publicMessage,id:'scroll-'+i,text:'@demo_viewer public reading fixture '+i,timestamp:1000+i});});
let live=0;document.getElementById('demo-live')!.addEventListener('click',()=>panel.observe({...publicMessage,id:'live-'+(++live),text:'@demo_viewer synthetic live arrival',timestamp:Date.now()}));
