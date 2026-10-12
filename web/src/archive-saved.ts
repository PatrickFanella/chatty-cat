import {parseArchiveQuery} from './archive-query';
export interface SavedArchiveQuery {id:string;name:string;query:string}
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function parseSavedArchiveQueries(raw:string):SavedArchiveQuery[] {
 if(raw.length>32768)throw new Error('Saved queries exceed 32 KB');
 const value:unknown=JSON.parse(raw);
 if(!object(value)||value.version!==1||!Array.isArray(value.queries)||value.queries.length>20)throw new Error('Invalid saved queries; delete stored queries to recover');
 const ids=new Set<string>();return value.queries.map(entry=>{
  if(!object(entry)||typeof entry.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(entry.id)||ids.has(entry.id)||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>80||typeof entry.query!=='string')throw new Error('Invalid saved query');
  ids.add(entry.id);parseArchiveQuery(entry.query);return {id:entry.id,name:entry.name,query:entry.query};
 });
}
export class SavedArchiveQueries {
 private account:string|undefined;
 setAccount(id:string|undefined):void{if(id!==undefined&&!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new Error('Invalid saved-query account');this.account=id;}
 get key():string|undefined{return this.account===undefined?undefined:'chatthing:v1:archive-queries:'+this.account;}
 list():SavedArchiveQuery[]{const raw=this.key?localStorage.getItem(this.key):null;return raw?parseSavedArchiveQueries(raw):[];}
 save(name:string,query:string):void {
  if(!this.key)throw new Error('Wait for Twitch login status before saving');
  if(!name.trim()||name.trim().length>80)throw new Error('Name the query using 1–80 characters');
  parseArchiveQuery(query);const list=this.list(),existing=list.find(entry=>entry.name===name.trim());
  if(existing)existing.query=query;else{if(list.length>=20)throw new Error('Delete a saved query before adding more than 20');list.push({id:crypto.randomUUID(),name:name.trim(),query});}
  localStorage.setItem(this.key,JSON.stringify({version:1,queries:list}));
 }
 delete(id:string):void{if(this.key)localStorage.setItem(this.key,JSON.stringify({version:1,queries:this.list().filter(entry=>entry.id!==id)}));}
 clear():void{if(this.key)localStorage.removeItem(this.key);}
}
