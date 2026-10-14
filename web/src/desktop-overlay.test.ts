// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {DesktopCompanion,parseOverlayState,validOverlaySettings} from './desktop-companion';
import {DesktopOverlayControls} from './desktop-overlay-ui';
import {setProfileScope} from './account-profiles';
const auth={enabled:true,authenticated:true,userID:'42',csrf:'token',loginURL:'/login'};
const settings={channel:'room',opacity:.8,scale:1,width:400,height:600,shadow:true,clickThrough:false};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();setProfileScope('anonymous');document.body.replaceChildren();});
it('validates the native subset and refuses operations before account pairing',async()=>{
 expect(validOverlaySettings(settings)).toBe(true);
 for(const changed of [{channel:'../evil'},{opacity:NaN},{opacity:0},{scale:5},{width:99999},{height:1},{clickThrough:'true'}])expect(validOverlaySettings({...settings,...changed})).toBe(false);
 expect(()=>parseOverlayState({open:true,interactive:true,settings:{...settings,channel:'bad/url'},x:0,y:0,recovery:''})).toThrow();
 setProfileScope('42');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const client=new DesktopCompanion(()=>auth);
 await expect(client.overlay({kind:'open',requestID:'one',settings})).rejects.toThrow('Pair');
 expect(fetcher).not.toHaveBeenCalled();
});
it('does not open a window on review, invalidates edits, and removes reviews on account teardown',async()=>{
 const client=new DesktopCompanion(()=>auth);const action=vi.spyOn(client,'overlay').mockResolvedValue({open:true,interactive:true,settings,x:80,y:80,recovery:'Native menu available'});
 const controls=new DesktopOverlayControls(client,()=>auth,()=> 'room');document.body.append(controls.root);
 const button=(text:string)=>Array.from(controls.root.querySelectorAll('button')).find(b=>b.textContent===text)!;
 button('Review open native overlay').click();await vi.waitFor(()=>expect(controls.root.textContent).toContain('Pair and check'));
 controls.setAvailable(true);button('Review open native overlay').click();
 await vi.waitFor(()=>expect(button('Confirm reviewed overlay action').disabled).toBe(false));expect(action).not.toHaveBeenCalled();
 const opacity=controls.root.querySelector<HTMLInputElement>('[aria-label="Native overlay opacity"]')!;opacity.value='.6';opacity.dispatchEvent(new Event('input',{bubbles:true}));
 expect(button('Confirm reviewed overlay action').disabled).toBe(true);expect(action).not.toHaveBeenCalled();
 button('Review open native overlay').click();await vi.waitFor(()=>expect(button('Confirm reviewed overlay action').disabled).toBe(false));controls.reset();
 expect(button('Confirm reviewed overlay action').disabled).toBe(true);expect(action).not.toHaveBeenCalled();
});
