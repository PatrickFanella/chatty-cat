import {getProfileScope,profileKey} from './account-profiles';
const key='chatthing:v1:overlay-onboarding';
// Called only after a current-account native open receipt. Storage is optional.
export function recordOverlayActivation(account:string):boolean{
 if(!/^[1-9][0-9]{0,19}$/.test(account)||getProfileScope()!==account)throw new Error('Overlay guide account changed');
 try{
  const storageKey=profileKey(key),raw=localStorage.getItem(storageKey);
  if(raw!==null){if(raw.length>128)return true;const value:unknown=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return true;const row=value as Record<string,unknown>;if(Object.keys(row).length!==2||row.version!==1||row.activated!==true)return true;return false;}
  localStorage.setItem(storageKey,JSON.stringify({version:1,activated:true}));
 }catch{/* Retain unreadable data; repeat guidance when storage is unavailable. */}
 return true;
}
