// Shell entry: builds the top bar, command registry, palette and workbench over the existing feature modules.
import {CommandRegistry,type Command,type CommandGroup} from './registry';
import {CommandPalette,type PaletteEntry} from './palette';
import {Topbar} from './topbar';
import {Workbench} from './workbench';
import {closeMenus} from './menu';
import {privacyEnabled} from '../privacy';
export interface ShellAction {id:string;label:string;binding:string;context:string}
export interface ShellOptions {
 actions:readonly ShellAction[];
 run:(id:string)=>void;
 available:(id:string)=>boolean;
 extra:()=>PaletteEntry[];
}
export interface Shell {registry:CommandRegistry;workbench:Workbench;palette:CommandPalette;topbar:Topbar;stop:()=>void}
const STATIC_PANELS=['video-panel','whisper-panel','resources-panel','emote-picker','stats-panel','archive-search','workspace-panel','display-panel','user-inspector'];
const EXCLUDED_PANELS=new Set(['shell-palette','action-palette','identity-preview','link-preview','split-settings']);
const SKIPPED_TRIGGERS=new Set(['header-min','actions-open']);
const ACTION_GROUPS:Record<string,CommandGroup>={compose:'chat','channel-next':'chat','channel-prev':'chat',pause:'chat',live:'chat',reconnect:'chat','reload-emotes':'providers','zoom-in':'view','zoom-out':'view','pane-next':'view','pane-prev':'view','tab-next':'view','tab-prev':'view','pane-right':'view','pane-left':'view','tab-right':'view','tab-left':'view'};
// Hotkey actions that merely click a header button are already present as header commands.
const DUPLICATE_ACTIONS=new Set(['palette','shortcuts','accounts','workspace','emotes','video','stats','settings','inbox','commands','history','history-global','desktop-playback','desktop-overlay']);
export function prettyBinding(binding:string):string {
 if(!binding)return '';
 return binding.split('+').map(part=>part.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Arrow/,'').replace(/^BracketRight$/,']').replace(/^BracketLeft$/,'[').replace(/^Equal$/,'=').replace(/^Minus$/,'-').replace(/^Meta$/,'⌘')).join('+');
}
function titleFor(registry:CommandRegistry,root:HTMLElement):string {
 const command=registry.all().find(entry=>entry.panel===root.id);
 const own=root.getAttribute('aria-label')||root.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > legend')?.textContent?.trim();
 return (command?.label||own||'Panel').replace(/^open /i,'').replace(/^search local chat archive$/i,'Archive');
}
export function startShell(options:ShellOptions):Shell {
 document.documentElement.dataset.shell='true';
 const header=document.querySelector<HTMLElement>('header')!;
 const registry=new CommandRegistry();
 for(const action of options.actions){
  if(DUPLICATE_ACTIONS.has(action.id))continue;
  registry.register({id:'action:'+action.id,label:action.label,group:ACTION_GROUPS[action.id]??'view',hint:prettyBinding(action.binding),run:()=>options.run(action.id),available:()=>options.available(action.id)});
 }
 // Controls that modules placed beside the log belong with the other triggers.
 for(const stray of [...document.querySelectorAll<HTMLElement>('.chat-workspace > button, .chat-workspace > p')])header.append(stray);
 registry.watch(header,SKIPPED_TRIGGERS);
 const privacy=document.getElementById('privacy-toolbar');if(privacy)registry.watch(privacy);
 const workbench=new Workbench({titleFor:root=>titleFor(registry,root),exclude:root=>EXCLUDED_PANELS.has(root.id)||root.dataset.shellOwned!==undefined||root.closest('#topbar,.shell-menu')!==null,centre:'#offline,#app-update,#stream,#room-state,#video-panel,main#log,.chat-workspace,#announcer,#composer,.message-navigation'});
 for(const id of STATIC_PANELS){const root=document.getElementById(id);if(root)workbench.adopt(root);}
 const palette=new CommandPalette(registry,options.extra);
 const parts={header,status:document.getElementById('status')!,rate:document.getElementById('rate')!,login:document.getElementById('login')!,account:document.getElementById('account')!,joined:document.getElementById('joined-channels')!,channelsForm:document.getElementById('channels') as HTMLFormElement,brand:header.querySelector<HTMLElement>('.brand')!,footer:document.querySelector<HTMLElement>('footer')!};
 const topbar=new Topbar(parts,registry,()=>{if(!privacyEnabled())palette.toggle();},(command:Command)=>command.panel?workbench.placementLabel(command.panel):undefined);
 document.body.prepend(topbar.root);
 const keys=(event:KeyboardEvent):void=>{
  if((event.metaKey||event.ctrlKey)&&!event.altKey&&!event.shiftKey&&event.code==='KeyK'){event.preventDefault();event.stopPropagation();if(!privacyEnabled())palette.toggle();return;}
  if(event.key==='Escape')closeMenus();
 };
 document.addEventListener('keydown',keys,true);
 return {registry,workbench,palette,topbar,stop:()=>{document.removeEventListener('keydown',keys,true);registry.stop();workbench.stop();topbar.stop();}};
}
