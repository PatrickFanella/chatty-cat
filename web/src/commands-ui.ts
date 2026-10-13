import { CommandStore, compileTemplate, expandTemplate, parseCommandList, type CommandContext, type CommandTemplate } from './commands';
import {registerSettings} from './settings-bundle';
import type { Composer } from './composer';
import { privacyEnabled } from './privacy';
export class CommandPanel {
 private store=new CommandStore();
 private root=document.createElement('dialog');
 private trigger=document.createElement('button');
 private action=document.createElement('button');
 private messageContext:CommandContext|undefined;
 private preview:{text:string;invocation:string;channel:string;account:string}|undefined;
 private stopSettings:()=>void;
 constructor(private composer:Composer,private context:()=>CommandContext,private inspector:HTMLDialogElement,workspaceCommands?:unknown){
  this.trigger.id='commands-open';this.trigger.type='button';this.trigger.textContent='Commands';document.getElementById('workspace-open')?.after(this.trigger);
  this.root.id='commands-panel';this.root.setAttribute('aria-label','Custom commands');
  this.root.innerHTML='<h2>Custom commands and message actions</h2><button type="button" data-action="close">Close</button><label>Saved command<select id="command-selected"><option value="">New command</option></select></label><label>Name<input id="command-name" maxlength="60"></label><label>Group<input id="command-group" maxlength="60"></label><label>Trigger<input id="command-trigger" maxlength="32" placeholder="/greet"></label><label>Template<textarea id="command-body" maxlength="2000" placeholder="Hello {1+} in {channel.name}"></textarea></label><button type="button" data-action="save">Save definition</button><button type="button" data-action="delete">Delete definition</button><label>Test invocation<input id="command-input" maxlength="500" placeholder="/greet chat"></label><button type="button" data-action="preview">Preview expansion</button><pre id="command-preview"></pre><p id="command-status" role="status"></p><button type="button" data-action="stage" disabled>Stage in composer</button><p>Placeholders: {1}, {2+}, {channel.name}, {channel.id}, {my.name}, {my.id}, {user.name}, {msg.id}, {msg.text}, {input.text}, {stream.title}, {stream.game}. Missing provider/account/message context is reported. {{ escapes an opening brace. Templates are text; nested commands are not run. Staging never sends a message.</p>';
  document.body.append(this.root);this.root.addEventListener('click',this.click);this.root.addEventListener('change',this.select);this.root.addEventListener('input',this.invalidate);this.root.addEventListener('close',this.closed);this.trigger.addEventListener('click',this.open);
  this.action.type='button';this.action.textContent='Custom message action';this.action.addEventListener('click',this.messageAction);inspector.append(this.action);this.paint();
  const restore=(value:unknown):void=>{try{this.store.save(parseCommandList(value));this.invalidate();this.paint();}catch(e){this.status(e instanceof Error?e.message:'Workspace commands unavailable');}};
  this.stopSettings=registerSettings('commands',()=>this.store.all(),restore);
  if(workspaceCommands!==undefined)restore(workspaceCommands);
 }
 private field(id:string):HTMLInputElement|HTMLTextAreaElement{return this.root.querySelector<HTMLInputElement|HTMLTextAreaElement>('#command-'+id)!;}
 private status(text:string):void{this.root.querySelector<HTMLElement>('#command-status')!.textContent=text;}
 private closed=():void=>{this.messageContext=undefined;this.invalidate();};
 private invalidate=():void=>{this.preview=undefined;this.root.querySelector<HTMLButtonElement>('[data-action=stage]')!.disabled=true;};
 private paint():void{
  const select=this.root.querySelector<HTMLSelectElement>('#command-selected')!;select.replaceChildren();const blank=document.createElement('option');blank.value='';blank.textContent='New command';select.append(blank);
  for(const command of this.store.all()){const option=document.createElement('option');option.value=command.trigger;option.textContent=(command.group?command.group+' · ':'')+command.name+' ('+command.trigger+')';select.append(option);}
  this.composer.configureCommands(this.store.all().map(command=>command.trigger),text=>{const command=this.store.match(text);if(!command)return false;this.showPreview(command,text);return true;});
  if(this.store.error)this.status(this.store.error);
 }
 private select=(event:Event):void=>{if(!(event.target instanceof HTMLSelectElement)||event.target.id!=='command-selected')return;this.invalidate();const selected=this.root.querySelector<HTMLSelectElement>('#command-selected')!.value;const command=this.store.all().find(command=>command.trigger===selected);
  for(const key of ['name','group','trigger','body'] as const)this.field(key).value=command?.[key]??'';this.field('input').value=command?.trigger??'';
 };
 private show():void{if(privacyEnabled())return;this.root.showModal();this.field('input').focus();}
 private open=():void=>{this.messageContext=undefined;this.show();};
 openPanel():void{this.open();}
 private liveContext():CommandContext{const current=this.context();return this.messageContext?{...current,channel:this.messageContext.channel,message:this.messageContext.message}:current;}
 private messageAction=():void=>{const current=this.context();this.messageContext={...current,channel:{...current.channel},message:current.message?{...current.message}:undefined};this.inspector.close();this.show();};
 private showPreview(command:CommandTemplate,invocation:string):void{
  if(privacyEnabled())throw new Error('Command previews are hidden in privacy mode');const context=this.liveContext();
  const args=invocation.trim().split(/\s+/).slice(1);const text=expandTemplate(compileTemplate(command.body),args,context,this.store.all().map(command=>command.trigger));
  this.preview={text,invocation,channel:context.channel.name,account:context.account.id};this.root.querySelector<HTMLElement>('#command-preview')!.textContent=text;this.field('input').value=invocation;
  this.status('Preview for #'+context.channel.name+' as '+(context.account.name||'signed out')+'. Review the exact text, then stage it. Moderation still requires the normal explicit Send action.');this.root.querySelector<HTMLButtonElement>('[data-action=stage]')!.disabled=!this.composer.canInsert;
  if(!this.root.open)this.root.showModal();
 }
 private click=(event:MouseEvent):void=>{
  if(!(event.target instanceof Element))return;const action=event.target.closest<HTMLButtonElement>('[data-action]')?.dataset.action;if(!action)return;
  try{
   if(action==='close'){this.messageContext=undefined;this.invalidate();this.root.close();this.trigger.focus();return;}
   if(action==='preview'){const invocation=this.field('input').value,command=this.store.match(invocation);if(!command)throw new Error('Save a command matching this invocation first');this.showPreview(command,invocation);return;}
   if(action==='stage'){
    const preview=this.preview;if(!preview||!this.composer.canInsert)return;const current=this.liveContext();if(current.account.id!==preview.account||current.channel.name!==preview.channel)throw new Error('Account or channel changed; preview again');
    const draft=this.composer.target===preview.channel?this.composer.draft:this.composer.draftFor(preview.channel);if(draft.trim()&&draft.trim()!==preview.invocation.trim())throw new Error('Finish or clear the destination draft before staging this action');
    this.composer.setTarget(preview.channel);this.root.close();this.composer.prepare(preview.text);this.invalidate();return;
   }
   const selected=this.root.querySelector<HTMLSelectElement>('#command-selected')!.value;
   if(action==='save'){const definition={name:this.field('name').value,group:this.field('group').value,trigger:this.field('trigger').value,body:this.field('body').value};this.store.save([...this.store.all().filter(command=>command.trigger!==selected),definition]);}
   else if(action==='delete'){if(!selected)throw new Error('Choose a saved command');this.store.save(this.store.all().filter(command=>command.trigger!==selected));}
   this.invalidate();this.paint();this.status('Command definition saved');
  }catch(error){this.status(error instanceof Error?error.message:'Command action failed');}
 };
 stop():void{this.stopSettings();this.root.removeEventListener('click',this.click);this.root.removeEventListener('change',this.select);this.root.removeEventListener('input',this.invalidate);this.root.removeEventListener('close',this.closed);this.trigger.removeEventListener('click',this.open);this.action.removeEventListener('click',this.messageAction);this.root.remove();this.trigger.remove();this.action.remove();}
}
