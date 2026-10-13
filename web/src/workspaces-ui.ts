import { privacyEnabled } from './privacy';
import { WorkspaceStore, parseWorkspaceFile, workspaceFile, type WorkspaceSnapshot, type Workspace } from './workspaces';
type Preview={kind:'create';name:string;snapshot:WorkspaceSnapshot}|{kind:'rename'|'duplicate'|'delete'|'switch';workspace:Workspace;name:string}|{kind:'save';workspace:Workspace;snapshot:WorkspaceSnapshot}|{kind:'import';workspaces:Workspace[]};
export class WorkspacePanel {
 private selected:HTMLSelectElement;
 private name:HTMLInputElement;
 private file:HTMLInputElement;
 private status:HTMLElement;
 private apply:HTMLButtonElement;
 private pending:Preview|undefined;
 private generation=0;
 constructor(private root:HTMLDialogElement,private trigger:HTMLButtonElement,private store:WorkspaceStore,private currentID:()=>string,private capture:()=>WorkspaceSnapshot,private saveCurrent:()=>void,private navigate:(workspace:Workspace)=>void,private readonlyView=false){
  this.selected=root.querySelector<HTMLSelectElement>('#workspace-select')!;this.name=root.querySelector<HTMLInputElement>('#workspace-name')!;
  this.file=root.querySelector<HTMLInputElement>('#workspace-file')!;this.status=root.querySelector<HTMLElement>('#workspace-status')!;this.apply=root.querySelector<HTMLButtonElement>('#workspace-apply')!;
  root.addEventListener('click',this.click);root.addEventListener('close',this.closed);trigger.addEventListener('click',this.open);this.selected.addEventListener('change',this.select);this.name.addEventListener('input',this.invalidate);this.file.addEventListener('change',this.fileChanged);
  this.paint();if(readonlyView)trigger.hidden=true;if(store.error)this.status.textContent=store.error;
 }
 private paint():void {const selected=this.selected.value||this.currentID();this.selected.replaceChildren();for(const workspace of this.store.all()){const option=document.createElement('option');option.value=workspace.id;option.textContent=workspace.name+(workspace.id===this.currentID()?' · active':'');this.selected.append(option);}this.selected.value=this.store.get(selected)?selected:this.currentID();this.name.value=this.store.get(this.selected.value)?.name??'';this.trigger.textContent='Workspace: '+(this.store.get(this.currentID())?.name??'unsaved');}
 private invalidate=():void=>{this.pending=undefined;this.apply.disabled=true;this.generation++;};
 private select=():void=>{this.invalidate();this.name.value=this.store.get(this.selected.value)?.name??'';};
 private open=():void=>{if(privacyEnabled()||this.readonlyView)return;this.paint();this.root.showModal();this.selected.focus();};
 previewSwitch(id:string):void{if(privacyEnabled()||this.readonlyView)return;const workspace=this.store.get(id);if(!workspace)throw new Error('Workspace no longer exists');this.open();this.selected.value=id;this.name.value=workspace.name;this.preview({kind:'switch',workspace,name:workspace.name});}
 private closed=():void=>{this.invalidate();this.trigger.focus();};
 private preview(plan:Preview):void {
  this.pending=plan;this.apply.disabled=false;
  if(plan.kind==='import')this.status.textContent=`Import ${plan.workspaces.length} workspace(s) as new copies: ${plan.workspaces.map(w=>w.name).join(', ')}. Current settings stay active. Credentials and drafts are excluded.`;
  else{const snapshot=plan.kind==='create'||plan.kind==='save'?plan.snapshot:plan.workspace;const display=snapshot.settings.display;
   this.status.textContent=`${plan.kind}: ${'name' in plan?plan.name:plan.workspace.name}. Channels ${snapshot.channels.map(c=>'#'+c).join(', ')}; send to #${snapshot.target}; ${display.font} ${display.size}px, ${display.colour}, layout ${display.split}; ${snapshot.readers.length} paused reader position(s). ${Array.isArray(snapshot.settings.extras.commands)?snapshot.settings.extras.commands.length+' command definition(s) in this snapshot. ':''}${plan.kind==='switch'?'Switch restores snapshot preferences and command definitions, then reloads the view; unsent channel drafts stay in this tab.':plan.kind==='delete'?'Delete this saved workspace; channel history and drafts remain.':'Current channels and public panel settings stay visible until you switch.'}`;
  }
 }
 private click=(event:MouseEvent):void=>{
  if(!(event.target instanceof Element))return;const action=event.target.closest<HTMLButtonElement>('[data-workspace-action]')?.dataset.workspaceAction;if(!action)return;
  try{
   if(this.readonlyView&&action!=='close')throw new Error('Manage workspaces in the main view');
   if(action==='close'){this.root.close();return;}
   if(action==='apply'){this.commit();return;}
   if(action==='export'){if(privacyEnabled())throw new Error('Workspace export is disabled in privacy mode');this.saveCurrent();const file=workspaceFile(this.store.all());const url=URL.createObjectURL(new Blob([file],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='chatty-cat-workspaces.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.status.textContent='Exported public workspace settings; drafts and credentials are excluded';return;}
   if(action==='create'){this.preview({kind:'create',name:this.name.value,snapshot:this.capture()});return;}
   const workspace=this.store.get(this.selected.value);if(!workspace)throw new Error('Choose a saved workspace');
   if(action==='save')this.preview({kind:'save',workspace,snapshot:this.capture()});
   else if(action==='rename'||action==='duplicate'||action==='delete'||action==='switch')this.preview({kind:action,workspace,name:this.name.value});
  }catch(error){this.status.textContent=error instanceof Error?error.message:'Workspace action failed';}
 };
 private commit():void {
  const plan=this.pending;if(!plan)return;
  if(plan.kind==='create'){const workspace=this.store.create(plan.name,plan.snapshot);if(!this.currentID()){this.store.activate(workspace.id);this.navigate(workspace);return;}}
  else if(plan.kind==='rename')this.store.rename(plan.workspace.id,plan.name);
  else if(plan.kind==='duplicate')this.store.duplicate(plan.workspace.id,plan.name);
  else if(plan.kind==='delete')this.store.remove(plan.workspace.id);
  else if(plan.kind==='save'){if(plan.workspace.id!==this.currentID())throw new Error('Switch to a workspace before overwriting its saved settings');this.store.update(plan.workspace.id,plan.snapshot);}
  else if(plan.kind==='import')this.store.import(plan.workspaces);
  else {this.saveCurrent();this.store.activate(plan.workspace.id);this.navigate(this.store.get(plan.workspace.id)!);return;}
  this.invalidate();this.paint();this.status.textContent='Workspace change saved';
 }
 private fileChanged=():void=>{this.invalidate();const generation=this.generation,file=this.file.files?.[0];if(!file)return;
  if(file.size>256*1024){this.status.textContent='Workspace files must be at most 256 KB';return;}
  void file.text().then(raw=>{if(generation!==this.generation)return;this.preview({kind:'import',workspaces:parseWorkspaceFile(raw)});}).catch(error=>{if(generation===this.generation)this.status.textContent=error instanceof Error?error.message:'Workspace file could not be read';});
 };
 stop():void{this.invalidate();this.root.removeEventListener('click',this.click);this.root.removeEventListener('close',this.closed);this.trigger.removeEventListener('click',this.open);this.selected.removeEventListener('change',this.select);this.name.removeEventListener('input',this.invalidate);this.file.removeEventListener('change',this.fileChanged);}
}
