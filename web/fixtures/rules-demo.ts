import '../src/style.css';
import {RulePanel} from '../src/rules-ui';
import {VirtualLog,type LogItem} from '../src/virtual-log';
import type {ChatMessage} from '../src/protocol';
const messages:ChatMessage[]=[],main=new VirtualLog(document.querySelector('#log')!),pane=new VirtualLog(document.querySelector('#pane')!);let revision=0;
const panel=new RulePanel(()=>{revision++;requestAnimationFrame(paint);});
function paint():void{
 const make=(ids:string[]):LogItem[]=>messages.flatMap(message=>{const rule=panel.engine.evaluate(message,ids),similar=panel.similarity.classify(message);if(rule.hidden||similar&&panel.similarity.options.behavior==='hide')return [];return [{key:message.id,render:()=>{const row=document.createElement('article');row.className='row'+(similar?' similar-message':'');row.dataset.id=message.id;row.textContent=message.login+': '+message.text;const highlight=rule.highlight&&(!similar||panel.similarity.options.highlightSimilar);if(highlight){row.classList.add('keyword-match');row.style.setProperty('--rule-color',rule.color);}return row;}}];});
 const left=make([]),right=make(panel.engine.rules.filter(r=>r.scope==='pane').map(r=>r.id));main.set(left,false,revision);pane.set(right,false,revision);document.querySelector('#summary')!.textContent=messages.length+' observed records · '+left.length+' global rows · '+right.length+' pane rows';panel.counts();
}
function add(text:string,author='alice'):void{const message={id:crypto.randomUUID(),channel:'fixture',command:'PRIVMSG',login:author,text,timestamp:Date.now(),tags:{}};messages.push(message);panel.engine.observe(message);paint();}
document.querySelector('#seed')!.addEventListener('click',()=>{for(let i=0;i<100;i++)add('Synthetic row '+i,i%2?'alice':'bob');add('hello repeated text','alice');add('hello repeated text','bob');add('secret pane text','bob');});
document.querySelector('#arrival')!.addEventListener('click',()=>add('hello repeated text','carol'));
document.querySelector('#reset')!.addEventListener('click',()=>{document.dispatchEvent(new CustomEvent('restore-settings',{detail:{rules:{version:1,rules:[]}}}));});
paint();window.addEventListener('pagehide',()=>{panel.stop();main.stop();pane.stop();});
