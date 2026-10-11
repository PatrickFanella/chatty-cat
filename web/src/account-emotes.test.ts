// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { AccountEmotes, parseAccountEmotes } from './account-emotes';
import { PickerModel } from './picker-model';
const emote = { code: 'SubDance', url: 'https://static-cdn.jtvnw.net/emoticons/v2/abc/animated/dark/2.0', staticUrl: 'https://static-cdn.jtvnw.net/emoticons/v2/abc/static/dark/2.0', source: 'Twitch', animated: true, zeroWidth: false };
const auth = { enabled: true, authenticated: true, loginURL: 'https://chat.subcult.tv/api/auth/login', userID: '42', login: 'alice', csrf: 'csrf', emotesEnabled: true };
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it('validates bounded account pages and restricts the Twitch CDN', () => {
  expect(parseAccountEmotes({ emotes: [emote], after: 'next' }).emotes).toEqual([emote]);
  for (const value of [null, {emotes:[emote],after:'\n'}, {emotes:[{...emote,url:'https://evil.test/image'}],after:''}, {emotes:[{...emote,code:'bad name'}],after:''}]) expect(() => parseAccountEmotes(value)).toThrow();
});
it('loads pages with channel context, publishes only the complete set and clears on logout', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({emotes:[emote],after:'a+b'})}).mockResolvedValueOnce({ok:true,json:async()=>({emotes:[{...emote,code:'Other'}],after:''})});
  vi.stubGlobal('fetch',fetcher);
  const receive=vi.fn();const status=document.createElement('span');const loader=new AccountEmotes(receive,status);
  loader.update(auth,'hasanabi'); await vi.waitFor(()=>expect(status.textContent).toBe('2 account emotes'));
  expect(fetcher.mock.calls[1]?.[0]).toBe('/api/auth/emotes?channel=hasanabi&after=a%2Bb');
  expect(receive.mock.lastCall?.[0]).toHaveLength(2);
  loader.update(auth,'hasanabi');expect(fetcher).toHaveBeenCalledTimes(2);
  loader.update(undefined,'hasanabi');expect(receive.mock.lastCall?.[0]).toEqual([]);loader.stop();
});
it('rejects repeated pagination and handles missing scope', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({emotes:[emote],after:'same'})}));
  const receive=vi.fn();const status=document.createElement('span');const loader=new AccountEmotes(receive,status);
  loader.update({...auth,emotesEnabled:false},'hasanabi');expect(status.textContent).toContain('log in again');
  loader.update(auth,'hasanabi');await vi.waitFor(()=>expect(status.textContent).toContain('safe limit'));
  expect(receive.mock.calls.every(call=>call[0].length===0)).toBe(true);loader.stop();
});
it('discards a late response after switching accounts', async () => {
  let resolve: (value:unknown)=>void=()=>{};
  vi.stubGlobal('fetch',vi.fn().mockReturnValue(new Promise(done=>{resolve=done;})));
  const receive=vi.fn();const status=document.createElement('span');const loader=new AccountEmotes(receive,status);
  loader.update(auth,'hasanabi');loader.update(undefined,'hasanabi');resolve({ok:true,json:async()=>({emotes:[emote],after:''})});
  await new Promise(done=>setTimeout(done,0));expect(receive.mock.calls.every(call=>call[0].length===0)).toBe(true);expect(status.textContent).toBe('');loader.stop();
});
it('account emotes override observed formats and disappear when cleared',()=>{
 const model=new PickerModel();model.setAccount([emote]);expect(model.catalog('hasanabi').find(item=>item.code==='SubDance')?.emote?.animated).toBe(true);
 model.setAccount([]);expect(model.catalog('hasanabi').some(item=>item.code==='SubDance')).toBe(false);
});
