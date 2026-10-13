import {profileKey} from './account-profiles';
import {ACTIONS,defaultBindings,parseHotkeys,validateBindings,bindingFor,canHandle,type Bindings,type ActionID} from './hotkeys';
import {registerSettings} from './settings-bundle';
import {privacyEnabled} from './privacy';
export interface PaletteAction {id:string;label:string;context:string;run:()=>void;enabled?:boolean}
const KEY='chatthing:v1:hotkeys';
function button(id:string,label:string,run:()=>void):HTMLButtonElement{const node=document.createElement('button');node.id=id;node.type='button';node.textContent=label;node.addEventListener('click',run);return node;}
export class HotkeyPanel {
 private bindings:Bindings=defaultBindings();
 private savedRaw:string|null=null;
 private palette=document.createElement('dialog');
 private search=document.createElement('input');
 private results=document.createElement('div');
 private settings=document.createElement('dialog');
 private list=document.createElement('div');
 private status=document.createElement('p');
 private paletteStatus=document.createElement('p');
 private inputs=new Map<string,HTMLInputElement>();
 private draft:Bindings=defaultBindings();
 private choices:PaletteAction[]=[];
 private selected=0;
 private staleEditing=false;
 private stopSettings:()=>void;
 constructor(private trigger:HTMLButtonElement,private editTrigger:HTMLButtonElement,private run:(id:ActionID)=>void,private extra:()=>PaletteAction[],private available:(id:ActionID)=>boolean=()=>true){
  try{this.savedRaw=localStorage.getItem(profileKey(KEY));if(this.savedRaw){const parsed=this.savedRaw.length<=8192?parseHotkeys(JSON.parse(this.savedRaw)):null;if(parsed)this.bindings=parsed.bindings;else this.status.textContent='Saved shortcuts are invalid; defaults are active until you save or reset';}}catch{this.status.textContent='Shortcut storage is unavailable; defaults are active';}
  this.palette.id='action-palette';this.palette.setAttribute('aria-label','Actions and quick switch');this.search.id='action-search';this.search.type='search';this.search.placeholder='Search actions, channels, tabs or workspaces';this.search.setAttribute('aria-label','Search actions and destinations');this.search.maxLength=200;
  this.results.className='action-results';this.results.setAttribute('role','listbox');this.results.id='action-results';this.search.setAttribute('aria-controls',this.results.id);this.paletteStatus.setAttribute('role','status');
  this.palette.append(this.search,this.results,this.paletteStatus,button('action-close','Close',()=>this.palette.close()));document.body.append(this.palette);this.search.addEventListener('input',this.paintResults);this.search.addEventListener('keydown',this.navigate);
  this.settings.id='shortcut-settings';this.settings.setAttribute('aria-label','Keyboard shortcuts');this.list.className='shortcut-list';this.status.id='shortcut-status';this.status.setAttribute('role','status');
  const info=document.createElement('p');info.textContent='Shortcuts use physical key codes. Record a chord or enter one such as Alt+KeyM; Mod means Command or Control. Blank disables an action. Chat shortcuts run outside text fields and dialogs; action search also works from the composer. F5 reloads provider metadata outside text fields and dialogs; within them it keeps normal browser behavior. Other reserved browser shortcuts and privacy panic cannot be reassigned.';
  for(const action of ACTIONS){const row=document.createElement('label'),input=document.createElement('input');input.dataset.binding=action.id;input.maxLength=60;input.setAttribute('aria-label',action.label+' binding');row.append(document.createTextNode(action.label+' · '+action.context+' · default '+action.binding),input);
   const record=button('', 'Record',()=>{input.focus();input.dataset.recording='true';this.status.textContent='Press the shortcut chord; Escape cancels recording';});record.setAttribute('aria-label','Record '+action.label+' shortcut');row.append(record);input.addEventListener('keydown',event=>{if(input.dataset.recording!=='true')return;if(event.isComposing||event.key==='Process')return;event.preventDefault();event.stopPropagation();if(event.key!=='Escape'&&!['Control','Alt','Meta','Shift'].includes(event.key)){input.value=bindingFor(event);delete input.dataset.recording;this.validate();}else if(event.key==='Escape'){delete input.dataset.recording;this.validate();}});input.addEventListener('blur',()=>delete input.dataset.recording);input.addEventListener('input',()=>this.validate());this.inputs.set(action.id,input);this.list.append(row);
  }
  this.settings.append(info,this.list,this.status,button('shortcut-save','Save shortcuts',()=>this.save()),button('shortcut-reset','Restore default shortcuts',()=>this.reset()),button('shortcut-close','Close',()=>this.settings.close()));document.body.append(this.settings);
  this.trigger.addEventListener('click',this.open);this.editTrigger.addEventListener('click',this.openSettings);document.addEventListener('keydown',this.key,true);this.palette.addEventListener('close',this.closed);this.settings.addEventListener('close',this.settingsClosed);window.addEventListener('storage',this.storage);
  this.stopSettings=registerSettings('hotkeys',()=>({version:1,bindings:{...this.bindings}}),value=>{const parsed=parseHotkeys(value);if(parsed){this.bindings=parsed.bindings;this.sync();}else this.status.textContent='Imported shortcuts are invalid; current bindings were retained';});this.sync();
 }
 private sync():void{this.draft={...this.bindings};for(const [id,input] of this.inputs)input.value=this.bindings[id]??'';this.trigger.setAttribute('aria-keyshortcuts',this.bindings.palette??'');}
 private validate():string[]{this.draft=Object.fromEntries([...this.inputs].map(([id,input])=>[id,input.value.trim()]));const errors=validateBindings(this.draft);this.status.textContent=errors.join('; ')||'Bindings are valid; Save applies them';const save=this.settings.querySelector<HTMLButtonElement>('#shortcut-save');if(save)save.disabled=errors.length>0;return errors;}
 private write(bindings:Bindings):void{const raw=JSON.stringify({version:1,bindings});if(this.staleEditing||localStorage.getItem(profileKey(KEY))!==this.savedRaw)throw new Error('Shortcuts changed in another tab; close and reopen before saving');localStorage.setItem(profileKey(KEY),raw);this.savedRaw=raw;this.bindings={...bindings};this.sync();}
 private save():void{if(this.validate().length)return;try{this.write(this.draft);this.settings.close();}catch(error){this.status.textContent=error instanceof Error?error.message:'Could not save shortcuts';}}
 private reset():void{try{this.write(defaultBindings());this.status.textContent='Default shortcuts restored; other settings are unchanged';this.validate();}catch(error){this.status.textContent=error instanceof Error?error.message:'Could not restore shortcuts';}}
 private open=():void=>{if(privacyEnabled()||this.palette.open||document.querySelector('dialog[open]:not([data-rail="true"])'))return;this.paletteStatus.textContent='';this.search.value='';this.selected=0;this.paintResults();this.palette.showModal();this.search.focus();};
 private openSettings=():void=>{if(privacyEnabled()||this.settings.open||document.querySelector('dialog[open]:not([data-rail="true"])'))return;this.staleEditing=false;this.sync();this.settings.showModal();this.inputs.values().next().value?.focus();};
 private closed=():void=>{this.choices=[];this.results.replaceChildren();this.trigger.focus();};
 private settingsClosed=():void=>{this.editTrigger.focus();};
 private paintResults=():void=>{
  const query=this.search.value.trim().toLowerCase();this.choices=[...ACTIONS.map(action=>({id:action.id,label:action.label+' · '+(this.bindings[action.id]||'unbound'),context:action.context,enabled:this.available(action.id),run:()=>action.id==='palette'?this.open():action.id==='shortcuts'?this.openSettings():this.run(action.id)})),...this.extra().slice(0,100)].filter(action=>(action.label+' '+action.context).toLowerCase().includes(query)).slice(0,100);
  this.selected=Math.min(this.selected,Math.max(0,this.choices.length-1));this.results.replaceChildren();
  this.choices.forEach((action,index)=>{const node=button('action-'+index,action.label+' · '+action.context,()=>this.execute(index));node.disabled=action.enabled===false;node.setAttribute('role','option');node.setAttribute('aria-selected',String(index===this.selected));node.tabIndex=-1;this.results.append(node);});this.search.setAttribute('aria-activedescendant',this.choices.length?'action-'+this.selected:'');
 };
 private execute(index:number):void{const action=this.choices[index];if(!action)return;if(action.enabled===false){this.paletteStatus.textContent='Enable independent panes to use this action';return;}this.palette.close();try{action.run();}catch(error){this.paletteStatus.textContent=error instanceof Error?error.message:'Action failed';this.palette.showModal();}}
 private navigate=(event:KeyboardEvent):void=>{if(event.isComposing||event.key==='Process')return;if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();this.selected=(this.selected+(event.key==='ArrowDown'?1:-1)+this.choices.length)%Math.max(1,this.choices.length);this.paintResults();this.results.children[this.selected]?.scrollIntoView?.({block:'nearest'});}else if(event.key==='Enter'){event.preventDefault();this.execute(this.selected);}};
 private key=(event:KeyboardEvent):void=>{if(privacyEnabled()||!event.code)return;const binding=bindingFor(event),action=ACTIONS.find(a=>this.bindings[a.id]===binding);if(!action||!this.available(action.id)||!canHandle(action,event,event.target,!!document.querySelector('dialog[open]:not([data-rail="true"])')))return;event.preventDefault();event.stopPropagation();try{if(action.id==='palette')this.open();else if(action.id==='shortcuts')this.openSettings();else this.run(action.id);}catch(error){this.paletteStatus.textContent=error instanceof Error?error.message:'Action failed';this.palette.showModal();}};
 private storage=(event:StorageEvent):void=>{if(event.key!==profileKey(KEY)&&event.key!==null)return;try{const raw=localStorage.getItem(profileKey(KEY)),parsed=raw&&raw.length<=8192?parseHotkeys(JSON.parse(raw)):raw===null?{version:1,bindings:defaultBindings()}:null;if(parsed){this.savedRaw=raw;this.bindings=parsed.bindings;if(!this.settings.open)this.sync();else{this.staleEditing=true;this.status.textContent='Shortcuts changed in another tab; close and reopen to edit the latest bindings';}}}catch{this.status.textContent='Shortcut storage could not be read';}};
 stop():void{this.stopSettings();document.removeEventListener('keydown',this.key,true);window.removeEventListener('storage',this.storage);this.trigger.removeEventListener('click',this.open);this.editTrigger.removeEventListener('click',this.openSettings);this.palette.remove();this.settings.remove();}
}
