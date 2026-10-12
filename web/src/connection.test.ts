// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {ChatConnection} from './connection';
class Socket {static all:Socket[]=[];onopen:(()=>void)|undefined;onclose:(()=>void)|undefined;onmessage:((event:MessageEvent)=>void)|undefined;constructor(public url:string){Socket.all.push(this);}close(){this.onclose?.();}}
let connection:ChatConnection|undefined;
afterEach(()=>{connection?.stop();Socket.all=[];vi.useRealTimers();vi.unstubAllGlobals();});
it('backs off until actual upstream connection and retries immediately on network restoration',()=>{
 vi.useFakeTimers();vi.stubGlobal('WebSocket',Socket);const receive=vi.fn();connection=new ChatConnection(['one'],receive);connection.start();let socket=Socket.all[0]!;socket.onopen?.();socket.close();vi.advanceTimersByTime(1000);expect(Socket.all).toHaveLength(2);
 Socket.all[1]!.close();vi.advanceTimersByTime(1000);expect(Socket.all).toHaveLength(2);window.dispatchEvent(new Event('online'));expect(Socket.all).toHaveLength(3);
 socket=Socket.all[2]!;socket.onmessage?.(new MessageEvent('message',{data:JSON.stringify({type:'status',state:'connected'})}));socket.close();vi.advanceTimersByTime(1000);expect(Socket.all).toHaveLength(4);
 connection.stop();vi.advanceTimersByTime(60000);window.dispatchEvent(new Event('online'));expect(Socket.all).toHaveLength(4);
});
it('ignores queued data from a stopped connection',()=>{
 vi.stubGlobal('WebSocket',Socket);const receive=vi.fn();connection=new ChatConnection([],receive,'/api/auth/whispers');connection.start();const old=Socket.all[0]!;connection.stop();old.onmessage?.(new MessageEvent('message',{data:JSON.stringify({type:'status',state:'connected'})}));expect(receive).not.toHaveBeenCalled();
});
it('manual reconnect replaces the socket once and invalidates old callbacks and pending retries',()=>{
 vi.useFakeTimers();vi.stubGlobal('WebSocket',Socket);const receive=vi.fn();connection=new ChatConnection(['one'],receive);connection.start();const old=Socket.all[0]!;old.close();connection.reconnect();expect(Socket.all).toHaveLength(2);old.onmessage?.(new MessageEvent('message',{data:JSON.stringify({type:'status',state:'connected'})}));expect(receive).not.toHaveBeenCalledWith({type:'status',state:'connected'});vi.advanceTimersByTime(60000);expect(Socket.all).toHaveLength(2);connection.stop();connection.reconnect();expect(Socket.all).toHaveLength(2);
});
