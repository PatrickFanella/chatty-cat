import {afterEach,expect,it,vi} from 'vitest';
import {DesktopCompanion} from './desktop-companion';
import {setProfileScope} from './account-profiles';
import type {AuthStatus} from './auth';
const auth:AuthStatus={enabled:true,loginURL:'https://chat.subcult.tv/api/auth/login',authenticated:true,userID:'42',login:'alice',csrf:'csrf'};
afterEach(()=>{vi.unstubAllGlobals();setProfileScope('anonymous');});
it('makes no local request until explicit pair; validates scope and uses no web credentials',async()=>{
 setProfileScope('42');const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({version:1,account:'42',token:'a'.repeat(64)})));vi.stubGlobal('fetch',fetcher);
 let current:AuthStatus|undefined=auth;const client=new DesktopCompanion(()=>current);expect(fetcher).not.toHaveBeenCalled();await client.pair('b'.repeat(64));expect(fetcher.mock.calls[0]![0]).toBe('http://127.0.0.1:47831/v1/pair');const init=fetcher.mock.calls[0]![1];expect(init.credentials).toBe('omit');expect(init.redirect).toBe('error');expect(init.body).not.toContain('csrf');expect(init.headers['Authorization']).toBeUndefined();
 current={...auth,userID:'43'};setProfileScope('43');await expect(client.status()).rejects.toThrow('account');client.disconnect();
});
it('binds review to account/channel and never retries uncertain launches automatically',async()=>{
 setProfileScope('42');const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({version:1,account:'42',token:'a'.repeat(64)}))).mockRejectedValue(new Error('network failed'));vi.stubGlobal('fetch',fetcher);const client=new DesktopCompanion(()=>auth);await client.pair('b'.repeat(64));
 await expect(client.launch({tool:'mpv',channel:'one;bad',quality:'best',requestID:'one'})).rejects.toThrow('Invalid');expect(fetcher).toHaveBeenCalledTimes(1);
 await expect(client.launch({tool:'mpv',channel:'one',quality:'audio_only',requestID:'one'})).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(2);client.disconnect();
});
it('discards pairing completed after the account changed',async()=>{
 setProfileScope('42');let finish!:(v:Response)=>void;const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',fetcher);let current=auth;const client=new DesktopCompanion(()=>current);const pending=client.pair('b'.repeat(64));current={...auth,userID:'43'};setProfileScope('43');finish(new Response(JSON.stringify({version:1,account:'42',token:'a'.repeat(64)})));await expect(pending).rejects.toThrow('account');client.disconnect();
});
