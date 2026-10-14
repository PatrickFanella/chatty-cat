import {parseExtension,type ExtensionManifest} from './extensions';
// A finite text language, never JavaScript/HTML evaluation. This self-contained
// interpreter is also copied into an opaque-origin sandbox, with no app closures.
export function renderExtensionText(template:string,input:string,channel:string):string{
 if(typeof template!=='string'||template.length>1000||typeof input!=='string'||input.length>500||typeof channel!=='string'||channel!==''&&!/^[a-z0-9_]{1,25}$/.test(channel))throw new Error('Extension input exceeds limits');
 let output='';const parts=template.split(/(\{\{(?:input|channel)\}\})/);if(parts.length>512)throw new Error('Extension operation limit exceeded');
 for(const part of parts){const next=part==='{{input}}'?input:part==='{{channel}}'?channel:part;if(output.length+next.length>2000)throw new Error('Extension output exceeds 2000 characters');output+=next;}return output;
}
export class ExtensionRuntime{
 private cancel:((error:Error)=>void)|undefined;private ledger=new Map<string,number[]>();
 run(value:ExtensionManifest,kind:'command'|'view',id:string,input:string,channel:string):Promise<string>{
  const manifest=parseExtension(value);const item=(kind==='command'?manifest.commands:manifest.views).find(c=>c.id===id);if(!item)throw new Error('Extension contribution not found');
  if(this.cancel)throw new Error('An extension action is already running');if(input.length>500)throw new Error('Extension input exceeds 500 characters');
  const recent=(this.ledger.get(manifest.id)??[]).filter(t=>Date.now()-t<60000);if(recent.length>=20)throw new Error('Extension limit: 20 runs per minute');recent.push(Date.now());this.ledger.set(manifest.id,recent);if(this.ledger.size>8){const oldest=this.ledger.keys().next().value;if(oldest)this.ledger.delete(oldest);}
  const context=manifest.permissions.includes('context:channel')?channel:'';const supplied=manifest.permissions.includes('input:text')?input:'';
  // Validate the exact bounded plan before allocating a browsing context.
  renderExtensionText(item.template,supplied,context);
  const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');const request=crypto.randomUUID();
  const frame=document.createElement('iframe');frame.title='Isolated extension text runtime';frame.setAttribute('sandbox','allow-scripts');frame.hidden=true;frame.referrerPolicy='no-referrer';
  const policy="default-src 'none'; script-src 'nonce-"+nonce+"'; connect-src 'none'; worker-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  frame.srcdoc='<!doctype html><meta http-equiv="Content-Security-Policy" content="'+policy+'"><script nonce="'+nonce+'">const render='+renderExtensionText.toString()+';addEventListener("message",e=>{if(e.source!==parent||!e.data||e.data.id!=='+JSON.stringify(request)+')return;try{const text=render(e.data.template,e.data.input,e.data.channel);parent.postMessage({protocol:"chatty-cat-extension-result",id:e.data.id,text},'+JSON.stringify(location.origin)+');}catch{parent.postMessage({protocol:"chatty-cat-extension-result",id:e.data.id,error:true},'+JSON.stringify(location.origin)+');}});</script>';
  return new Promise((resolve,reject)=>{
   const cleanup=():void=>{clearTimeout(timer);window.removeEventListener('message',message);frame.remove();this.cancel=undefined;};
   const fail=(error:Error):void=>{cleanup();reject(error);};
   const message=(event:MessageEvent):void=>{if(event.source!==frame.contentWindow||event.origin!=='null'||!event.data||event.data.protocol!=='chatty-cat-extension-result'||event.data.id!==request)return;const result=event.data;if(result.error||typeof result.text!=='string'||result.text.length>2000){fail(new Error('Extension runtime rejected its output'));return;}cleanup();resolve(result.text);};
   const timer=setTimeout(()=>fail(new Error('Extension execution exceeded two seconds')),2000);this.cancel=fail;window.addEventListener('message',message);frame.addEventListener('load',()=>{frame.contentWindow?.postMessage({id:request,template:item.template,input:supplied,channel:context},'*');},{once:true});document.body.append(frame);
  });
 }
 stop():void{this.cancel?.(new Error('Extension action cancelled'));}
}
