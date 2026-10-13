type StorageAccess=Pick<StorageManager,'persisted'|'estimate'> & Partial<Pick<StorageManager,'persist'>>;
export type StorageHealth={kind:'unavailable'}|{kind:'protected'|'best-effort';usage?:number;quota?:number};
function access():StorageAccess|undefined{return typeof navigator!=='undefined'?navigator.storage:undefined;}
function bytes(value:unknown):number|undefined{return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:undefined;}
export async function readStorageHealth():Promise<StorageHealth>{
 const storage=access();if(!storage||typeof storage.persisted!=='function')return {kind:'unavailable'};
 try{const protectedData=await storage.persisted();if(typeof protectedData!=='boolean')return {kind:'unavailable'};let usage:number|undefined,quota:number|undefined;try{const estimate=await storage.estimate();usage=bytes(estimate.usage);quota=bytes(estimate.quota);}catch{/* Protection status remains known when an estimate is unavailable. */}
 return {kind:protectedData?'protected':'best-effort',...(usage===undefined?{}:{usage}),...(quota===undefined?{}:{quota})};}catch{return {kind:'unavailable'};}
}
export async function protectLocalStorage():Promise<StorageHealth>{
 const storage=access();if(!storage||typeof storage.persist!=='function')return {kind:'unavailable'};
 try{await storage.persist();return await readStorageHealth();}catch{return {kind:'unavailable'};}
}
export class LocalStorageHealthPanel {
 readonly root=document.createElement('section');busy=false;
 private status=document.createElement('p');private generation=0;private check:HTMLButtonElement;private protect:HTMLButtonElement;
 constructor(private guarded:()=>boolean){
  this.root.dataset.privateStorage='true';this.root.setAttribute('aria-label','Local storage protection');this.status.setAttribute('role','status');
  const help=document.createElement('p');help.textContent='Local records can be removed by the browser when disk space is low. Browser protection covers saved chat and private records for this site. Clearing site data still removes them; keep reviewed private backups.';
  this.check=this.button('Check local storage',false);this.protect=this.button('Protect local records from browser cleanup',true);this.root.append(help,this.check,this.protect,this.status);
 }
 private button(label:string,request:boolean):HTMLButtonElement{const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{if(!this.guarded()||this.busy)return;void this.update(request);};return button;}
 refresh():void{if(!this.busy)void this.update(false);}
 private async update(request:boolean):Promise<void>{
  const generation=this.generation;this.busy=true;this.check.disabled=true;this.protect.disabled=true;
  const health=await(request?protectLocalStorage():readStorageHealth());if(generation!==this.generation)return;
  this.status.textContent=health.kind==='unavailable'?'Browser storage protection unavailable. Keep private backups and free disk space before further actions.':health.kind==='protected'?'Browser protection granted for local records. Clearing site data still removes them.':'Local records use best-effort storage; the browser may remove them. '+(request?'Protection was not granted; keep private backups.':'Browser protection is not enabled; keep private backups.');
  if(health.kind!=='unavailable'&&health.quota!==undefined)this.status.textContent+=health.quota===0?' Browser reports no storage allowance; free disk space before saving.':` Estimated browser allowance: ${(health.quota/1048576).toFixed(1)} MiB${health.usage===undefined?'':`; used ${(health.usage/1048576).toFixed(1)} MiB`}.`;
  this.busy=false;this.check.disabled=false;this.protect.disabled=health.kind==='protected';
 }
 stop():void{this.generation++;this.busy=false;this.status.textContent='';this.check.disabled=false;this.protect.disabled=false;}
}
