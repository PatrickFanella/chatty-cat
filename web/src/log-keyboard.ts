import type { VirtualLog } from './virtual-log';
import type { Composer } from './composer';
export class LogKeyboard {
 private selected:string|undefined;
 constructor(private log:HTMLElement,private virtual:Pick<VirtualLog,'reveal'|'edgeKey'|'moveKey'>,private composer:Composer,private pause:()=>void,private latest:()=>void){
  log.tabIndex=0;log.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown Home End Enter Escape');log.addEventListener('keydown',this.key);log.addEventListener('virtualpaint',this.paint);document.addEventListener('keydown',this.typing);
 }
 private select(key:string|undefined):void {if(!key)return;this.pause();this.selected=key;this.virtual.reveal(key);this.paint();this.row()?.focus({preventScroll:true});}
 private row():HTMLElement|undefined {return [...this.log.querySelectorAll<HTMLElement>('[data-virtual-key]')].find(row=>row.dataset.virtualKey===this.selected);}
 private paint=():void=>{for(const row of this.log.querySelectorAll<HTMLElement>('[data-virtual-key]')){const selected=row.dataset.virtualKey===this.selected;row.classList.toggle('keyboard-selected',selected);row.tabIndex=-1;}};
 private key=(event:KeyboardEvent):void=>{
  if(event.isComposing||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
  if(event.target instanceof Element&&event.target.closest('button,a,input,select,textarea'))return;
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();this.select(this.virtual.moveKey(this.selected,event.key==='ArrowUp'?-1:1));}
  else if(event.key==='Home'){event.preventDefault();this.select(this.virtual.edgeKey(false));}
  else if(event.key==='End'){event.preventDefault();this.selected=undefined;this.latest();this.paint();this.log.focus({preventScroll:true});}
  else if(event.key==='Enter'&&this.selected){event.preventDefault();this.row()?.querySelector<HTMLButtonElement>('[data-reply]')?.click();}
  else if(event.key==='Escape'){event.preventDefault();this.selected=undefined;this.paint();this.composer.focusTyping('');}
 };
 private typing=(event:KeyboardEvent):void=>{
  if(event.defaultPrevented||event.isComposing||event.ctrlKey||event.altKey||event.metaKey||event.key.length!==1||!this.composer.canInsert)return;
  if(event.target instanceof Element&&event.target.closest('input,textarea,select,button,a,[contenteditable=true],[role=dialog],dialog'))return;
  if(document.querySelector('dialog[open]'))return;
  event.preventDefault();this.composer.focusTyping(event.key);
 };
 stop():void {this.log.removeEventListener('keydown',this.key);this.log.removeEventListener('virtualpaint',this.paint);document.removeEventListener('keydown',this.typing);}
}
