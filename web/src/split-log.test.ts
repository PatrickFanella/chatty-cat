// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {SplitLog} from './split-log';
import type {LogItem} from './virtual-log';
let view:SplitLog|undefined;
afterEach(()=>{view?.stop();document.body.replaceChildren();vi.unstubAllGlobals();});
function setup(){const root=document.createElement('main'),button=document.createElement('button');document.body.append(button,root);const target=vi.fn();view=new SplitLog(root,button,['alice','bob'],{target,changed:()=>{},popout:()=>{}});view.layout.enable();return {root,target};}
function records(n:number):LogItem[]{return Array.from({length:n},(_,i)=>({key:(i%2?'bob':'alice')+':'+i,channel:i%2?'bob':'alice',text:'message '+i,render:()=>{const row=document.createElement('article');row.className='row';row.textContent='message '+i;return row;}}));}
it('filters each pane and mounts distinct bounded rows for duplicated sources',()=>{
 const {root}=setup(),first=view!.layout.activePane;view!.layout.configure(first.id,{channels:['alice'],target:'alice',filter:'',reverse:false,pauseHover:false});
 const second=view!.layout.duplicatePane(first.id);view!.set(records(100000),true);
 const logs=[...root.querySelectorAll('.split-reader')];expect(logs).toHaveLength(2);expect(logs[0]?.textContent).toBe(logs[1]?.textContent);expect(root.querySelectorAll('.row').length).toBeLessThan(200);
 expect(logs[0]?.querySelector('.row')).not.toBe(logs[1]?.querySelector('.row'));
 view!.layout.configure(second.id,{channels:['bob'],target:'bob',filter:'999',reverse:false,pauseHover:false});view!.set(records(100000),true);expect(logs[0]?.querySelector('[data-virtual-key^="bob:"]')).toBeNull();expect(root.querySelectorAll('.split-reader')[1]?.querySelector('[data-virtual-key^="alice:"]')).toBeNull();
});
it('keeps pane holds and tab unread state independent without changing target on reveal',()=>{
 const {root,target}=setup(),first=view!.layout.activePane;view!.layout.duplicatePane(first.id);view!.set(records(200),true);
 const logs=[...root.querySelectorAll<HTMLElement>('.split-reader')];expect(view!.reveal('alice:4')).toBe(true);expect(view!.hasManualPause()).toBe(true);expect(target).not.toHaveBeenCalled();
 const held=logs[1]!.scrollTop;view!.set(records(220),true);expect(logs[0]?.textContent).toContain('message 218');expect(logs[1]!.scrollTop).toBe(held);expect(logs[1]!.querySelector('[data-virtual-key="alice:4"]')).not.toBeNull();
 const other=view!.layout.addTab('Other');view!.set(records(220),true);view!.observe('alice','new message');expect(first.unread).toBe(1);expect(other.panes[0]?.unread).toBe(0);
 root.querySelector<HTMLButtonElement>('[data-tab]')?.click();expect(target).toHaveBeenCalled();view!.resume();view!.set(records(220),true);expect(view!.allFollowing()).toBe(true);
});
it('round trips public pane anchors through workspace settings and stops detached views',()=>{
 const {root}=setup();view!.set(records(200),true);view!.reveal('alice:4');const detail:Record<string,unknown>={};document.dispatchEvent(new CustomEvent('capture-settings',{detail}));expect(detail.splits).toBeDefined();
 view!.layout.addTab();view!.set(records(200),true);document.dispatchEvent(new CustomEvent('restore-settings',{detail}));view!.set(records(200),true);expect(root.querySelectorAll('[role=tab]')).toHaveLength(1);expect(view!.hasManualPause()).toBe(true);
 view!.stop();view=undefined;expect(root.querySelectorAll('.row')).toHaveLength(0);
});
it('opens archive context in one pane while another remains live and retains its send target',()=>{
 const {root,target}=setup();const first=view!.layout.activePane;view!.layout.duplicatePane(first.id);view!.set(records(200),true);
 view!.showContext(records(6));view!.set(records(240),true);const logs=[...root.querySelectorAll<HTMLElement>('.split-reader')];expect(logs[0]?.textContent).toContain('message 238');expect(logs[1]?.textContent).toContain('message 4');expect(logs[1]?.textContent).not.toContain('message 238');expect(target).not.toHaveBeenCalled();
 view!.resume();view!.set(records(240),true);expect(logs[1]?.textContent).toContain('message 238');
});
it('provides bounded render scopes so cached rows and handlers are never shared between panes',()=>{
 const {root}=setup();view!.layout.duplicatePane(view!.layout.activePane.id);const cache=new Map<string,HTMLElement>(),clicked=vi.fn();
 const item:LogItem={key:'alice:one',channel:'alice',render:scope=>{let row=cache.get(scope??'default');if(!row){row=document.createElement('article');row.className='row';row.append(document.createElement('button'));row.firstElementChild?.addEventListener('click',clicked);cache.set(scope??'default',row);}return row;}};
 view!.set([item],true);expect(root.querySelectorAll('.row')).toHaveLength(2);root.querySelectorAll<HTMLButtonElement>('.row button').forEach(b=>b.click());expect(clicked).toHaveBeenCalledTimes(2);
 for(let i=0;i<20;i++){view!.layout.addTab('New');view!.set([item],true);view!.layout.closeTab(view!.layout.activeTab.id);view!.set([item],true);}expect(cache.size).toBe(2);
});
it('counts unread in collapsed panes, deduplicates echo confirmations and restores live on selection',()=>{
 vi.stubGlobal('innerWidth',375);vi.stubGlobal('innerHeight',812);const {root}=setup(),first=view!.layout.activePane;view!.layout.duplicatePane(first.id);view!.set(records(200),true);
 view!.observe('alice','new','alice:same');view!.observe('alice','new','alice:same');expect(first.unread).toBe(1);expect(view!.layout.activePane.unread).toBe(0);
 const select=root.querySelector<HTMLSelectElement>('.split-select')!;select.value=first.id;select.dispatchEvent(new Event('change'));view!.set(records(200),true);expect(first.unread).toBe(0);
});
it('restores a popout as one read-only pane and does not change target during archive navigation',()=>{
 const root=document.createElement('main'),toggle=document.createElement('button');document.body.append(toggle,root);const base=new SplitLog(root,toggle,['alice','bob'],{target:()=>{},changed:()=>{},popout:()=>{}});base.layout.enable();const first=base.layout.activePane;const second=base.layout.duplicatePane(first.id);base.layout.configure(second.id,{channels:['bob'],target:'bob',filter:'',reverse:true,pauseHover:false});const state=base.layout.snapshot();base.stop();
 const target=vi.fn();view=new SplitLog(root,toggle,['alice','bob'],{target,changed:()=>{},popout:()=>{}},second.id);document.dispatchEvent(new CustomEvent('restore-settings',{detail:{splits:state}}));view.set(records(200),true);expect(root.querySelectorAll('.split-pane')).toHaveLength(1);expect(root.querySelector('.split-actions')).toBeNull();expect(root.textContent).not.toContain('Pop out');expect(toggle.hidden).toBe(true);expect(view.layout.activePane.target).toBe('bob');expect(view.reveal('bob:5')).toBe(true);expect(target).not.toHaveBeenCalled();
});
it('stops holding a saved reader when retention removed its message',()=>{
 setup();view!.layout.activePane.reader={key:'alice:missing',offset:8};view!.set(records(20),true);expect(view!.allFollowing()).toBe(false);view!.finishReaderRestore();view!.set(records(20),true);expect(view!.allFollowing()).toBe(true);
});
it('refuses user destination changes while a send is pending',()=>{
 const root=document.createElement('main'),toggle=document.createElement('button');document.body.append(toggle,root);const target=vi.fn();view=new SplitLog(root,toggle,['alice','bob'],{target,changed:()=>{},popout:()=>{},canChange:()=>false});view.layout.enable();const first=view.layout.activePane;const next=view.layout.duplicatePane(first.id);view.layout.selectPane(first.id);view.set(records(20),true);
 root.querySelector<HTMLButtonElement>(`[data-pane="${next.id}"] button`)?.click();expect(view.layout.activePane.id).toBe(first.id);expect(target).not.toHaveBeenCalled();expect(root.textContent).toContain('Wait for the current send outcome');
});
it('changing send target preserves the existing reader node and its hold',()=>{
 const {root}=setup();view!.set(records(200),true);view!.reveal('alice:4');const reader=root.querySelector<HTMLElement>('.split-reader')!,top=reader.scrollTop;view!.updateTarget('bob');view!.set(records(220),true);expect(root.querySelector('.split-reader')).toBe(reader);expect(reader.scrollTop).toBe(top);expect(root.textContent).toContain('Send: bob');
});
it('reapplies display visibility to archive context without losing its original source keys',()=>{
 const {root}=setup();view!.set(records(200),true);view!.showContext(records(6));view!.refreshContexts(()=>[]);view!.set(records(200),true);expect(root.querySelectorAll('.split-reader .row')).toHaveLength(0);expect(view!.contextKeys().size).toBe(6);view!.refreshContexts(keys=>records(6).filter(item=>keys.includes(item.key)));view!.set(records(200),true);expect(root.textContent).toContain('message 4');
});
it('uses the unique source union and drops subscriptions only after the last pane/tab closes',()=>{
 setup();view!.layout.configure(view!.layout.activePane.id,{channels:['alice'],target:'alice',filter:'',reverse:false,pauseHover:false});const alice=view!.layout.activePane,copy=view!.layout.duplicatePane(alice.id),bob=view!.layout.addPane();view!.layout.configure(bob.id,{channels:['bob'],target:'bob',filter:'',reverse:false,pauseHover:false});expect(view!.sources()).toEqual(['alice','bob']);view!.layout.closePane(alice.id);expect(view!.sources()).toEqual(['alice','bob']);view!.layout.closePane(copy.id);expect(view!.sources()).toEqual(['bob']);view!.layout.reopen();expect(view!.sources()).toEqual(['alice','bob']);
});
