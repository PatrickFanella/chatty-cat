// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {IRCRelayPanel} from './irc-relay-ui';
import {IRCClient} from './irc-relay';
import {setProfileScope} from './account-profiles';
import type {AuthStatus} from './auth';

let panel:IRCRelayPanel|undefined;
afterEach(()=>{panel?.stop();panel=undefined;vi.restoreAllMocks();localStorage.clear();setProfileScope('anonymous');document.body.replaceChildren();});

it('requires confirmation, invalidates edited reviews, and clears private UI when the account changes',async()=>{
 setProfileScope('42');
 let auth:AuthStatus={enabled:true,authenticated:true,userID:'42',csrf:'token',login:'alice',loginURL:'/api/auth/login'};
 const snapshot={network:'test',epoch:'a'.repeat(32),nick:'Alice',state:'connected' as const,detail:'TLS connected',channels:['#room'],messages:[{id:'private',target:'#room',nick:'Bob',text:'private IRC body',time:Date.now(),delivery:'observed' as const}]};
 vi.spyOn(IRCClient.prototype,'networks').mockResolvedValue([{id:'test',name:'Test network',nick:'Alice',channels:['#room']}]);
 vi.spyOn(IRCClient.prototype,'read').mockResolvedValue(snapshot);
 const action=vi.spyOn(IRCClient.prototype,'action').mockResolvedValue(snapshot);
 vi.spyOn(IRCClient.prototype,'closeLease').mockImplementation(()=>{});
 document.body.innerHTML='<button id="commands-open">Commands</button>';
 panel=new IRCRelayPanel(()=>auth);
 const button=(text:string)=>Array.from(panel!.root.querySelectorAll('button')).find(b=>b.textContent===text)!;
 expect(action).not.toHaveBeenCalled();
 button('Load my configured IRC networks').click();
 await vi.waitFor(()=>expect(panel!.root.querySelectorAll('option')).toHaveLength(1));
 await new Promise(resolve=>setTimeout(resolve,0));
 button('Review connect/join configured channels').click();
 expect(action).not.toHaveBeenCalled();
 await new Promise(resolve=>setTimeout(resolve,0));
 button('Confirm reviewed IRC action').click();
 await vi.waitFor(()=>expect(panel!.root.querySelector('[role=status]')?.textContent).toBe('TLS connected'));
 expect(action).toHaveBeenCalledTimes(1);
 const draft=panel.root.querySelector('textarea')!;
 draft.value='hello';draft.dispatchEvent(new Event('input'));
 button('Review IRC message').click();
 await new Promise(resolve=>setTimeout(resolve,0));
 expect(button('Confirm reviewed IRC action').disabled).toBe(false);
 draft.value='edited';draft.dispatchEvent(new Event('input'));
 expect(button('Confirm reviewed IRC action').disabled).toBe(true);
 expect(action).toHaveBeenCalledTimes(1);
 auth={...auth,userID:'43',csrf:'other',login:'bob'};setProfileScope('43');panel.authChanged();
 expect(draft.value).toBe('');expect(panel.root.querySelectorAll('option')).toHaveLength(0);
 expect(panel.root.querySelector('section')?.textContent).not.toContain('private IRC body');
 expect(button('Confirm reviewed IRC action').disabled).toBe(true);
});
