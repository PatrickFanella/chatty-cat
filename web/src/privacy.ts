export interface PrivacyPolicy {version:1;enabled:boolean;allowed:string[];panic:boolean}
let fallback:PrivacyPolicy|undefined;
export function resetPrivacyFallback():void{fallback=undefined;}
export const PRIVACY_KEY='chatthing:v1:privacy';
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function parsePrivacy(value:unknown):PrivacyPolicy {
 if(value===null||value===undefined)return {version:1,enabled:false,allowed:[],panic:false};
 if(!record(value)||value.version!==1||typeof value.enabled!=='boolean')return {version:1,enabled:true,allowed:[],panic:true};
 const allowed=Array.isArray(value.allowed)?[...new Set(value.allowed.filter((v):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v)).slice(0,20))]:[];
 return {version:1,enabled:value.enabled===true,allowed,panic:value.panic===true};
}
export function readPrivacy():PrivacyPolicy{if(fallback)return fallback;let raw:string|null;try{raw=localStorage.getItem(PRIVACY_KEY);}catch{return parsePrivacy(null);}try{if(raw&&raw.length>16384)throw new Error();return parsePrivacy(raw?JSON.parse(raw):null);}catch{return {version:1,enabled:true,allowed:[],panic:true};}}
export function privacyEnabled():boolean{return readPrivacy().enabled;}
export function workspaceVisible(policy:PrivacyPolicy,id:string):boolean{return !policy.enabled||!policy.panic&&policy.allowed.includes(id);}
export function savePrivacy(policy:PrivacyPolicy):void {const safe=parsePrivacy(policy);try{localStorage.setItem(PRIVACY_KEY,JSON.stringify(safe));fallback=undefined;}catch{fallback=safe;throw new Error('Privacy applies only to this view; browser storage is unavailable and other tabs cannot be updated');}}
