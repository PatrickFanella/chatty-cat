import {pairingCode,external,sendWatched} from './core.js';
const api = globalThis.browser ?? globalThis.chrome;
// Serialize session-storage read/modify/write across popup and page messages.
let queue=Promise.resolve();
function run(action,respond){queue=queue.catch(()=>{}).then(async()=>{const {bridge}=await api.storage.session.get('bridge');const state=bridge&&typeof bridge==='object'?bridge:{};try{const result=await action(state);await api.storage.session.set({bridge:state});respond(result);}catch(error){respond({ok:false,error:error instanceof Error?error.message:'Companion unavailable'});}});}
api.runtime.onMessageExternal?.addListener((message,sender,respond)=>{run(state=>external(state,message,sender),respond);return true;});
api.runtime.onMessage.addListener((message,sender,respond)=>{
 if(message?.kind==='app-message'&&sender.id===api.runtime.id&&sender.tab&&sender.frameId===0){
  // The sender URL/tab come from Firefox, never from the page envelope.
  let origin;try{origin=new URL(sender.url).origin;}catch{respond({ok:false,error:'invalid app sender'});return false;}
  run(state=>external(state,message.payload,{...sender,id:undefined,origin}),respond);return true;
 }

 if(sender.id!==api.runtime.id||sender.url!==api.runtime.getURL('popup.html')||sender.tab||!message||typeof message!=='object'){respond({ok:false,error:'popup required'});return false;}
 run(async state=>{
  if(message.kind==='code')return {ok:true,code:pairingCode(state)};
  if(message.kind==='unpair'){state.pending=null;state.session=null;return {ok:true};}
  if(message.kind==='send'){
   const [tab]=await api.tabs.query({active:true,currentWindow:true});
   const result=sendWatched(state,tab?.url??'');
   if(message.focus===true){const app=await api.tabs.update(result.tab,{active:true});if(app.windowId!==undefined)await api.windows.update(app.windowId,{focused:true});}
   return {ok:true,channel:result.channel};
  }
  return {ok:false,error:'unknown action'};
 },respond);return true;
});
api.tabs.onRemoved.addListener(tab=>{run(state=>{if(state.session?.tab===tab)state.session=null;return {ok:true};},()=>{});});
