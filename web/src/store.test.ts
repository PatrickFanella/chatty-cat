import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageStore } from './store';
import type { ChatMessage } from './protocol';

const message = (id: string, timestamp: number): ChatMessage => ({ id, timestamp, command: 'PRIVMSG', channel: 'room', login: 'alice', text: 'hello', tags: {} });

describe('chat history', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('deduplicates live messages against replay and keeps time order', () => {
    const store = new MessageStore(['room']);
    expect(store.add(message('live', 200))).toBe(true);
    expect(store.add(message('old', 100))).toBe(true);
    expect(store.add(message('live', 200))).toBe(false);
    expect(store.messages.map((m) => m.id)).toEqual(['old', 'live']);
  });
  it('bounds memory and restores a channel-specific history', () => {
    const store = new MessageStore(['room'], 2);
    for (let i = 0; i < 4; i++) store.add(message(String(i), i));
    expect(store.messages.map((m) => m.id)).toEqual(['2', '3']);
    store.save();
    expect(new MessageStore(['room']).messages).toEqual(store.messages);
    expect(new MessageStore(['other']).messages).toEqual([]);
  });
  it('continues when storage is denied', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    const store = new MessageStore(['room']);
    expect(store.add(message('one', 1))).toBe(true);
    expect(() => store.save()).not.toThrow();
  });
});
it('adopts server metadata for accepted local echoes without duplicate rows', () => {
  const store = new MessageStore(['room']); const local = { ...message('echo', 200), tags: { 'local-echo': '1' } };
  store.add(local); expect(store.add({ ...message('echo', 201), tags: { badges: 'subscriber/1' } })).toBe(true);
  expect(store.messages).toHaveLength(1); expect(store.messages[0]?.tags.badges).toBe('subscriber/1');
  expect(store.add(message('echo', 201))).toBe(false);
});
it('deduplicates message-less system notices and scopes IDs by channel', () => {
  const store = new MessageStore(['room', 'other']); const notice = { ...message('', 1), command: 'USERNOTICE', tags: { 'system-msg': 'Alice subscribed' } };
  expect(store.add(notice)).toBe(true); expect(store.add(notice)).toBe(false);
  expect(store.add({ ...notice, tags: { 'system-msg': 'Bob subscribed' } })).toBe(true);
  store.add(message('same', 2)); expect(store.add({ ...message('same', 2), channel: 'other' })).toBe(true);
});
it('changes scrollback limits without leaving stale duplicate identities',()=>{
 const store=new MessageStore(['room'],100000);
 for(let i=0;i<10000;i++)store.add(message(String(i),i));
 store.setCap(250);expect(store.messages).toHaveLength(250);expect(store.messages[0]?.id).toBe('9750');
 expect(store.add(message('old',1))).toBe(true);expect(store.messages).toHaveLength(250);
 store.setCap(100000);expect(store.add(message('0',0))).toBe(true);expect(store.messages).toHaveLength(251);
 store.setCap(-1);expect(store.messages).toHaveLength(251);
});
it('bulk merges archived history while retaining newer live rows and server echoes',()=>{
 const store=new MessageStore(['room'],100000);store.add({...message('echo',20000),tags:{'local-echo':'1'}});store.add(message('live',30000));
 const archived=Array.from({length:10000},(_,i)=>message(String(i),i));archived.push(message('echo',20001));
 store.restore(archived);expect(store.messages).toHaveLength(10002);expect(store.messages.at(-1)?.id).toBe('live');expect(store.messages.at(-2)?.tags['local-echo']).toBeUndefined();
 expect(store.add(message('1',1))).toBe(false);
});
