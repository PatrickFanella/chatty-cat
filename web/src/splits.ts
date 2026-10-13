export interface SplitPane {id:string;channels:string[];target:string;filter:string;rules?:string[];reverse:boolean;pauseHover:boolean;weight:number;unread:number;reader:{key:string;offset:number}|null}
export interface SplitTab {id:string;name:string;active:string;panes:SplitPane[]}
type ClosedSplit={kind:'pane';tab:string;pane:SplitPane}|{kind:'tab';tab:SplitTab};
export interface SplitSnapshot {version:1;enabled:boolean;active:string;tabs:SplitTab[];closed:ClosedSplit[]}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function identity(value:unknown):value is string{return typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);}
function parsePane(value:unknown,joined:readonly string[]):SplitPane|null {
 if(!record(value)||!identity(value.id)||!Array.isArray(value.channels)||value.channels.length<1||value.channels.length>6)return null;
 const channels=value.channels.filter((c):c is string=>typeof c==='string'&&joined.includes(c));
 if(channels.length!==value.channels.length||new Set(channels).size!==channels.length||typeof value.target!=='string'||!channels.includes(value.target))return null;
 if(typeof value.filter!=='string'||value.filter.length>200||/[\x00-\x1f\x7f]/.test(value.filter))return null;
 if(typeof value.weight!=='number'||!Number.isFinite(value.weight)||value.weight<1||value.weight>4)return null;
 let reader:SplitPane['reader']=null;
 if(record(value.reader)&&typeof value.reader.key==='string'&&value.reader.key.length<=1000&&channels.includes(value.reader.key.split(':')[0]!)&&typeof value.reader.offset==='number'&&Number.isFinite(value.reader.offset)&&Math.abs(value.reader.offset)<=100000)reader={key:value.reader.key,offset:value.reader.offset};
 if(value.rules!==undefined&&(!Array.isArray(value.rules)||value.rules.length>32||value.rules.some(id=>!identity(id))))return null;
 return {id:value.id,channels,target:value.target,filter:value.filter,rules:Array.isArray(value.rules)?[...new Set(value.rules as string[])]:[],reverse:value.reverse===true,pauseHover:value.pauseHover===true,weight:value.weight,unread:typeof value.unread==='number'&&Number.isInteger(value.unread)?Math.max(0,Math.min(9999,value.unread)):0,reader};
}
function parseTab(value:unknown,joined:readonly string[]):SplitTab|null {
 if(!record(value)||!identity(value.id)||typeof value.name!=='string'||!value.name.trim()||value.name.length>60||/[\x00-\x1f\x7f]/.test(value.name)||!Array.isArray(value.panes)||value.panes.length<1||value.panes.length>6)return null;
 const panes:SplitPane[]=[];for(const item of value.panes){const pane=parsePane(item,joined);if(!pane)return null;panes.push(pane);}
 if(!panes.some(p=>p.id===value.active))return null;return {id:value.id,name:value.name.trim(),active:String(value.active),panes};
}
// Workspace files carry public view preferences only, never drafts or messages.
export function parseSplits(value:unknown,joined:readonly string[]):SplitSnapshot|null {
 if(!record(value)||value.version!==1||typeof value.enabled!=='boolean'||!Array.isArray(value.tabs)||value.tabs.length<1||value.tabs.length>8)return null;
 const tabs:SplitTab[]=[];for(const item of value.tabs){const tab=parseTab(item,joined);if(!tab)return null;tabs.push(tab);}
 if(tabs.flatMap(t=>t.panes).length>24||!tabs.some(t=>t.id===value.active))return null;
 const ids=tabs.flatMap(t=>[t.id,...t.panes.map(p=>p.id)]);if(new Set(ids).size!==ids.length)return null;
 const closed:ClosedSplit[]=[];
 if(Array.isArray(value.closed))for(const item of value.closed.slice(-8)){
  if(!record(item))continue;
  if(item.kind==='pane'&&identity(item.tab)){const pane=parsePane(item.pane,joined);if(pane)closed.push({kind:'pane',tab:item.tab,pane});}
  else if(item.kind==='tab'){const tab=parseTab(item.tab,joined);if(tab)closed.push({kind:'tab',tab});}
 }
 const result:SplitSnapshot={version:1,enabled:value.enabled||joined.length>6,active:String(value.active),tabs,closed};
 return new TextEncoder().encode(JSON.stringify(result)).length<=32768?result:null;
}
// Channel edits retain surviving public preferences and place newly joined sources
// into bounded groups. Channels whose panes were deliberately closed stay closed.
export function reconcileSplits(value:unknown,joined:readonly string[],previous?:readonly string[]):SplitSnapshot|null {
 if(!joined.length||joined.length>24)return null;
 if(!previous){if(!record(value)||!Array.isArray(value.tabs))return null;const names:string[]=[];for(const tab of value.tabs){if(!record(tab)||!Array.isArray(tab.panes))return null;for(const p of tab.panes){if(!record(p)||!Array.isArray(p.channels)||!p.channels.every((c):c is string=>typeof c==='string'&&/^[a-z0-9_]{1,25}$/.test(c)))return null;names.push(...p.channels);}}previous=[...new Set(names)];}
 const parsed=parseSplits(value,previous);if(!parsed)return null;
 const remap=(pane:SplitPane):SplitPane=>{const channels=pane.channels.filter(c=>joined.includes(c));if(!channels.length)channels.push(joined[0]!);const changed=channels.join(',')!==pane.channels.join(',');return {...pane,channels,target:channels.includes(pane.target)?pane.target:channels[0]!,unread:changed?0:pane.unread,reader:pane.reader&&channels.includes(pane.reader.key.split(':')[0]!)?pane.reader:null};};
 for(const tab of parsed.tabs)tab.panes=tab.panes.map(remap);
 for(const item of parsed.closed)if(item.kind==='pane')item.pane=remap(item.pane);else item.tab.panes=item.tab.panes.map(remap);
 const model=new SplitLayout(joined,parsed);try{for(const channel of joined.filter(c=>!previous.includes(c))){if(model.tabs.some(t=>t.panes.some(p=>p.channels.includes(channel))))continue;const room=model.tabs.flatMap(t=>t.panes).find(p=>p.channels.length<6);if(room){room.channels.push(channel);continue;}const tab=model.tabs.find(t=>t.panes.length<6);if(tab)model.selectTab(tab.id);const next=tab?model.addPane():model.addTab('Chat').panes[0]!;model.configure(next.id,{channels:[channel],target:channel,filter:'',reverse:false,pauseHover:true});}}catch{return null;}
 if(joined.length>6)model.enable();return parseSplits(model.snapshot(),joined);
}
function pane(channels:readonly string[]):SplitPane {if(!channels.length)throw new Error('Join a channel first');return {id:crypto.randomUUID(),channels:[...channels],target:channels[0]!,filter:'',rules:[],reverse:false,pauseHover:true,weight:1,unread:0,reader:null};}
export class SplitLayout {
 private state:SplitSnapshot;
 constructor(private joined:readonly string[],value?:unknown){const panes:SplitPane[]=[];for(let i=0;i<joined.length;i+=6)panes.push(pane(joined.slice(i,i+6)));const first=panes[0];if(!first||panes.length>4)throw new Error('Choose 1–24 workspace channels');const tab={id:crypto.randomUUID(),name:'Chat',active:first.id,panes};this.state=parseSplits(value,joined)??{version:1,enabled:joined.length>6,active:tab.id,tabs:[tab],closed:[]};}
 get enabled():boolean{return this.state.enabled;}
 get tabs():readonly SplitTab[]{return this.state.tabs;}
 get activeTab():SplitTab{return this.state.tabs.find(t=>t.id===this.state.active)!;}
 get activePane():SplitPane{return this.activeTab.panes.find(p=>p.id===this.activeTab.active)!;}
 snapshot():SplitSnapshot{return structuredClone(this.state);}
 restore(value:unknown):boolean {const parsed=parseSplits(value,this.joined);if(!parsed)return false;this.state=parsed;return true;}
 enable(on=true):void{this.state.enabled=on;}
 private capacity(panes=1,tabs=0):void{if(this.state.tabs.length+tabs>8||this.state.tabs.flatMap(t=>t.panes).length+panes>24)throw new Error('Layout limit: 8 tabs / 24 panes');}
 private locate(id:string):{tab:SplitTab;pane:SplitPane}{for(const tab of this.tabs){const pane=tab.panes.find(p=>p.id===id);if(pane)return {tab,pane};}throw new Error('Pane no longer exists');}
 selectTab(id:string):void{if(!this.tabs.some(t=>t.id===id))throw new Error('Tab no longer exists');this.state.active=id;}
 selectPane(id:string):void{const {tab}=this.locate(id);this.state.active=tab.id;tab.active=id;}
 addTab(name='Chat'):SplitTab{this.capacity(1,1);const first=pane(this.joined.slice(0,6)),tab={id:crypto.randomUUID(),name:name.trim().slice(0,60)||'Chat',active:first.id,panes:[first]};this.state.tabs.push(tab);this.state.active=tab.id;return tab;}
 renameTab(id:string,name:string):void{const tab=this.tabs.find(t=>t.id===id);if(!tab||!name.trim()||name.length>60||/[\x00-\x1f\x7f]/.test(name))throw new Error('Use a tab name of 1–60 characters');tab.name=name.trim();}
 addPane():SplitPane{this.capacity();if(this.activeTab.panes.length>=6)throw new Error('Tab limit: 6 panes');const next=pane(this.joined.slice(0,6));this.activeTab.panes.push(next);this.activeTab.active=next.id;return next;}
 duplicatePane(id:string):SplitPane{const {pane:source,tab}=this.locate(id);this.capacity();if(tab.panes.length>=6)throw new Error('Tab limit: 6 panes');const next={...structuredClone(source),id:crypto.randomUUID(),unread:0};tab.panes.push(next);this.selectPane(next.id);return next;}
 duplicateTab(id:string):SplitTab{const source=this.tabs.find(t=>t.id===id);if(!source)throw new Error('Tab no longer exists');this.capacity(source.panes.length,1);const panes=source.panes.map(p=>({...structuredClone(p),id:crypto.randomUUID(),unread:0})),tab={id:crypto.randomUUID(),name:source.name,active:panes[0]!.id,panes};this.state.tabs.push(tab);this.state.active=tab.id;return tab;}
 configure(id:string,value:Pick<SplitPane,'channels'|'target'|'filter'|'reverse'|'pauseHover'> & {rules?:string[]}):void{const {pane:current}=this.locate(id);const valid=parsePane({...current,...value,reader:null},this.joined);if(!valid)throw new Error('Choose joined channels, a matching send target and a filter of at most 200 characters');Object.assign(current,valid);}
 resize(id:string,weight:number):void{if(!Number.isFinite(weight)||weight<1||weight>4)throw new Error('Pane width must be between 1 and 4');this.locate(id).pane.weight=weight;}
 movePane(id:string,delta:number):void{const {tab,pane}=this.locate(id),index=tab.panes.indexOf(pane),next=Math.max(0,Math.min(tab.panes.length-1,index+delta));tab.panes.splice(index,1);tab.panes.splice(next,0,pane);}
 moveTab(id:string,delta:number):void{const index=this.state.tabs.findIndex(t=>t.id===id);if(index<0)return;const [tab]=this.state.tabs.splice(index,1);this.state.tabs.splice(Math.max(0,Math.min(this.state.tabs.length,index+delta)),0,tab!);}
 private remember(item:ClosedSplit):void{this.state.closed.push(structuredClone(item));this.state.closed=this.state.closed.slice(-8);}
 closePane(id:string):void{const {tab,pane}=this.locate(id);if(tab.panes.length===1)throw new Error('Keep one pane in each tab');this.remember({kind:'pane',tab:tab.id,pane});tab.panes=tab.panes.filter(p=>p.id!==id);if(tab.active===id)tab.active=tab.panes[0]!.id;}
 closeTab(id:string):void{if(this.tabs.length===1)throw new Error('Keep one tab');const tab=this.tabs.find(t=>t.id===id);if(!tab)return;this.remember({kind:'tab',tab});this.state.tabs=this.state.tabs.filter(t=>t.id!==id);if(this.state.active===id)this.state.active=this.state.tabs[0]!.id;}
 reopen():void{const item=this.state.closed.at(-1);if(!item)throw new Error('No closed pane or tab to reopen');
  if(item.kind==='tab'){this.capacity(item.tab.panes.length,1);const tab=structuredClone(item.tab);tab.id=crypto.randomUUID();const oldActive=tab.active;for(const p of tab.panes){const old=p.id;p.id=crypto.randomUUID();if(old===oldActive)tab.active=p.id;}this.state.tabs.push(tab);this.state.active=tab.id;}
  else{this.capacity();const tab=this.state.tabs.find(t=>t.id===item.tab)??this.activeTab;if(tab.panes.length>=6)throw new Error('Tab limit: 6 panes');const restored={...structuredClone(item.pane),id:crypto.randomUUID()};tab.panes.push(restored);this.selectPane(restored.id);}
  this.state.closed.pop();
 }
}
