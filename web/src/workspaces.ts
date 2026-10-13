import {profileKey} from './account-profiles';
import {parsePresentation} from './presentation';
import {parseRules} from './rules';
import {parseSimilarity} from './similar';
import { parseDisplay } from './display';
import type { SettingsBundle } from './settings-bundle';
import { parseWorkspaceChannels } from './protocol';
import {parseSplits} from './splits';
import {parseHotkeys} from './hotkeys';
import {parseCommandList} from './commands';

export interface ReaderPosition { column:number; key:string; offset:number }
export interface WorkspaceSnapshot { channels:string[]; target:string; focus:string; settings:SettingsBundle; readers:ReaderPosition[] }
export interface Workspace extends WorkspaceSnapshot { id:string; name:string }
const KEY='chatthing:v1:workspaces';
const MAX_BYTES=256*1024;
const MAX_WORKSPACES=20;
const FOCUS=['log','message','picker-open','archive-open','display-open','video-open'];
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function name(value:unknown):string {
 if(typeof value!=='string'||!value.trim()||value.trim().length>60||/[\x00-\x1f\x7f]/.test(value))throw new Error('Use a workspace name of 1–60 characters');
 return value.trim();
}
// Only public preferences captured by existing panel controllers are portable.
// Unknown nested fields, tokens, private drafts and conversation data are discarded.
function fields(value:unknown,keys:readonly string[]):Record<string,unknown>{
 const result:Record<string,unknown>={};if(!object(value))return result;
 for(const key of keys){const v=value[key];if(typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=1000)result[key]=v;
  else if(Array.isArray(v)&&v.length<=20&&v.every(item=>typeof item==='string'&&item.length<=60))result[key]=[...v];}
 return result;
}
function publicExtras(value:unknown,channels:readonly string[]):Record<string,unknown>{
 if(!object(value))return {};const result:Record<string,unknown>={};
 const geometry=(v:unknown):Record<string,unknown>=>{const data=fields(v,['pinned','open']);if(object(v)&&object(v.box))data.box=fields(v.box,['left','top','width','height']);return data;};
 for(const part of ['picker','video','resources','stats','rail']){
  const v=value[part];if(!object(v))continue;
  let data:Record<string,unknown>={};
  if(part==='picker'){if(object(v.options))data.options=fields(v.options,['enabled','mixed','sort','animation','seenOnly','ages','ageRows','names','zoom','hold','holdPlus','frozen','emojiStyle','emojiCategory','emojiTone']);}
  if(part==='video'){if(object(v.options))data.options=fields(v.options,['channel','volume','muted','docked','rememberVolume']);}
  if(part==='resources'){data=fields(v,['tab']);if(object(v.authors))data.authors=fields(v.authors,['info','sort']);}
  if(part==='stats'){data=fields(v,['open','badgeOrder','scope','channel','excluded']);if(object(v.windows))data.windows=fields(v.windows,['users','emotes','badges','links']);}
  if(part==='rail')data=fields(v,['fraction','floating']);
  if(['picker','video','resources'].includes(part)&&object(v.floating))data.floating=geometry(v.floating);
  result[part]=data;
 }
 const splits=parseSplits(value.splits,channels);if(value.splits!==undefined&&!splits)throw new Error('Workspace pane layout is invalid or exceeds 32 KB');if(splits)result.splits=splits;
 const hotkeys=parseHotkeys(value.hotkeys);if(value.hotkeys!==undefined&&!hotkeys)throw new Error('Workspace shortcuts are invalid or conflicting');if(hotkeys)result.hotkeys=hotkeys;
 if(value.presentation!==undefined)result.presentation=parsePresentation(value.presentation);
 if(value.commands!==undefined)result.commands=parseCommandList(value.commands);
 if(value.rules!==undefined){if(!object(value.rules))throw new Error('Invalid workspace rules');const v=value.rules;result.rules={version:1,rules:parseRules(v),similarity:parseSimilarity(v.similarity),preferences:fields(v.preferences,['muted','quietStart','quietEnd'])};}
 return result;
}
export function parseSnapshot(value:unknown):WorkspaceSnapshot {
 if(!object(value)||!Array.isArray(value.channels)||!value.channels.every(v=>typeof v==='string'))throw new Error('Workspace channels are invalid');
 const channels=parseWorkspaceChannels(value.channels.join(','));
 if(!channels.includes(String(value.target)))throw new Error('The send target must be a joined channel');
 if(!object(value.settings)||value.settings.version!==1||!object(value.settings.display))throw new Error('Workspace settings are invalid');
 const readers:ReaderPosition[]=[];
 if(Array.isArray(value.readers))for(const v of value.readers.slice(0,3))if(object(v)&&Number.isInteger(v.column)&&Number(v.column)>=0&&Number(v.column)<3&&typeof v.key==='string'&&v.key.length<=1000&&channels.includes(v.key.split(':')[0]!)&&typeof v.offset==='number'&&Number.isFinite(v.offset)&&Math.abs(v.offset)<=100000)readers.push({column:Number(v.column),key:v.key,offset:v.offset});
 return {channels,target:String(value.target),focus:FOCUS.includes(String(value.focus))?String(value.focus):'log',settings:{version:1,display:parseDisplay(value.settings.display),extras:publicExtras(value.settings.extras,channels)},readers};
}
function parseWorkspace(value:unknown):Workspace {
 if(!object(value)||typeof value.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(value.id))throw new Error('Workspace identity is invalid');
 return {...parseSnapshot(value),id:value.id,name:name(value.name)};
}
export function parseWorkspaceFile(raw:string):Workspace[]{
 if(new TextEncoder().encode(raw).length>MAX_BYTES)throw new Error('Workspace files must be at most 256 KB');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('Workspace file is not valid JSON');}
 if(!object(value)||value.format!=='chatty-cat-workspaces'||value.version!==1||!Array.isArray(value.workspaces)||value.workspaces.length<1||value.workspaces.length>MAX_WORKSPACES)throw new Error('Unsupported workspace file or workspace count (1–20)');
 const result=value.workspaces.map(parseWorkspace);if(new Set(result.map(w=>w.id)).size!==result.length)throw new Error('Duplicate workspace identities');return result;
}
export function workspaceFile(workspaces:readonly Workspace[]):string {
 const raw=JSON.stringify({format:'chatty-cat-workspaces',version:1,workspaces:workspaces.map(parseWorkspace)},null,2);
 parseWorkspaceFile(raw);return raw;
}
export class WorkspaceStore {
 private workspaces:Workspace[]=[];
 private activeID='';
 private savedRaw:string|null=null;
 error='';
 constructor(){try{const raw=localStorage.getItem(profileKey(KEY));this.savedRaw=raw;if(raw){if(new TextEncoder().encode(raw).length>MAX_BYTES)throw new Error('Saved workspaces exceed 256 KB');const value:unknown=JSON.parse(raw);if(!object(value)||value.version!==1||!Array.isArray(value.workspaces))throw new Error('Saved workspace data is invalid');this.workspaces=parseWorkspaceFile(JSON.stringify({format:'chatty-cat-workspaces',version:1,workspaces:value.workspaces}));this.activeID=typeof value.active==='string'&&this.get(value.active)?value.active:'';}}catch{this.error='Saved workspaces could not be read; existing data was retained';}}
 all():Workspace[]{return this.workspaces.map(w=>parseWorkspace(w));}
 get(id:string):Workspace|undefined {const w=this.workspaces.find(w=>w.id===id);return w?parseWorkspace(w):undefined;}
 get active():Workspace|undefined{return this.get(this.activeID);}
 private write(next:Workspace[],active=this.activeID):void {
  if(this.error)throw new Error(this.error);
  if(localStorage.getItem(profileKey(KEY))!==this.savedRaw)throw new Error('Workspaces changed in another tab; reload before saving');
  const raw=JSON.stringify({version:1,active,workspaces:next});if(new TextEncoder().encode(raw).length>MAX_BYTES||next.length>MAX_WORKSPACES)throw new Error('Workspace limit reached (20 workspaces / 256 KB)');
  try{localStorage.setItem(profileKey(KEY),raw);}catch{throw new Error('Could not save workspaces; free browser storage and retry');}
  this.workspaces=next;this.activeID=active;this.savedRaw=raw;
 }
 create(label:string,snapshot:WorkspaceSnapshot):Workspace {
  const workspace={...parseSnapshot(snapshot),id:crypto.randomUUID(),name:name(label)};this.write([...this.workspaces,workspace]);return workspace;
 }
 update(id:string,snapshot:WorkspaceSnapshot):void{const current=this.get(id);if(!current)throw new Error('Workspace no longer exists');this.write(this.workspaces.map(w=>w.id===id?{...current,...parseSnapshot(snapshot)}:w));}
 rename(id:string,label:string):void{if(!this.get(id))throw new Error('Workspace no longer exists');const valid=name(label);this.write(this.workspaces.map(w=>w.id===id?{...w,name:valid}:w));}
 duplicate(id:string,label:string):Workspace{const w=this.get(id);if(!w)throw new Error('Workspace no longer exists');return this.create(label,w);}
 remove(id:string):void{if(id===this.activeID)throw new Error('Switch to another workspace before deleting the active workspace');if(this.workspaces.length<=1)throw new Error('Keep at least one saved workspace');this.write(this.workspaces.filter(w=>w.id!==id));}
 activate(id:string):void{if(!this.get(id))throw new Error('Workspace no longer exists');this.write(this.workspaces,id);}
 import(workspaces:Workspace[]):void {const incoming=parseWorkspaceFile(workspaceFile(workspaces));if(this.workspaces.length+incoming.length>MAX_WORKSPACES)throw new Error('Import exceeds 20 workspaces');this.write([...this.workspaces,...incoming.map(w=>({...w,id:crypto.randomUUID()}))]);}
}
