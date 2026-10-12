// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceStore, parseWorkspaceFile, workspaceFile } from './workspaces';
import { defaultDisplay } from './display';
const snapshot = () => ({ channels:['one','two'], target:'two', focus:'log', settings:{version:1 as const,display:defaultDisplay(),extras:{}}, readers:[{column:0,key:'one:message',offset:12}] });
beforeEach(()=>localStorage.clear());
it('creates, renames, duplicates and deletes without mutating another workspace',()=>{
 const store=new WorkspaceStore();const first=store.create('Watching',snapshot());store.activate(first.id);
 const second=store.duplicate(first.id,'Moderating');store.rename(second.id,'Community');
 expect(store.get(first.id)?.name).toBe('Watching');expect(store.get(second.id)?.name).toBe('Community');
 store.remove(second.id);expect(store.all()).toHaveLength(1);
 expect(()=>store.remove(first.id)).toThrow(/active/);
});
it('restores active channels, target, public settings and paused anchors after reload',()=>{
 const store=new WorkspaceStore();const first=store.create('Watching',snapshot());store.activate(first.id);
 const loaded=new WorkspaceStore();expect(loaded.active?.target).toBe('two');expect(loaded.active?.readers[0]?.key).toBe('one:message');
});
it('exports only allowed settings, never drafts, whisper text or credential-shaped data',()=>{
 const raw={...snapshot(),draft:'/w user secret',csrf:'secret',settings:{version:1 as const,display:{...defaultDisplay(),token:'secret'},extras:{video:{options:{channel:'one',volume:.4,access_token:'secret'},whispers:'secret'},auth:{token:'secret'}}}};
 const store=new WorkspaceStore();store.create('Watching',raw);const file=workspaceFile(store.all());
 expect(file).not.toMatch(/secret|token|csrf|draft|whispers/);expect(parseWorkspaceFile(file)[0]?.settings.extras).toEqual({video:{options:{channel:'one',volume:.4}}});
});
it('rejects oversized, excessive, malformed and unknown-version imports before applying',()=>{
 expect(()=>parseWorkspaceFile('x'.repeat(262145))).toThrow(/256/);
 expect(()=>parseWorkspaceFile(JSON.stringify({format:'chatty-cat-workspaces',version:2,workspaces:[]}))).toThrow();
 expect(()=>parseWorkspaceFile(JSON.stringify({format:'chatty-cat-workspaces',version:1,workspaces:Array(21).fill(snapshot())}))).toThrow();
 const store=new WorkspaceStore();const first=store.create('Watching',snapshot());
 expect(()=>store.create('Bad',{...snapshot(),channels:['invalid channel']})).toThrow();expect(store.get(first.id)?.name).toBe('Watching');
});
it('handles storage failure visibly and leaves in-memory state unchanged',()=>{
 const store=new WorkspaceStore();const first=store.create('Watching',snapshot());
 const saved=localStorage.getItem('chatthing:v1:workspaces');vi.stubGlobal('localStorage',{getItem:()=>saved,setItem:()=>{throw new Error('quota');}});
 try{expect(()=>store.rename(first.id,'Changed')).toThrow(/save/);expect(store.get(first.id)?.name).toBe('Watching');}finally{vi.unstubAllGlobals();}
});
it('refuses a stale tab write and retains newer workspace changes',()=>{
 const first=new WorkspaceStore();const workspace=first.create('Watching',snapshot());const stale=new WorkspaceStore();
 first.rename(workspace.id,'Newest');expect(()=>stale.rename(workspace.id,'Stale')).toThrow(/another tab/);expect(new WorkspaceStore().get(workspace.id)?.name).toBe('Newest');
});
