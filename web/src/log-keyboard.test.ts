// @vitest-environment happy-dom
import { afterEach,expect,it,vi } from 'vitest';
import { LogKeyboard } from './log-keyboard';
import { VirtualLog } from './virtual-log';
import type { Composer } from './composer';
let keyboard:LogKeyboard|undefined,virtual:VirtualLog|undefined;
afterEach(()=>{keyboard?.stop();virtual?.stop();document.body.replaceChildren();vi.unstubAllGlobals();});
it('navigates distant virtual rows, follows End and forwards plain typing without hijacking controls',()=>{
 vi.stubGlobal('requestAnimationFrame',vi.fn());vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const log=document.createElement('main');document.body.append(log);virtual=new VirtualLog(log);const reply=vi.fn();
 virtual.set(Array.from({length:10000},(_,i)=>({key:String(i),render:()=>{const row=document.createElement('article');row.className='row';const button=document.createElement('button');button.dataset.reply=String(i);button.addEventListener('click',reply);row.append(button);return row;}})),false);
 const typing=vi.fn(),pause=vi.fn(),latest=vi.fn();keyboard=new LogKeyboard(log,virtual,{canInsert:true,focusTyping:typing} as unknown as Composer,pause,latest);
 log.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));expect(log.querySelector<HTMLElement>('.keyboard-selected')?.dataset.virtualKey).toBe('9999');
 const selected=log.querySelector<HTMLElement>('.keyboard-selected')!;selected.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));expect(reply).toHaveBeenCalledTimes(1);
 log.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));expect(log.querySelector<HTMLElement>('.keyboard-selected')?.dataset.virtualKey).toBe('0');
 log.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));expect(latest).toHaveBeenCalledOnce();
 log.dispatchEvent(new KeyboardEvent('keydown',{key:'h',bubbles:true,cancelable:true}));expect(typing).toHaveBeenCalledWith('h');
 log.querySelector('button')?.dispatchEvent(new KeyboardEvent('keydown',{key:'x',bubbles:true,cancelable:true}));expect(typing).toHaveBeenCalledTimes(1);
 log.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));expect(typing).toHaveBeenLastCalledWith('');
});
