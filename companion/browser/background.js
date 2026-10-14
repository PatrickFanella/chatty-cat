import {pairingCode,external,sendWatched} from './core.js';
// Serialize session-storage read/modify/write across popup and page messages.
let queue=Promise.resolve();
function run(action,respond){queue=queue.catch(()=>{}).then(async()=>{const {bridge}=await chrome.storage.session.get('bridge');const state=bridge&&typeof bridge==='object'?bridge:{};try{const result=await action(state);await chrome.storage.session.set({bridge:state});respond(result);}catch(error){respond({ok:false,error:error instanceof Error?error.message:'Companion unavailable'});}});}
chrome.runtime.onMessageExternal.addListener((message,sender,respond)=>{run(state=>external(state,message,sender),respond);return true;});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html')||sender.tab||!message||typeof message!=='object'){respond({ok:false,error:'popup required'});return false;}
 run(async state=>{
  if(message.kind==='code')return {ok:true,code:pairingCode(state)};
  if(message.kind==='unpair'){state.pending=null;state.session=null;return {ok:true};}
  if(message.kind==='send'){
   const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
   const result=sendWatched(state,tab?.url??'');
   if(message.focus===true){const app=await chrome.tabs.update(result.tab,{active:true});if(app.windowId!==undefined)await chrome.windows.update(app.windowId,{focused:true});}
   return {ok:true,channel:result.channel};
  }
  return {ok:false,error:'unknown action'};
 },respond);return true;
});
chrome.tabs.onRemoved.addListener(tab=>{run(state=>{if(state.session?.tab===tab)state.session=null;return {ok:true};},()=>{});});
