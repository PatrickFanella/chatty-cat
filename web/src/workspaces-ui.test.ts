// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WorkspacePanel} from './workspaces-ui';
import {WorkspaceStore} from './workspaces';
import {defaultDisplay} from './display';
let panel:WorkspacePanel|undefined;
beforeEach(()=>localStorage.clear());afterEach(()=>{panel?.stop();document.body.replaceChildren();});
function setup(readonly=false){const store=new WorkspaceStore(),snapshot={channels:['room'],target:'room',focus:'log',settings:{version:1 as const,display:defaultDisplay(),extras:{}},readers:[]};const first=store.create('Watching',snapshot);store.activate(first.id);const next=store.create('Community',snapshot);const root=document.createElement('dialog'),trigger=document.createElement('button');root.innerHTML='<select id="workspace-select"></select><input id="workspace-name"><input id="workspace-file" type="file"><p id="workspace-status"></p><button id="workspace-apply" data-workspace-action="apply"></button><button data-workspace-action="save"></button>';document.body.append(root,trigger);const save=vi.fn(),navigate=vi.fn();panel=new WorkspacePanel(root,trigger,store,()=>first.id,()=>snapshot,save,navigate,readonly);return {root,trigger,store,first,next,save,navigate};}
it('quick switching presents the selected workspace and waits for Apply before navigation',()=>{
 const {root,next,save,navigate}=setup();panel!.previewSwitch(next.id);expect(root.open).toBe(true);expect(root.querySelector<HTMLSelectElement>('select')?.value).toBe(next.id);expect(root.querySelector('#workspace-status')?.textContent).toContain('Community');expect(navigate).not.toHaveBeenCalled();root.querySelector<HTMLButtonElement>('#workspace-apply')?.click();expect(save).toHaveBeenCalledOnce();expect(navigate).toHaveBeenCalledWith(expect.objectContaining({id:next.id}));
});
it('a pane popout cannot open or overwrite parent workspace settings',()=>{
 const {root,trigger,store,next}=setup(true);const before=JSON.stringify(store.all());trigger.click();panel!.previewSwitch(next.id);expect(root.open).toBe(false);expect(trigger.hidden).toBe(true);root.querySelector<HTMLButtonElement>('[data-workspace-action=save]')?.click();expect(JSON.stringify(store.all())).toBe(before);expect(root.querySelector('#workspace-status')?.textContent).toContain('main view');
});
