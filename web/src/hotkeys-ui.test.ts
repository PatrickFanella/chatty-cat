// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {HotkeyPanel} from './hotkeys-ui';
import {defaultBindings} from './hotkeys';
let panel:HotkeyPanel|undefined;
beforeEach(()=>localStorage.clear());afterEach(()=>{panel?.stop();document.body.replaceChildren();vi.unstubAllGlobals();});
function setup(){const trigger=document.createElement('button'),settings=document.createElement('button');document.body.append(trigger,settings);const run=vi.fn();panel=new HotkeyPanel(trigger,settings,run,()=>[{id:'channel:room',label:'Send channel: room',context:'chat',run:()=>run('channel:room')}]);return {trigger,settings,run};}
it('opens a searchable palette, supports keyboard selection and never executes an action while searching',()=>{
 const {trigger,run}=setup();trigger.click();const input=document.querySelector<HTMLInputElement>('#action-search')!;input.value='send channel: room';input.dispatchEvent(new Event('input'));expect(run).not.toHaveBeenCalled();input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));expect(run).toHaveBeenCalledWith('channel:room');expect(document.querySelector<HTMLDialogElement>('#action-palette')?.open).toBe(false);
});
it('shows conflicts without writing settings and resets only keyboard preferences',()=>{
 const {settings}=setup();localStorage.setItem('other-setting','keep');settings.click();const compose=document.querySelector<HTMLInputElement>('[data-binding=compose]')!;compose.value='Alt+KeyK';compose.dispatchEvent(new Event('input'));expect(document.querySelector('#shortcut-status')?.textContent).toMatch(/Conflict/);document.querySelector<HTMLButtonElement>('#shortcut-save')?.click();expect(localStorage.getItem('chatthing:v1:hotkeys')).toBeNull();
 document.querySelector<HTMLButtonElement>('#shortcut-reset')?.click();expect(localStorage.getItem('other-setting')).toBe('keep');expect(compose.value).toBe('Alt+KeyM');
});
it('honors edited bindings and preserves text fields, composition and privacy',()=>{
 const {settings,run}=setup();settings.click();const input=document.querySelector<HTMLInputElement>('[data-binding=compose]')!;input.value='Alt+KeyF';input.dispatchEvent(new Event('input'));document.querySelector<HTMLButtonElement>('#shortcut-save')?.click();
 document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',altKey:true,bubbles:true,cancelable:true}));expect(run).toHaveBeenCalledWith('compose');run.mockClear();
 const field=document.createElement('textarea');document.body.append(field);field.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',altKey:true,bubbles:true,cancelable:true}));document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',altKey:true,isComposing:true,bubbles:true,cancelable:true}));expect(run).not.toHaveBeenCalled();
 localStorage.setItem('chatthing:v1:privacy',JSON.stringify({version:1,enabled:true,panic:true,allowed:[]}));document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',altKey:true,bubbles:true,cancelable:true}));expect(run).not.toHaveBeenCalled();
});
it('refuses a stale edit after another tab changes shortcuts and reports quota failure without changing active bindings',()=>{
 const {settings}=setup();settings.click();const bindings=defaultBindings();bindings.compose='Alt+KeyF';const newer=JSON.stringify({version:1,bindings});localStorage.setItem('chatthing:v1:hotkeys',newer);window.dispatchEvent(new StorageEvent('storage',{key:'chatthing:v1:hotkeys'}));document.querySelector<HTMLButtonElement>('#shortcut-save')?.click();expect(localStorage.getItem('chatthing:v1:hotkeys')).toBe(newer);expect(document.querySelector('#shortcut-status')?.textContent).toMatch(/another tab/);
 document.querySelector<HTMLDialogElement>('#shortcut-settings')?.close();settings.click();vi.stubGlobal('localStorage',{getItem:()=>newer,setItem:()=>{throw new Error('quota failure');}});document.querySelector<HTMLButtonElement>('#shortcut-reset')?.click();expect(document.querySelector('#shortcut-status')?.textContent).toContain('quota failure');const detail:Record<string,unknown>={};document.dispatchEvent(new CustomEvent('capture-settings',{detail}));expect(detail.hotkeys).toEqual({version:1,bindings});
});
it('records a physical chord, allows disabling an action and exports only the edited preference map',()=>{
 const {settings,run}=setup();settings.click();document.querySelector<HTMLButtonElement>('[aria-label="Record Focus composer shortcut"]')?.click();const compose=document.querySelector<HTMLInputElement>('[data-binding=compose]')!;compose.dispatchEvent(new KeyboardEvent('keydown',{key:'ƒ',code:'KeyF',altKey:true,bubbles:true,cancelable:true}));expect(compose.value).toBe('Alt+KeyF');expect(run).not.toHaveBeenCalled();compose.value='';compose.dispatchEvent(new Event('input'));document.querySelector<HTMLButtonElement>('#shortcut-save')?.click();document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM',altKey:true,bubbles:true,cancelable:true}));document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'x',code:'',bubbles:true,cancelable:true}));expect(run).not.toHaveBeenCalled();const detail:Record<string,unknown>={};document.dispatchEvent(new CustomEvent('capture-settings',{detail}));expect(detail.hotkeys).toEqual({version:1,bindings:{...defaultBindings(),compose:''}});
});
