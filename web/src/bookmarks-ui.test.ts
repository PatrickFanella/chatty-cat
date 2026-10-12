// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {BookmarksPanel} from './bookmarks-ui';
import type {ChatMessage} from './protocol';
const message:ChatMessage={id:'id',command:'PRIVMSG',channel:'one',login:'alice',text:'hello @bob https://example.org',timestamp:100,tags:{}};
let panel:BookmarksPanel|undefined;
afterEach(()=>{panel?.stop();document.body.replaceChildren();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
const flush=()=>new Promise(r=>setTimeout(r,0));
function setup(anchor=message){document.body.innerHTML='<button id="archive-open"></button><main id="log"></main>';const archive={get:vi.fn(async()=>undefined),search:vi.fn(async()=>[anchor]),recoverMissing:vi.fn(async()=>1)},select=vi.fn();panel=new BookmarksPanel(document.querySelector('#log')!,()=>[anchor],archive,select);panel.setAccount('42');const button=(text:string)=>[...panel!.root.querySelectorAll('button')].find(b=>b.textContent===text)!;return {archive,select,button};}
it('captures, tags and saves notes; preview omits private fields and recovery is explicit',async()=>{
 const ui=setup();await panel!.capture(message);panel!.root.querySelector<HTMLTextAreaElement>('[aria-label="Private note"]')!.value='private secret';panel!.root.querySelector<HTMLInputElement>('[aria-label="Tags (comma separated)"]')!.value='Important';ui.button('Save bookmark').click();
 expect(localStorage.getItem('chatthing:v1:bookmarks:42')).toContain('private secret');ui.button('Preview share').click();expect(panel!.root.querySelector('[aria-label="Share preview"]')?.textContent).not.toContain('private secret');expect(panel!.root.querySelector('[aria-label="Share preview"]')?.textContent).not.toContain('example.org');
 const note=panel!.root.querySelector<HTMLTextAreaElement>('[aria-label="Private note"]')!;note.dispatchEvent(new Event('input'));expect(ui.button('Copy reviewed share').disabled).toBe(true);
 ui.button('Open retained context').click();await flush();expect(panel!.root.textContent).toContain('no longer in this local archive');expect(ui.archive.recoverMissing).not.toHaveBeenCalled();ui.button('Recover saved public excerpts').click();await flush();expect(ui.archive.recoverMissing).toHaveBeenCalledTimes(1);
 expect(panel!.root.querySelector('a')?.textContent).toContain('this device');
});
it('clears private editing, share and backup previews on account switch and privacy mode',async()=>{
 const ui=setup();await panel!.capture(message);panel!.root.querySelector<HTMLTextAreaElement>('[aria-label="Private note"]')!.value='secret';ui.button('Save bookmark').click();panel!.root.querySelector<HTMLInputElement>('[aria-label="Include private note"]')!.checked=true;ui.button('Preview private backup').click();expect(panel!.root.querySelector('[aria-label="Private backup preview"]')?.textContent).toContain('secret');panel!.setAccount('43');expect(panel!.root.textContent).not.toContain('secret');expect(panel!.root.querySelector<HTMLTextAreaElement>('[aria-label="Private note"]')!.value).toBe('');expect(panel!.root.querySelector<HTMLInputElement>('[aria-label="Include private note"]')!.checked).toBe(false);
 panel!.setAccount('42');localStorage.setItem('chatthing:v1:privacy',JSON.stringify({version:1,enabled:true,panic:true,allowed:[]}));document.dispatchEvent(new Event('privacychange'));expect(panel!.root.textContent).not.toContain('secret');expect(panel!.root.open).toBe(false);expect(ui.button('Download reviewed private backup').disabled).toBe(true);
});
it('copies only the reviewed redacted text and clears transfer previews on deletion',async()=>{
 const ui=setup(),writeText=vi.fn<(text:string)=>Promise<void>>(async()=>{});vi.stubGlobal('navigator',{clipboard:{writeText}});await panel!.capture(message);panel!.root.querySelector<HTMLTextAreaElement>('[aria-label="Private note"]')!.value='secret';ui.button('Save bookmark').click();
 ui.button('Copy reviewed share').click();expect(writeText).not.toHaveBeenCalled();ui.button('Preview share').click();ui.button('Copy reviewed share').click();await flush();expect(writeText).toHaveBeenCalledTimes(1);expect(writeText.mock.calls[0]?.[0]).not.toContain('secret');
 ui.button('Preview private backup').click();ui.button('Delete bookmark').click();expect(panel!.root.querySelector('[aria-label="Private backup preview"]')?.textContent).toBe('');expect(ui.button('Download reviewed private backup').disabled).toBe(true);
});
it('reopens retained excerpts without a provider message ID and does not invent a permalink',async()=>{
 const anchor={...message,id:''},ui=setup(anchor);await panel!.capture(anchor);ui.button('Save bookmark').click();expect(panel!.root.querySelector('a')?.hasAttribute('href')).toBe(false);ui.button('Open retained context').click();await flush();expect(ui.select).toHaveBeenCalledWith(anchor);
});
