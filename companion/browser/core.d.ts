export interface BridgeState{pending?:{code:string;expires:number;attempts:number}|null;session?:{account:string;tab:number;token:string;expires:number;lastSeen:number;lastPoll:number;seq:number;watched:{channel:string;seq:number;expires:number}|null}|null}
export function watchedChannel(value:string):string|null;
export function pairingCode(state:BridgeState,now?:number):string;
export function external(state:BridgeState,message:unknown,sender:unknown,now?:number):Record<string,unknown>;
export function sendWatched(state:BridgeState,url:string,now?:number):{tab:number;channel:string};
