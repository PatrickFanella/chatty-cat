// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { Attention } from './attention';
import { defaultDisplay } from './display';
import type { ChatMessage } from './protocol';
const message: ChatMessage = { id: 'id', channel: 'hasanabi', command: 'PRIVMSG', login: 'alice', text: '@bob hello', timestamp: 1, tags: {} };
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('queues unique live mentions while away, jumps FIFO and clears with Shift-click',()=>{
 vi.spyOn(document,'hasFocus').mockReturnValue(false);
 const button=document.createElement('button'),jump=vi.fn();const attention=new Attention(button,defaultDisplay,jump);
 attention.mention(message,true,true);attention.mention(message,false);expect(button.textContent).toBe('');
 attention.mention(message,true);attention.mention(message,true);attention.mention({...message,id:'two'},true);expect(button.textContent).toBe('@2');
 button.click();expect(jump).toHaveBeenCalledWith('id','hasanabi');expect(button.textContent).toBe('@1');
 button.dispatchEvent(new MouseEvent('click',{shiftKey:true}));expect(button.hidden).toBe(true);attention.stop();
 attention.mention({...message,id:'three'},true);expect(button.hidden).toBe(true);
});
it('does not count focused chat or unidentifiable notices and bounds the queue',()=>{
 const focus=vi.spyOn(document,'hasFocus').mockReturnValue(true);const button=document.createElement('button');const attention=new Attention(button,defaultDisplay,vi.fn());
 attention.mention(message,true);expect(button.textContent).toBe('');focus.mockReturnValue(false);
 attention.mention({...message,id:''},true);attention.mention({...message,command:'NOTICE'},true);expect(button.textContent).toBe('');
 for(let i=0;i<600;i++)attention.mention({...message,id:String(i)},true);expect(button.textContent).toBe('@500');attention.stop();
});
it('requests notification permission only when explicitly enabled',async()=>{
 const permission=vi.fn().mockResolvedValue('granted');vi.stubGlobal('Notification',{permission:'default',requestPermission:permission});
 const options=defaultDisplay();const attention=new Attention(document.createElement('button'),()=>options,vi.fn());
 await attention.permission();expect(permission).not.toHaveBeenCalled();options.notify=true;await attention.permission();expect(permission).toHaveBeenCalledOnce();attention.stop();
});
it('notifies hidden-page mentions through the service worker and throttles bursts',async()=>{
 vi.spyOn(document,'hasFocus').mockReturnValue(false);vi.spyOn(document,'hidden','get').mockReturnValue(true);
 vi.stubGlobal('Notification',{permission:'granted'});const showNotification=vi.fn().mockResolvedValue(undefined);
 Object.defineProperty(navigator,'serviceWorker',{value:{getRegistration:vi.fn().mockResolvedValue({showNotification})},configurable:true});
 const attention=new Attention(document.createElement('button'),()=>({...defaultDisplay(),notify:true}),vi.fn());
 attention.mention(message,true);attention.mention({...message,id:'two'},true);await vi.waitFor(()=>expect(showNotification).toHaveBeenCalledOnce());
 expect(showNotification.mock.calls[0]?.[0]).toBe('alice mentioned you');
 attention.stream('hasanabi',true,'Already live');expect(showNotification).toHaveBeenCalledOnce();
 attention.stream('hasanabi',false,'');attention.stream('hasanabi',true,'New stream');await vi.waitFor(()=>expect(showNotification).toHaveBeenCalledTimes(2));attention.stop();
});

it('offers an explicit foreground notification check without creating a chat message',async()=>{
 vi.stubGlobal('Notification',{permission:'granted'});const show=vi.fn(async()=>{});vi.stubGlobal('navigator',{serviceWorker:{getRegistration:async()=>({showNotification:show})}});
 const attention=new Attention(document.createElement('button'),()=>({...defaultDisplay(),notify:true}),vi.fn());
 expect(await attention.test()).toContain('Test notification requested');expect(show).toHaveBeenCalledWith('Chatty Cat test alert',expect.objectContaining({tag:'test'}));attention.stop();
});
it('suppresses private notification contents, alert tests and delayed notifications after privacy is enabled',async()=>{
 localStorage.removeItem('chatthing:v1:privacy');Object.defineProperty(document,'hidden',{configurable:true,value:true});
 const notification=vi.fn();vi.stubGlobal('Notification',Object.assign(notification,{permission:'granted'}));
 let resolve:((value:ServiceWorkerRegistration|undefined)=>void)|undefined;
 const registration=new Promise<ServiceWorkerRegistration|undefined>(done=>{resolve=done;});const showNotification=vi.fn();
 vi.spyOn(navigator,'serviceWorker','get').mockReturnValue({getRegistration:()=>registration} as unknown as ServiceWorkerContainer);
 const attention=new Attention(document.createElement('button'),()=>({...defaultDisplay(),notify:true}),vi.fn());
 attention.whisper({...message,text:'private body'});
 localStorage.setItem('chatthing:v1:privacy',JSON.stringify({version:1,enabled:true,allowed:[],panic:false}));
 resolve?.({showNotification} as unknown as ServiceWorkerRegistration);await Promise.resolve();await Promise.resolve();
 expect(showNotification).not.toHaveBeenCalled();expect(notification).not.toHaveBeenCalled();expect(await attention.test()).toBe('Alerts are suppressed in privacy mode');attention.stop();localStorage.removeItem('chatthing:v1:privacy');
});
it('can collect a highlighted message without requesting its disabled notification',async()=>{vi.spyOn(document,'hasFocus').mockReturnValue(false);vi.spyOn(document,'hidden','get').mockReturnValue(true);const show=vi.fn();vi.stubGlobal('Notification',{permission:'granted'});vi.stubGlobal('navigator',{serviceWorker:{getRegistration:async()=>({showNotification:show})}});const button=document.createElement('button'),attention=new Attention(button,()=>({...defaultDisplay(),notify:true}),vi.fn());attention.mention(message,true,false,{sound:false,notify:false});await Promise.resolve();expect(show).not.toHaveBeenCalled();expect(button.textContent).toBe('@1');attention.stop();});

it('mutes channel alerts without suppressing the missed-mention index',async()=>{vi.spyOn(document,'hasFocus').mockReturnValue(false);vi.spyOn(document,'hidden','get').mockReturnValue(true);const show=vi.fn();vi.stubGlobal('Notification',{permission:'granted'});vi.stubGlobal('navigator',{serviceWorker:{getRegistration:async()=>({showNotification:show})}});const {setPresentation,presentationDefaults}=await import('./presentation');setPresentation({...presentationDefaults,mutedChannels:'HASANABI'});const button=document.createElement('button'),attention=new Attention(button,()=>({...defaultDisplay(),notify:true}),vi.fn());attention.mention(message,true);attention.stream('hasanabi',false,'');attention.stream('hasanabi',true,'Live');await Promise.resolve();await Promise.resolve();expect(button.textContent).toBe('@1');expect(show).not.toHaveBeenCalled();attention.stop();setPresentation({...presentationDefaults});});
