import {afterEach,expect,it,vi} from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('never answers hosted uploads from image cache and removes old cached uploads on activation',async()=>{const listeners=new Map<string,(event:unknown)=>void>(),remove=vi.fn(async(_request:Request)=>true),match=vi.fn(),open=vi.fn(async(bucket:string)=>({keys:async()=>bucket==='chatthing-images-v1'?[new Request('https://chat.subcult.tv/uploads/'+'a'.repeat(32)),new Request('https://cdn.example.com/emote.png')]:[],delete:remove,match}));vi.stubGlobal('fetch',vi.fn(async()=>new Response('fixture',{status:200})));vi.stubGlobal('caches',{open,keys:async()=>['chatthing-shell-v1','chatthing-images-v1','chatthing-fonts-v1']});vi.stubGlobal('self',{location:{origin:'https://chat.subcult.tv'},clients:{claim:vi.fn(async()=>{})},addEventListener:(name:string,handler:(event:unknown)=>void)=>listeners.set(name,handler)});await import('./service-worker');const respondWith=vi.fn();listeners.get('fetch')?.({request:{url:'https://chat.subcult.tv/uploads/'+'a'.repeat(32),method:'GET',destination:'image'},respondWith});expect(respondWith).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();let done:Promise<unknown>|undefined;listeners.get('activate')?.({waitUntil:(p:Promise<unknown>)=>{done=p;}});await done;expect(remove).toHaveBeenCalledOnce();expect(remove.mock.calls[0]?.[0]).toBeInstanceOf(Request);});

it('returns opaque images from the network without storing quota-padded responses',async()=>{
 const listeners=new Map<string,(event:any)=>void>(),put=vi.fn(),response={ok:false,type:'opaque',clone:vi.fn()},fetcher=vi.fn(async()=>response);
 vi.stubGlobal('fetch',fetcher);vi.stubGlobal('caches',{open:async()=>({match:async()=>undefined,put,keys:async()=>[]})});
 vi.stubGlobal('self',{location:{origin:'https://chat.subcult.tv'},addEventListener:(name:string,handler:(event:any)=>void)=>listeners.set(name,handler)});
 await import('./service-worker');let result:Promise<unknown>|undefined;
 listeners.get('fetch')!({request:{url:'https://cdn.example.com/emote.png',method:'GET',destination:'image'},respondWith:(p:Promise<unknown>)=>{result=p;}});
 expect(await result).toBe(response);expect(fetcher).toHaveBeenCalledOnce();expect(put).not.toHaveBeenCalled();
});
it('prunes legacy opaque image and font entries without clearing readable caches or private storage',async()=>{
 const listeners=new Map<string,(event:any)=>void>(),opaque=new Request('https://cdn.example.com/opaque'),readable=new Request('https://cdn.example.com/readable'),remove=vi.fn(async(_request:Request)=>true),deleteBucket=vi.fn();
 vi.stubGlobal('caches',{keys:async()=>['chatthing-images-v1','chatthing-fonts-v1','chatthing-shell-v1'],delete:deleteBucket,open:async()=>({keys:async()=>[opaque,readable],match:async(r:Request)=>({type:r===opaque?'opaque':'cors'}),delete:remove})});
 vi.stubGlobal('self',{location:{origin:'https://chat.subcult.tv'},clients:{claim:vi.fn(async()=>{})},addEventListener:(name:string,handler:(event:any)=>void)=>listeners.set(name,handler)});
 await import('./service-worker');let done:Promise<unknown>|undefined;listeners.get('activate')!({waitUntil:(p:Promise<unknown>)=>{done=p;}});await done;
 expect(remove.mock.calls.map(c=>c[0])).toEqual([opaque,opaque]);expect(deleteBucket).not.toHaveBeenCalled();
});
