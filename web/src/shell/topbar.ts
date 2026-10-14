// Top bar: brand, joined channels, connection state, rate graph, search and account. Everything else lives in the menu
// and the command palette. The legacy header stays in the DOM, hidden, so feature modules can keep inserting their
// trigger buttons there; the registry mirrors them.
import {CommandRegistry,GROUP_LABELS,GROUP_ORDER,type Command} from './registry';
import {openMenu,type MenuSection} from './menu';
export interface TopbarParts {header:HTMLElement;status:HTMLElement;rate:HTMLElement;login:HTMLElement;account:HTMLElement;joined:HTMLElement;channelsForm:HTMLFormElement;brand:HTMLElement;footer:HTMLElement}
export class Topbar {
 readonly root=document.createElement('div');
 private menuButton=document.createElement('button');
 private searchButton=document.createElement('button');
 private channelsButton=document.createElement('button');
 private statusDot=document.createElement('span');
 private statusText=document.createElement('span');
 private observer:MutationObserver|undefined;
 constructor(private parts:TopbarParts,private registry:CommandRegistry,openPalette:()=>void,private placementFor:(command:Command)=>string|undefined){
  const {root}=this;root.id='topbar';root.setAttribute('role','banner');
  const brandButton=this.menuButton;brandButton.type='button';brandButton.id='shell-menu';brandButton.className='tb-brand';brandButton.setAttribute('aria-label','Menu');brandButton.setAttribute('aria-haspopup','menu');brandButton.title='Menu';
  brandButton.append(parts.brand);
  const channels=document.createElement('div');channels.className='tb-channels';channels.append(parts.joined);
  this.channelsButton.type='button';this.channelsButton.className='tb-icon';this.channelsButton.setAttribute('aria-label','Join channels');this.channelsButton.title='Join channels';this.channelsButton.textContent='+';
  this.channelsButton.addEventListener('click',()=>this.openChannels());
  channels.append(this.channelsButton);
  const state=document.createElement('button');state.type='button';state.className='tb-state';state.setAttribute('aria-label','Connection');state.append(this.statusDot,this.statusText,parts.status);
  this.statusDot.className='tb-dot';this.statusText.className='tb-state-text';
  state.addEventListener('click',()=>this.openState(state));
  const spacer=document.createElement('div');spacer.className='tb-spacer';
  const rate=document.createElement('div');rate.className='tb-rate';rate.append(parts.rate);
  this.searchButton.type='button';this.searchButton.id='shell-search';this.searchButton.className='tb-search';this.searchButton.innerHTML='<span>Search</span><kbd>'+(navigator.platform.includes('Mac')?'⌘K':'Ctrl K')+'</kbd>';this.searchButton.setAttribute('aria-label','Search commands');
  this.searchButton.addEventListener('click',openPalette);
  const account=document.createElement('div');account.className='tb-account';account.append(parts.account,parts.login);
  root.append(brandButton,channels,state,spacer,rate,this.searchButton,account);
  brandButton.addEventListener('click',()=>this.openMain());
  this.syncState();
  if(typeof MutationObserver!=='undefined'){this.observer=new MutationObserver(()=>this.syncState());this.observer.observe(parts.status,{attributes:true,childList:true,characterData:true,subtree:true});}
 }
 private syncState():void {const state=this.parts.status.dataset.state??'';this.root.dataset.state=state;const text=this.parts.status.textContent?.trim()??'';this.statusText.textContent=state==='connected'?'Live':state==='reconnecting'?'Reconnecting':state==='failed'?'Offline':text.length>24?text.slice(0,24)+'…':text||'Connecting';this.statusDot.title=text;}
 private openMain():void {
  const groups=this.registry.byGroup();const sections:MenuSection[]=[];
  for(const group of GROUP_ORDER){const commands=(groups.get(group)??[]).filter(command=>!(command.id.startsWith('action:')&&command.available?.()===false));if(!commands.length)continue;
   sections.push({title:GROUP_LABELS[group],items:commands.map(command=>{const placement=this.placementFor(command);return {label:command.label,hint:command.hint??(placement&&placement!=='modal'?placement:undefined),disabled:command.available?.()===false,checked:command.trigger?.getAttribute('aria-pressed')==='true'?true:command.trigger?.getAttribute('aria-pressed')==='false'?false:undefined,run:command.run};})});}
  openMenu(this.menuButton,sections,{align:'start',label:'Main menu',wide:true});
 }
 private openChannels():void {
  const form=this.parts.channelsForm;const popover=document.createElement('div');popover.className='shell-menu tb-join';popover.setAttribute('role','dialog');popover.setAttribute('aria-label','Join channels');
  const hint=document.createElement('p');hint.textContent='Comma-separated channel names. Joining reloads the workspace.';
  popover.append(form,hint);document.body.append(popover);form.hidden=false;
  const rect=this.channelsButton.getBoundingClientRect();popover.style.left=Math.min(rect.left,innerWidth-popover.offsetWidth-8)+'px';popover.style.top=rect.bottom+6+'px';
  const close=():void=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keys,true);this.parts.header.append(form);popover.remove();};
  const outside=(event:Event):void=>{if(!popover.contains(event.target as Node)&&event.target!==this.channelsButton)close();};
  const keys=(event:KeyboardEvent):void=>{if(event.key==='Escape'){event.preventDefault();close();this.channelsButton.focus();}};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keys,true);
  form.querySelector<HTMLInputElement>('input')?.focus();
 }
 private openState(anchor:HTMLElement):void {
  const reconnect=this.registry.get('action:reconnect');const text=this.parts.status.textContent?.trim()||'Connecting';
  openMenu(anchor,[{title:text,items:[...(reconnect?[{label:reconnect.label,hint:reconnect.hint,run:reconnect.run}]:[])]}],{align:'start',label:'Connection'});
 }
 stop():void {this.observer?.disconnect();}
}
