// Command registry. Feature modules still insert their trigger buttons into the legacy header; the registry observes that
// header and turns every button into a command, so the shell can present them in menus and the palette without editing
// each module. Commands may also be registered directly.
export type CommandGroup='chat'|'view'|'account'|'moderation'|'providers'|'tools'|'help';
export const GROUP_ORDER:readonly CommandGroup[]=['chat','view','account','moderation','providers','tools','help'];
export const GROUP_LABELS:Record<CommandGroup,string>={chat:'Chat',view:'View',account:'Account',moderation:'Moderation',providers:'Providers',tools:'Integrations',help:'Help'};
export interface Command {
 id:string;label:string;group:CommandGroup;keywords?:string|undefined;hint?:string|undefined;
 run:()=>void;
 available?:()=>boolean;
 /** The trigger element when the command proxies a header button; used for state such as aria-pressed and disabled. */
 trigger?:HTMLButtonElement;
 /** Panel root the command opens, when known statically. */
 panel?:string|undefined;
}
// Group assignment by trigger id, then by visible label. Unknown buttons land in Tools.
const GROUP_BY_ID:Record<string,CommandGroup>={
 'archive-open':'chat','stats-open':'chat','video-open':'chat','whisper-open':'chat','inbox-open':'chat','threads-open':'chat','splits-open':'view','workspace-open':'view','display-open':'view','header-min':'view','theme':'view','animation':'view',
 'login':'account','account-profiles-open':'account','resources-open':'help','hotkeys-open':'help','actions-open':'help','commands-open':'tools','picker-open':'chat',
};
const GROUP_BY_LABEL:[RegExp,CommandGroup][]=[
 [/^(channels|threads|inbox|bookmarks|export logs|compare activity|search selected|upload image|search archive|stats|video|whispers)/i,'chat'],
 [/^(presentation|custom themes|independent panes|workspace|settings|header|theme|freeze)/i,'view'],
 [/^(accounts|user notes|own message feedback|log in|log out)/i,'account'],
 [/^(moderation|rules|public message context|commands|completion|link preferences)/i,'moderation'],
 [/^(provider|emote)/i,'providers'],
 [/^(help|shortcuts|actions)/i,'help'],
];
const PANEL_BY_ID:Record<string,string>={'display-open':'display-panel','stats-open':'stats-panel','archive-open':'archive-search','workspace-open':'workspace-panel','video-open':'video-panel','whisper-open':'whisper-panel','resources-open':'resources-panel','picker-open':'emote-picker'};
export function groupFor(button:HTMLButtonElement):CommandGroup {
 const byId=GROUP_BY_ID[button.id];if(byId)return byId;
 const label=labelFor(button);for(const [pattern,group] of GROUP_BY_LABEL)if(pattern.test(label))return group;return 'tools';
}
export function labelFor(button:HTMLButtonElement):string {
 const aria=button.getAttribute('aria-label');const text=button.textContent?.trim()??'';
 // Buttons with icon shortcuts keep their long label in the text and the icon in data-short.
 const label=text&&!/^[^\p{L}\p{N}]{1,2}$/u.test(text)?text:aria||text;
 return label.replace(/\s+/g,' ').replace(/[↕↔▶✉?⚙▥⌕❄◐]+$/u,'').trim();
}
export class CommandRegistry extends EventTarget {
 private commands=new Map<string,Command>();
 private observers:MutationObserver[]=[];
 private watched:{container:HTMLElement;skip:ReadonlySet<string>}[]=[];
 register(command:Command):()=>void {this.commands.set(command.id,command);this.changed();return ()=>{if(this.commands.get(command.id)===command){this.commands.delete(command.id);this.changed();}};}
 get(id:string):Command|undefined {return this.commands.get(id);}
 all():Command[] {return [...this.commands.values()];}
 byGroup():Map<CommandGroup,Command[]> {
  const map=new Map<CommandGroup,Command[]>();for(const group of GROUP_ORDER)map.set(group,[]);
  for(const command of this.commands.values())map.get(command.group)!.push(command);
  return map;
 }
 /** Mirror every button inside `container` (now and later) as a command. Buttons listed in `skip` stay out of the menus. */
 watch(container:HTMLElement,skip:ReadonlySet<string>=new Set()):void {
  this.watched.push({container,skip});const sync=():void=>{this.syncWatched();};sync();
  if(typeof MutationObserver!=='undefined'){const observer=new MutationObserver(sync);observer.observe(container,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled','hidden','aria-pressed','aria-label']});this.observers.push(observer);}
 }
 private syncWatched():void {
  const seen=new Set<string>();let changed=false;
  for(const {container,skip} of this.watched)for(const button of container.querySelectorAll<HTMLButtonElement>('button')){
   if(button.closest('#joined-channels')||button.closest('form')||skip.has(button.id)||button.dataset.shellIgnore!==undefined)continue;
   const label=labelFor(button);if(!label)continue;
   const id='header:'+(button.id||label.toLowerCase().replace(/[^a-z0-9]+/g,'-'));seen.add(id);
   const existing=this.commands.get(id);
   if(existing&&existing.trigger===button){if(existing.label!==label){existing.label=label;changed=true;}continue;}
   this.commands.set(id,{id,label,group:groupFor(button),run:()=>button.click(),available:()=>!button.disabled,trigger:button,panel:PANEL_BY_ID[button.id]??button.getAttribute('aria-controls')??undefined});changed=true;
  }
  for(const [id,command] of this.commands)if(command.trigger&&id.startsWith('header:')&&!seen.has(id)){this.commands.delete(id);changed=true;}
  if(changed)this.changed();
 }
 private changed():void {this.dispatchEvent(new Event('change'));}
 stop():void {for(const observer of this.observers)observer.disconnect();}
}
