import type {DisplayOptions} from './display';
export interface SettingsBundle {version:1;display:DisplayOptions;extras:Record<string,unknown>}
export type SettingsPart='picker'|'resources'|'video'|'stats'|'rail'|'splits';
const PARTS:SettingsPart[]=['picker','resources','video','stats','rail','splits'];
function extras(value:unknown):Record<string,unknown> {
 const result:Record<string,unknown>={};if(!value||typeof value!=='object'||Array.isArray(value))return result;
 try {const raw=JSON.stringify(value);if(raw.length>65536)return result;const data=JSON.parse(raw) as Record<string,unknown>;for(const key of PARTS)if(data[key]&&typeof data[key]==='object'&&!Array.isArray(data[key]))result[key]=data[key];}catch{/* malformed optional bundle */}return result;
}
export function parseBundle(value:unknown,parse:(value:unknown)=>DisplayOptions):SettingsBundle|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;const data=value as Record<string,unknown>;
 if(data.version!==undefined&&data.version!==1)return null;if(data.version===1&&(!data.display||typeof data.display!=='object'||Array.isArray(data.display)))return null;
 return {version:1,display:parse(data.version===1?data.display:data),extras:data.version===1?extras(data.extras):{}};
}
export function captureBundle(display:DisplayOptions):SettingsBundle {const detail:Record<string,unknown>={};document.dispatchEvent(new CustomEvent('capture-settings',{detail}));return {version:1,display:{...display},extras:extras(detail)};}
export function restoreBundle(bundle:SettingsBundle):void {document.dispatchEvent(new CustomEvent('restore-settings',{detail:extras(bundle.extras)}));}
export function registerSettings(part:SettingsPart,capture:()=>unknown,restore:(value:unknown)=>void):()=>void {
 const save=(event:Event):void=>{if(event instanceof CustomEvent&&event.detail&&typeof event.detail==='object')event.detail[part]=capture();};
 const load=(event:Event):void=>{if(event instanceof CustomEvent&&event.detail&&typeof event.detail==='object'&&Object.hasOwn(event.detail,part))restore(event.detail[part]);};
 document.addEventListener('capture-settings',save);document.addEventListener('restore-settings',load);return ()=>{document.removeEventListener('capture-settings',save);document.removeEventListener('restore-settings',load);};
}
