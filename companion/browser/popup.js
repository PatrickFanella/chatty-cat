const status=document.getElementById('status');
document.getElementById('identity').textContent='Extension ID: '+chrome.runtime.id;
const focus=document.getElementById('focus');const saved=await chrome.storage.local.get('focusApp');focus.checked=saved.focusApp===true;
focus.addEventListener('change',()=>{void chrome.storage.local.set({focusApp:focus.checked});});
let busy=false;
async function action(kind){if(busy)return;busy=true;try{const result=await chrome.runtime.sendMessage({kind,focus:focus.checked});if(!result?.ok)throw new Error(result?.error??'Companion unavailable');if(kind==='code'){document.getElementById('code').value=result.code;status.textContent='Paste this code and the extension ID into Chatty Cat’s Browser companion panel within five minutes.';}else if(kind==='send')status.textContent='Staged #'+result.channel+'. In Chatty Cat, open Browser companion, then choose Review received watched channel and Open reviewed channel. No approval popup opens automatically.';else{document.getElementById('code').value='';status.textContent='Unpaired';}}catch(error){status.textContent=error instanceof Error?error.message:'Companion unavailable';}finally{busy=false;}}
for(const [id,kind]of [['generate','code'],['send','send'],['unpair','unpair']])document.getElementById(id).addEventListener('click',()=>{void action(kind);});
