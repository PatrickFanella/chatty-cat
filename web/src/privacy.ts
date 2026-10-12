export interface PrivacyPolicy {version:1;enabled:boolean;allowed:string[];panic:boolean}
export const PRIVACY_KEY='chatthing:v1:privacy';
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function parsePrivacy(value:unknown):PrivacyPolicy {
 if(value===null||value===undefined)return {version:1,enabled:false,allowed:[],panic:false};
 if(!record(value)||value.version!==1)return {version:1,enabled:true,allowed:[],panic:true};
 const allowed=Array.isArray(value.allowed)?[...new Set(value.allowed.filter((v):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v)).slice(0,20))]:[];
 return {version:1,enabled:value.enabled===true,allowed,panic:value.panic===true};
}
export function readPrivacy():PrivacyPolicy{try{const raw=localStorage.getItem(PRIVACY_KEY);return parsePrivacy(raw?JSON.parse(raw):null);}catch{return {version:1,enabled:true,allowed:[],panic:true};}}
export function privacyEnabled():boolean{return readPrivacy().enabled;}
export function workspaceVisible(policy:PrivacyPolicy,id:string):boolean{return !policy.enabled||!policy.panic&&policy.allowed.includes(id);}
export function savePrivacy(policy:PrivacyPolicy):void {const safe=parsePrivacy(policy);try{localStorage.setItem(PRIVACY_KEY,JSON.stringify(safe));}catch{throw new Error('Could not save privacy mode; other tabs cannot be protected');}}
