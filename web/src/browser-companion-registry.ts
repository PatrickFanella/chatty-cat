import {getProfileScope,profileKey} from './account-profiles';
export interface RegisteredBrowserCompanion {id:string;name:string}
const key='chatthing:v1:browser-companions';
const validID=(id:string)=>/^[a-p]{32}$/.test(id);
function parse(value:unknown):RegisteredBrowserCompanion[]{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid saved browser companion registry; existing data retained');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['version','companions'].includes(k))||v.version!==1||!Array.isArray(v.companions)||v.companions.length>8)throw new Error('Invalid saved browser companion registry; existing data retained');
 const rows=v.companions.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==2||Object.keys(row).some(k=>!['id','name'].includes(k))||typeof row.id!=='string'||!validID(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>64||/[\x00-\x1f\x7f]/.test(row.name))throw new Error('Invalid saved browser companion identity; existing data retained');
  return {id:row.id,name:row.name};
 });
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('Duplicate saved browser companion IDs; existing data retained');return rows;
}
export class BrowserCompanionRegistry {
 private raw:string|null;private entries:RegisteredBrowserCompanion[];private storageKey:string;
 constructor(private account:string){this.scope();this.storageKey=profileKey(key);this.raw=localStorage.getItem(this.storageKey);if(this.raw!==null&&new TextEncoder().encode(this.raw).length>4096)throw new Error('Saved browser companion registry exceeds 4 KiB; existing data retained');try{this.entries=this.raw===null?[]:parse(JSON.parse(this.raw));}catch{throw new Error('Saved browser companion registry is unreadable; existing data retained');}}
 private scope():void{if(!/^[1-9][0-9]{0,19}$/.test(this.account)||getProfileScope()!==this.account)throw new Error('Browser companion registry account changed');}
 all():RegisteredBrowserCompanion[]{this.scope();if(localStorage.getItem(this.storageKey)!==this.raw)throw new Error('Browser companions changed in another tab; reopen before editing');return this.entries.map(r=>({...r}));}
 private write(rows:RegisteredBrowserCompanion[]):void{this.all();if(rows.length>8)throw new Error('Keep at most eight registered browser companions');const value={version:1,companions:rows};parse(value);const raw=JSON.stringify(value);if(new TextEncoder().encode(raw).length>4096)throw new Error('Browser companion registry exceeds 4 KiB');localStorage.setItem(this.storageKey,raw);this.raw=raw;this.entries=rows;}
 remember(id:string,name:string):void{if(!validID(id)||!name.trim()||name.trim().length>64||/[\x00-\x1f\x7f]/.test(name))throw new Error('Use a Chromium extension ID and a name of 1–64 characters');const rows=this.all(),index=rows.findIndex(r=>r.id===id);const row={id,name:name.trim()};if(index<0)rows.push(row);else rows[index]=row;this.write(rows);}
 forget(id:string):void{const rows=this.all();if(!rows.some(r=>r.id===id))throw new Error('Choose a registered companion to forget');this.write(rows.filter(r=>r.id!==id));}
}
