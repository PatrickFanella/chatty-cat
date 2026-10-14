import {expect,it} from 'vitest';
import {external,pairingCode,sendWatched,watchedChannel,type BridgeState} from '../../companion/browser/core.js';
const sender={origin:'https://chat.subcult.tv',url:'https://chat.subcult.tv/?channel=one',frameId:0,tab:{id:1}};
it('accepts only canonical Twitch channel pages',()=>{expect(watchedChannel('https://www.twitch.tv/Patrick__eff?referrer=x')).toBe('patrick__eff');for(const value of ['http://www.twitch.tv/one','https://evil.test/one','https://www.twitch.tv/videos/1','https://www.twitch.tv/directory','https://one@www.twitch.tv/one','https://www.twitch.tv:443/one/extra'])expect(watchedChannel(value)).toBeNull();});
it('requires one-use pairing, exact sender origin/tab/account and an active heartbeat',()=>{
 const state:BridgeState={};const code=pairingCode(state,100000);const pair={version:1,kind:'pair',account:'42',code};
 expect(external(state,pair,{...sender,origin:'https://evil.test'},100001).ok).toBe(false);const receipt=external(state,pair,sender,100002);expect(receipt.ok).toBe(true);expect(external(state,pair,sender,100003).ok).toBe(false);
 const poll={version:1,kind:'poll',account:'42',token:receipt.token};expect(external(state,poll,{...sender,tab:{id:2}},101003).ok).toBe(false);expect(external(state,{...poll,account:'43'},sender,101003).ok).toBe(false);
 expect(sendWatched(state,'https://www.twitch.tv/one',101004).channel).toBe('one');expect(external(state,poll,sender,102004).watched).toEqual({channel:'one',seq:1});expect(external(state,poll,sender,102005).ok).toBe(false);expect(external(state,poll,sender,140000).ok).toBe(false);expect(()=>sendWatched(state,'https://www.twitch.tv/one',140001)).toThrow('pair');
});
it('unpair removes capability and never returns cookies or private app fields',()=>{const state:BridgeState={};const code=pairingCode(state,100000);const r=external(state,{version:1,kind:'pair',account:'42',code},sender,100001);const result=external(state,{version:1,kind:'unpair',account:'42',token:r.token},sender,100002);expect(result.ok).toBe(true);expect(state.session).toBeNull();expect(JSON.stringify(result)).not.toMatch(/cookie|csrf|login|workspace|token/);});
