import {parseCommandList,type CommandTemplate} from './commands';
import {parseDisplay} from './display';
import {FONT_SIZES} from './display-data';
import {parsePresentation,type PresentationOptions} from './presentation';
import {parseSnapshot,type Workspace,type WorkspaceSnapshot} from './workspaces';
import type {SplitPane,SplitTab,SplitSnapshot} from './splits';

export interface ChatterinoSources {settings?:string;layout?:string;commands?:string}
export interface ChatterinoImport {workspaces:Workspace[];report:string[]}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function source(raw:string,label:string):Record<string,unknown>{
 if(new TextEncoder().encode(raw).length>256*1024)throw new Error(label+' must be at most 256 KB');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error(label+' is not valid JSON');}
 let nodes=0;
 function bounded(v:unknown,depth:number):void{
  if(++nodes>16000||depth>16)throw new Error('Import exceeds node/depth limits');
  if(Array.isArray(v)){for(const item of v)bounded(item,depth+1);}
  else if(record(v))for(const [key,item] of Object.entries(v)){
   if(['__proto__','constructor','prototype'].includes(key))throw new Error('Unsafe import key');
   bounded(item,depth+1);
  }
 }
 bounded(value,0);if(!record(value))throw new Error(label+' must be a JSON object');return value;
}
function at(value:Record<string,unknown>,path:string):unknown{
 let next:unknown=value;for(const part of path.split('/')){if(!record(next)||!Object.hasOwn(next,part))return undefined;next=next[part];}return next;
}
const booleans=[
 ['appearance/messages/showTimestamps','showTimestamps'],['appearance/messages/fadeMessageHistory','fadeHistory'],
 ['appearance/messages/hideModerated','hideModerated'],['appearance/messages/hideModerationActions','hideModerationActions'],
 ['appearance/messages/hideDeletionActions','hideDeletionActions'],['appearance/hideReplyContext','hideReplyContext'],
 ['appearance/showReplyButton','showReplyButton'],['appearance/stripReplyMention','stripReplyMention'],
 ['appearance/showEmptyInputBox','showEmptyInput'],['appearance/messages/showMessageLength','showLength'],
 ['appearance/messages/showSendWaitTimer','showWait'],['appearance/messages/boldUsernames','boldUsernames'],
 ['appearance/overlay/shadow','overlayShadow'],
] as const satisfies readonly (readonly [string,keyof PresentationOptions])[];
function appearance(value:Record<string,unknown>,base:WorkspaceSnapshot,report:string[]):WorkspaceSnapshot{
 const result=parseSnapshot(base),presentation=parsePresentation(result.settings.extras.presentation),display=parseDisplay(result.settings.display);let mapped=0;
 for(const [path,key] of booleans){const v=at(value,path);if(v===undefined)continue;if(typeof v!=='boolean')throw new Error(path+' must be boolean');Object.assign(presentation,{[key]:v});report.push(path+': '+String(parsePresentation(base.settings.extras.presentation)[key])+' → '+String(v));mapped++;}
 for(const [source,key] of [['backgroundOpacity','overlayBackgroundOpacity'],['shadowOpacity','overlayShadowOpacity'],['shadowOffsetX','overlayShadowOffsetX'],['shadowOffsetY','overlayShadowOffsetY'],['shadowRadius','overlayShadowRadius']] as const){const v=at(value,'appearance/overlay/'+source);if(v===undefined)continue;if(typeof v!=='number'||!Number.isSafeInteger(v))throw new Error('Overlay '+source+' must be an integer');const parsed=parsePresentation({[key]:v});presentation[key]=parsed[key];report.push('Overlay '+source+': '+v+' → '+parsed[key]);mapped++;}
 const shadowColor=at(value,'appearance/overlay/shadowColor');if(shadowColor!==undefined){if(typeof shadowColor!=='string')throw new Error('Overlay shadow color must be text');const color=/^#[\da-f]{3}$/i.test(shadowColor)?'#'+Array.from(shadowColor.slice(1)).map(c=>c+c).join(''):shadowColor;if(/^#[\da-f]{6}$/i.test(color)){presentation.overlayShadowColor=color.toLowerCase();report.push('Overlay shadow color mapped');mapped++;}else report.push('Unsupported native overlay shadow color excluded');}
 const format=at(value,'appearance/messages/timestampFormat');if(format!==undefined){if(typeof format!=='string')throw new Error('Timestamp format must be text');const parsed=parsePresentation({timestampFormat:format});if(parsed.timestampFormat!==format)report.push('Unsupported timestamp format excluded');else{report.push('Timestamp format: '+presentation.timestampFormat+' → '+format);presentation.timestampFormat=format;mapped++;}}
 for(const [path,key,on,off] of [['appearance/messages/separateMessages','separators','on','off'],['appearance/messages/alternateMessageBackground','alternating','on','off']] as const){const v=at(value,path);if(v===undefined)continue;if(typeof v!=='boolean')throw new Error(path+' must be boolean');presentation[key]=v?on:off;report.push(path+': mapped to '+presentation[key]);mapped++;}
 const size=at(value,'appearance/currentFontSize');if(size!==undefined){if(typeof size!=='number'||!Number.isFinite(size)||size<=0)throw new Error('Font size must be positive and numeric');const pixels=size*96/72;if(pixels<FONT_SIZES[0]!||pixels>FONT_SIZES.at(-1)!)report.push('Unsupported font size excluded');else{display.size=FONT_SIZES.reduce((best,n)=>Math.abs(n-pixels)<Math.abs(best-pixels)?n:best);report.push('Qt font size '+size+'pt → approximately '+display.size+'px in the browser');mapped++;}}
 const font=at(value,'appearance/currentFontFamily');if(font!==undefined){if(typeof font!=='string')throw new Error('Font family must be text');const map:Record<string,string>={'Segoe UI':'sans',Arial:'sans',Helvetica:'sans','Courier New':'mono',Menlo:'mono',Monaco:'mono',Consolas:'mono'};const target=map[font];if(target&&parseDisplay({font:target}).font===target){display.font=target;report.push('Font family mapped to '+target+' browser stack');mapped++;}else report.push('Unsupported native font family excluded');}
 result.settings.display=display;result.settings.extras.presentation=parsePresentation(presentation);
 report.push(mapped+' appearance setting(s) mapped; all other credential, native and unsupported settings excluded');return result;
}
function commands(value:Record<string,unknown>,existing:unknown,report:string[]):CommandTemplate[]{
 if(!Array.isArray(value.commands)||value.commands.length>50)throw new Error('commands.json needs at most 50 commands');
 const result=existing===undefined?[]:parseCommandList(existing),seen=new Set<string>();
 for(const item of value.commands){
  if(!record(item)||typeof item.name!=='string'||typeof item.func!=='string')throw new Error('Malformed command definition');
  const trigger=item.name.toLowerCase();if(seen.has(trigger))throw new Error('Duplicate command triggers');seen.add(trigger);
  if(result.some(c=>c.trigger.toLowerCase()===trigger)){report.push('Command trigger conflict: existing definition retained');continue;}
  if(/^\s*\/(exec|run|openurl|open|set|restart|debug|lua|script)(?:\s|$)/i.test(item.func)){report.push('Native/script command excluded');continue;}
  let valid:CommandTemplate[];try{valid=parseCommandList([{trigger:item.name,name:item.name,group:'Chatterino',body:item.func}]);}catch{report.push('Unsupported command trigger or placeholder excluded');continue;}
  result.push(...valid);if(result.length>50)throw new Error('Combined commands exceed 50 definitions');
 }
 report.push((result.length-(Array.isArray(existing)?existing.length:0))+' compatible command(s) added; definitions are text and are never executed by import');return parseCommandList(result);
}
function layout(value:Record<string,unknown>,base:WorkspaceSnapshot,label:string,report:string[]):Workspace[]{
 if(!Array.isArray(value.windows)||value.windows.length<1||value.windows.length>20)throw new Error('Layout needs 1–20 windows');
 const workspaces:Workspace[]=[];
 for(const [windowIndex,window] of value.windows.entries()){
  if(!record(window)||!Array.isArray(window.tabs)||window.tabs.length<1||window.tabs.length>8)throw new Error('Each window needs 1–8 tabs');
  const joined:string[]=[],tabs:SplitTab[]=[];
  for(const [tabIndex,tab] of window.tabs.entries()){
   if(!record(tab))throw new Error('Malformed tab');const panes:SplitPane[]=[];
   function visit(node:unknown,depth:number):void{
    if(depth>12||!record(node))throw new Error('Malformed or deep split layout');
    if(node.type==='horizontal'||node.type==='vertical'){
     if(!Array.isArray(node.items)||node.items.length>24)throw new Error('Malformed split container');
     if(node.type==='vertical')report.push('Vertical split geometry flattened into ordered browser panes');
     for(const child of node.items)visit(child,depth+1);return;
    }
    if(node.type!=='split'||!record(node.data))throw new Error('Unsupported or malformed split node');
    if(node.data.type!=='twitch'){report.push('Private/unsupported channel pane excluded');return;}
    if(typeof node.data.name!=='string'||!/^#?[a-zA-Z0-9_]{1,25}$/.test(node.data.name))throw new Error('Invalid Twitch channel in layout');
    const channel=node.data.name.replace(/^#/,'').toLowerCase();if(!joined.includes(channel))joined.push(channel);
    if(panes.length>=6)throw new Error('Keep at most six panes per tab');
    if(node.filters!==undefined||node.moderationMode===true||node.checkSpelling!==undefined)report.push('Native split filters, moderation mode and spelling override excluded');
    const weight=typeof node.flexh==='number'&&Number.isFinite(node.flexh)&&node.flexh>=1&&node.flexh<=4?node.flexh:1;
    if(node.flexh!==undefined&&node.flexh!==weight)report.push('Unsupported split weight replaced by equal browser width');
    panes.push({id:'pane-'+windowIndex+'-'+tabIndex+'-'+panes.length,channels:[channel],target:channel,filter:'',rules:[],reverse:false,pauseHover:false,weight,unread:0,reader:null});
   }
   visit(tab.splits2,0);if(!panes.length){report.push('Tab without supported Twitch channels excluded');continue;}
   const title=typeof tab.title==='string'&&tab.title.trim()?tab.title:'Tab '+(tabIndex+1);
   tabs.push({id:'tab-'+windowIndex+'-'+tabIndex,name:title,active:panes[0]!.id,panes});
  }
  if(!tabs.length){report.push('Window without supported Twitch tabs excluded');continue;}
  if(tabs.flatMap(t=>t.panes).length>24)throw new Error('Keep at most 24 panes per workspace');
  const chosen=window.tabs.findIndex(t=>record(t)&&t.selected===true),active=tabs.find(t=>t.id==='tab-'+windowIndex+'-'+chosen)??tabs[0]!;
  const splits:SplitSnapshot={version:1,enabled:true,active:active.id,tabs,closed:[]};
  const snapshot=parseSnapshot({...base,channels:joined,target:active.panes[0]!.target,readers:[],settings:{...base.settings,extras:{...base.settings.extras,splits}}});
  workspaces.push({...snapshot,id:'import-'+windowIndex,name:label+' '+(windowIndex+1)});
 }
 report.push('OS window geometry, popup type and nested split orientation are not restored');if(!workspaces.length)throw new Error('No supported Twitch channel layout found');return workspaces;
}
export function planChatterinoImport(sources:ChatterinoSources,current:WorkspaceSnapshot,label:string):ChatterinoImport{
 if(!label.trim()||label.trim().length>55||/[\x00-\x1f\x7f]/.test(label))throw new Error('Use an import name of 1–55 characters');
 for(const raw of Object.values(sources))if(new TextEncoder().encode(raw??'').length>256*1024)throw new Error('Each Chatterino file must be at most 256 KB');
 if(!Object.values(sources).some(v=>v?.trim()))throw new Error('Choose at least one Chatterino file');
 if(Object.values(sources).reduce((n,v)=>n+new TextEncoder().encode(v??'').length,0)>512*1024)throw new Error('Combined import must be at most 512 KB');
 const report:string[]=[],base=sources.settings?.trim()?appearance(source(sources.settings,'settings.json'),current,report):parseSnapshot(current);
 if(sources.commands?.trim())base.settings.extras.commands=commands(source(sources.commands,'commands.json'),base.settings.extras.commands,report);
 const workspaces=sources.layout?.trim()?layout(source(sources.layout,'window-layout.json'),base,label.trim(),report):[{...parseSnapshot(base),id:'import-0',name:label.trim()}];
 report.push('Before: '+current.channels.map(c=>'#'+c).join(', ')+'; after: '+workspaces.map(w=>w.name+' ['+w.channels.map(c=>'#'+c).join(', ')+']').join('; '));
 return {workspaces,report};
}
