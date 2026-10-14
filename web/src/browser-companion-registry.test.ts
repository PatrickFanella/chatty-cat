// @vitest-environment happy-dom
import {afterEach,expect,it} from 'vitest';
import {BrowserCompanionRegistry} from './browser-companion-registry';
import {setProfileScope,profileKey} from './account-profiles';
afterEach(()=>{localStorage.clear();setProfileScope('anonymous');});
it('persists only bounded public identities, isolates accounts and refuses stale edits',()=>{
 setProfileScope('42');const first=new BrowserCompanionRegistry('42');first.remember('a'.repeat(32),'Main Chromium');const stale=new BrowserCompanionRegistry('42');first.remember('b'.repeat(32),'Other compatible companion');expect(()=>stale.forget('a'.repeat(32))).toThrow('another tab');
 expect(new BrowserCompanionRegistry('42').all()).toHaveLength(2);setProfileScope('43');expect(new BrowserCompanionRegistry('43').all()).toEqual([]);expect(()=>first.all()).toThrow('account');setProfileScope('42');first.forget('a'.repeat(32));expect(first.all()).toEqual([{id:'b'.repeat(32),name:'Other compatible companion'}]);
});
it('rejects malformed/private records and enforces the eight-ID limit',()=>{
 setProfileScope('42');const registry=new BrowserCompanionRegistry('42');expect(()=>registry.remember('https://evil','URL')).toThrow();expect(()=>registry.remember('a'.repeat(32),'\n')).toThrow();for(let i=0;i<8;i++)registry.remember(String.fromCharCode(97+i).repeat(32),'Browser '+i);expect(()=>registry.remember('i'.repeat(32),'Ninth')).toThrow('eight');
 const key=profileKey('chatthing:v1:browser-companions');localStorage.setItem(key,JSON.stringify({version:1,companions:[{id:'a'.repeat(32),name:'Bad',token:'secret'}]}));expect(()=>new BrowserCompanionRegistry('42')).toThrow();expect(localStorage.getItem(key)).toContain('secret');localStorage.setItem(key,'😺'.repeat(1025));expect(()=>new BrowserCompanionRegistry('42')).toThrow('4 KiB');expect(localStorage.getItem(key)?.length).toBe(2050);
});
