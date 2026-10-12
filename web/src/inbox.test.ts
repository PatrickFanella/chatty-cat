// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { ConversationInbox } from './inbox';
import type { ChatMessage } from './protocol';
const message=(id:string,text='@viewer hello',tags:Record<string,string>={}):ChatMessage=>({id,command:'PRIVMSG',channel:'room',login:'alice',text,timestamp:1000,tags});
beforeEach(()=>localStorage.clear());
it('classifies direct mentions, replies and participated threads without duplicating replay/echo',()=>{
 const inbox=new ConversationInbox();inbox.setAccount('42','viewer');inbox.observe(message('one'));inbox.observe(message('one'));expect(inbox.items('mentions')).toHaveLength(1);
 inbox.observe({...message('own','own reply',{'reply-thread-parent-msg-id':'thread'}),login:'viewer'});
 inbox.observe(message('reply','hello',{'reply-parent-user-login':'viewer'}));inbox.observe(message('thread-reply','hello',{'reply-thread-parent-msg-id':'thread'}));expect(inbox.items('replies')).toHaveLength(2);
});
it('persists public reads across reload and isolates accounts, without retaining private bodies',()=>{
 const inbox=new ConversationInbox();inbox.setAccount('42','viewer');inbox.observe(message('one'));inbox.markRead('mentions:room:one');inbox.whisper({...message('private','private secret'),command:'WHISPER',channel:''},false);
 expect(localStorage.getItem('chatthing:v1:inbox-read:42')).not.toContain('secret');const next=new ConversationInbox();next.setAccount('42','viewer');next.observe(message('one'));expect(next.unread('mentions')).toBe(0);expect(next.items('whispers')).toHaveLength(0);
 inbox.setAccount('43','viewer');inbox.observe(message('one'));expect(inbox.unread('mentions')).toBe(1);expect(inbox.items('whispers')).toHaveLength(0);
});
it('keeps channel filters and mark-all-read boundaries distinct',()=>{
 const inbox=new ConversationInbox();inbox.setAccount('42','viewer');inbox.observe(message('one'));inbox.observe({...message('two'),channel:'other'});inbox.markAll('mentions','room');expect(inbox.unread('mentions','room')).toBe(0);expect(inbox.unread('mentions','other')).toBe(1);
});
it('bounds public/private items and marks outgoing whisper requests read without serializing them',()=>{
 const inbox=new ConversationInbox();inbox.setAccount('42','viewer');for(let i=0;i<1200;i++)inbox.observe(message(String(i)));expect(inbox.items('mentions')).toHaveLength(500);
 for(let i=0;i<250;i++)inbox.whisper({...message(String(i),'secret'),command:'WHISPER',channel:''},true);expect(inbox.items('whispers')).toHaveLength(200);expect(inbox.unread('whispers')).toBe(0);
});
it('scopes reply parents to their channels and merges public reads from other tabs',()=>{
 const first=new ConversationInbox(),second=new ConversationInbox();first.setAccount('42','viewer');second.setAccount('42','viewer');first.observe({...message('own','own'),login:'viewer'});first.observe({...message('foreign','hi',{'reply-parent-msg-id':'own'}),channel:'other'});expect(first.items('replies')).toHaveLength(0);
 first.observe(message('one'));second.observe(message('two'));first.markRead('mentions:room:one');second.markRead('mentions:room:two');first.observe(message('two'));first.refreshReads();expect(first.unread('mentions')).toBe(0);
});
it('adds explicit public rule matches to mentions without duplicating natural mentions or storing message text',()=>{const inbox=new ConversationInbox();inbox.setAccount('account','viewer');expect(inbox.observe(message('rule','special phrase'),true)).toBe(true);expect(inbox.observe(message('rule','special phrase'),true)).toBe(false);expect(inbox.items('mentions')).toHaveLength(1);inbox.markRead(inbox.items('mentions')[0]!.key);expect(localStorage.getItem('chatthing:v1:inbox-read:account')).not.toContain('special phrase');});
