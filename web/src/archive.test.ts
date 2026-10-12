// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { MessageArchive, matchesArchive } from './archive';
import type { ChatMessage } from './protocol';
const archives: MessageArchive[] = [];
afterEach(async () => { for (const archive of archives.splice(0)) archive.stop(); await new Promise(resolve => setTimeout(resolve, 20)); await new Promise<void>((resolve, reject) => { const req = indexedDB.deleteDatabase('chatthing-archive'); req.onsuccess = () => resolve(); req.onerror = () => reject(req.error); }); });
const message: ChatMessage = { id: 'id', command: 'PRIVMSG', channel: 'one', login: 'Alice', text: 'hello world', timestamp: 100, tags: {} };
function archive() { const a = new MessageArchive(); archives.push(a); return a; }
it('stores deduplicated messages and restores them after reopening', async () => {
  const a = archive(); a.add(message); a.add(message); await a.flush();
  expect(await a.search({ text: 'WORLD' })).toEqual([message]); a.stop(); await new Promise(resolve => setTimeout(resolve, 20));
  expect(await archive().search({ text: 'hello', channel: 'one' })).toEqual([message]);
});
it('uses channel and time ranges, newest-first limits and ignores state frames', async () => {
  const a = archive(); a.add(message); a.add({ ...message, id: 'new', timestamp: 200 }); a.add({ ...message, channel: 'two', id: 'other' }); a.add({ ...message, command: 'ROOMSTATE', id: 'state' });
  expect((await a.search({ text: '', channel: 'one', limit: 1 }))[0]?.id).toBe('new');
  expect((await a.search({ text: '', channel: 'one', before: 150 })).map(m => m.id)).toEqual(['id']);
  expect((await a.search({ text: '', channels: ['one'] })).map(m => m.channel)).toEqual(['one', 'one']);
  expect(await a.search({ text: '', channels: [] })).toEqual([]);
  expect(await a.search({ text: '', after: 300, before: 10 })).toEqual([]);
  expect((await a.search({text:'',channel:'one',after:100,limit:1,order:'oldest'}))[0]?.id).toBe('id');
});
it('supports literal text/login filters and cancelled searches', async () => {
  expect(matchesArchive(message, { text: 'hello', login: 'alice' })).toBe(true);
  expect(matchesArchive(message, { text: '.*' })).toBe(false);
  const a = archive(); const abort = new AbortController(); abort.abort(); await expect(a.search({ text: '' }, abort.signal)).rejects.toHaveProperty('name', 'AbortError');
});
it('reports unavailable storage instead of returning an empty success', async () => {
  const original = indexedDB; vi.stubGlobal('indexedDB', undefined); const failure = vi.fn(); const a = new MessageArchive(failure); archives.push(a);
  await expect(a.search({ text: '' })).rejects.toThrow('unavailable'); expect(failure).toHaveBeenCalled(); vi.stubGlobal('indexedDB', original);
});
it('prunes the oldest rows at the cap and finds IDs only in joined channels', async () => {
  const a = new MessageArchive(() => {}, 2); archives.push(a);
  for (let i = 1; i <= 3; i++) a.add({ ...message, id: String(i), timestamp: i });
  expect((await a.search({ text: '' })).map(m => m.id)).toEqual(['3', '2']);
  expect(await a.get('1', ['one'])).toBeUndefined(); expect(await a.get('3', ['two'])).toBeUndefined();
  expect((await a.get('3', ['one']))?.id).toBe('3');
});
it('restores large scrollback in chronological order only for joined channels',async()=>{
 const a=archive();for(let i=0;i<1200;i++)a.add({...message,id:String(i),timestamp:i,channel:i%3===0?'other':'one'});
 const records=await a.recent(['one'],1000);expect(records).toHaveLength(800);expect(records[0]?.timestamp).toBe(1);expect(records.at(-1)?.timestamp).toBe(1199);
 expect((await a.recent(['one'],250)).map(m=>m.timestamp)).toEqual(records.slice(-250).map(m=>m.timestamp));
 expect(await a.recent([],1000)).toEqual([]);const controller=new AbortController();controller.abort();await expect(a.recent(['one'],1000,controller.signal)).rejects.toHaveProperty('name','AbortError');
});
it('pages equal-time rows without repeats and reports retained archive boundaries',async()=>{
 const a=archive();for(let i=0;i<7;i++)a.add({...message,id:String(i),timestamp:100,channel:i===0?'two':'one'});
 const seen:string[]=[];let cursor;
 do{const page=await a.searchPage({text:'',channels:['one'],limit:2},cursor);seen.push(...page.messages.map(m=>m.id));cursor=page.next;expect(page.bounds).toEqual({rows:7,oldest:100,newest:100});}while(cursor);
 expect(seen).toEqual(['6','5','4','3','2','1']);
});
it('cancels an active selective cursor scan and leaves storage usable',async()=>{
 const a=archive();for(let i=0;i<1000;i++)a.add({...message,id:String(i),timestamp:i});await a.flush();
 const controller=new AbortController();
 await expect(a.searchPage({text:'absent',limit:2},undefined,controller.signal,()=>controller.abort())).rejects.toHaveProperty('name','AbortError');
 expect((await a.searchPage({text:'hello',limit:1})).messages).toHaveLength(1);
});
it('recovers missing public excerpts without overwriting retained moderation state or exceeding capacity',async()=>{
 const a=new MessageArchive(()=>{},2);archives.push(a);a.add({...message,tags:{deleted:'1'}});await a.flush();
 expect(await a.recoverMissing([message,{...message,id:'recovered',timestamp:200}])).toBe(1);
 expect((await a.get('id',['one']))?.tags.deleted).toBe('1');
 await expect(a.recoverMissing([{...message,id:'full',timestamp:300}])).rejects.toThrow('full');expect(await a.get('full',['one'])).toBeUndefined();
 await expect(a.recoverMissing([{...message,command:'WHISPER'}])).rejects.toThrow('public');
});
it('streams every channel row chronologically without the normal result cap and supports active cancellation',async()=>{
 const a=archive();for(let i=0;i<700;i++)a.add({...message,id:String(i),timestamp:i});a.add({...message,channel:'two'});const rows:ChatMessage[]=[];await a.scanChannel('one',m=>rows.push(m));expect(rows).toHaveLength(700);expect(rows[0]?.timestamp).toBe(0);expect(rows.at(-1)?.timestamp).toBe(699);const controller=new AbortController();let visited=0;await expect(a.scanChannel('one',()=>{if(++visited===50)controller.abort();},controller.signal)).rejects.toHaveProperty('name','AbortError');expect(visited).toBe(50);
});
