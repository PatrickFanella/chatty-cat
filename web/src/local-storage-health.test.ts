// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {LocalStorageHealthPanel,protectLocalStorage,readStorageHealth} from './local-storage-health';
afterEach(()=>{vi.unstubAllGlobals();document.body.replaceChildren();});
it('checks protection without requesting permission and keeps estimates bounded',async()=>{
 const persist=vi.fn();vi.stubGlobal('navigator',{storage:{persist,persisted:async()=>false,estimate:async()=>({usage:1024,quota:2048})}});
 expect(await readStorageHealth()).toEqual({kind:'best-effort',usage:1024,quota:2048});expect(persist).not.toHaveBeenCalled();
});
it('reads the actual protection result after an explicit request, including denial',async()=>{
 const persist=vi.fn(async()=>false);vi.stubGlobal('navigator',{storage:{persist,persisted:async()=>false,estimate:async()=>({quota:0})}});
 expect(await protectLocalStorage()).toEqual({kind:'best-effort',quota:0});expect(persist).toHaveBeenCalledTimes(1);
});
it('does not infer protection when browser APIs are missing or fail',async()=>{
 vi.stubGlobal('navigator',{});expect(await readStorageHealth()).toEqual({kind:'unavailable'});expect(await protectLocalStorage()).toEqual({kind:'unavailable'});
 vi.stubGlobal('navigator',{storage:{persisted:async()=>{throw new Error('Denied');},persist:async()=>{throw new Error('Denied');}}});expect(await protectLocalStorage()).toEqual({kind:'unavailable'});
});
it('retains known protection if estimates fail and omits invalid byte values',async()=>{
 vi.stubGlobal('navigator',{storage:{persisted:async()=>true,estimate:async()=>({usage:-1,quota:Infinity})}});expect(await readStorageHealth()).toEqual({kind:'protected'});
 vi.stubGlobal('navigator',{storage:{persisted:async()=>true,estimate:async()=>{throw new Error('No estimate');}}});expect(await readStorageHealth()).toEqual({kind:'protected'});
});
it('requests protection only from its button, prevents concurrent requests and clears late results on close',async()=>{
 let finish:((value:boolean)=>void)|undefined;const persist=vi.fn(()=>new Promise<boolean>(resolve=>{finish=resolve;}));vi.stubGlobal('navigator',{storage:{persist,persisted:async()=>true,estimate:async()=>({quota:100})}});
 const panel=new LocalStorageHealthPanel(()=>true);document.body.append(panel.root);const buttons=panel.root.querySelectorAll('button');expect(persist).not.toHaveBeenCalled();buttons[1]!.click();buttons[1]!.click();expect(persist).toHaveBeenCalledTimes(1);expect(panel.busy).toBe(true);panel.stop();finish!(true);await new Promise(resolve=>setTimeout(resolve,0));expect(panel.root.querySelector('[role="status"]')?.textContent).toBe('');
});
it('shows a zero-allowance warning without writing user records',async()=>{
 vi.stubGlobal('navigator',{storage:{persisted:async()=>false,estimate:async()=>({usage:0,quota:0})}});const panel=new LocalStorageHealthPanel(()=>true);document.body.append(panel.root);panel.refresh();await vi.waitFor(()=>expect(panel.root.textContent).toContain('no storage allowance'));panel.stop();
});
it('shows confirmed browser protection after an explicit request and disables another request',async()=>{
 let protectedData=false;const persist=vi.fn(async()=>{protectedData=true;return true;});vi.stubGlobal('navigator',{storage:{persist,persisted:async()=>protectedData,estimate:async()=>({quota:100})}});
 const panel=new LocalStorageHealthPanel(()=>true);document.body.append(panel.root);panel.refresh();await vi.waitFor(()=>expect(panel.root.textContent).toContain('not enabled'));expect(persist).not.toHaveBeenCalled();
 panel.root.querySelectorAll('button')[1]!.click();await vi.waitFor(()=>expect(panel.root.textContent).toContain('protection granted'));expect(persist).toHaveBeenCalledTimes(1);expect(panel.root.querySelectorAll('button')[1]!.disabled).toBe(true);panel.stop();
});
