import {privacyEnabled} from './privacy';
import {previewStatisticsMove,moveStatistics,type StatisticsMove} from './stats-storage';
export class StatisticsStorageControls {
 readonly root=document.createElement('fieldset');
 private plan:StatisticsMove|undefined;
 private disposed=false;
 constructor(container:HTMLElement){
  const title=document.createElement('legend');title.textContent='Public statistics storage';
  const help=document.createElement('p');help.textContent='Statistics use IndexedDB. Older public-count snapshots can occupy localStorage space needed by workspaces and settings. Review a move to keep counts available, retain exact recovery copies and release only their old localStorage slots. Chat history, account settings and private journals stay in place.';
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-label','Statistics storage status');
  const review=document.createElement('button');review.type='button';review.textContent='Review move statistics storage';
  const backup=document.createElement('button');backup.type='button';backup.textContent='Download reviewed statistics backup';backup.disabled=true;
  const confirm=document.createElement('button');confirm.type='button';confirm.textContent='Move reviewed statistics to IndexedDB';confirm.disabled=true;
  review.addEventListener('click',()=>{this.plan=undefined;confirm.disabled=backup.disabled=true;try{if(privacyEnabled())throw new Error('Leave privacy mode before reviewing storage');this.plan=previewStatisticsMove();status.textContent=this.plan.entries.length?'Move '+this.plan.entries.length+' public statistics scopes ('+Math.ceil(this.plan.characters*2/1024).toLocaleString()+' KiB of UTF-16 key/value data). Exact recovery copies are committed and read back before old slots are released. Counts remain available; other browser records are untouched.':'No older localStorage statistics need moving';confirm.disabled=backup.disabled=!this.plan.entries.length;}catch(e){status.textContent=e instanceof Error?e.message:'Statistics storage unavailable';}});
  backup.addEventListener('click',()=>{if(!this.plan||privacyEnabled())return;const url=URL.createObjectURL(new Blob([JSON.stringify({format:'chatty-cat-public-statistics-recovery',version:1,entries:this.plan.entries},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='chatty-cat-statistics-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  confirm.addEventListener('click',()=>{const plan=this.plan;if(!plan||privacyEnabled())return;this.plan=undefined;review.disabled=confirm.disabled=backup.disabled=true;void moveStatistics(plan).then(result=>{if(!this.disposed)status.textContent='Moved '+result.moved+' public statistics scopes; exact IndexedDB recovery copies retained. '+(result.changed?result.changed+' changed scopes stayed in localStorage; review again.':'Workspaces and settings can retry saving now.');}).catch(e=>{if(!this.disposed)status.textContent=e instanceof Error?e.message:'Statistics move failed; retained originals/recovery copies remain available';}).finally(()=>{if(!this.disposed)review.disabled=false;});});
  this.root.append(title,help,review,backup,confirm,status);container.insertBefore(this.root,container.querySelector('#stats-body'));
 }
 stop():void{this.disposed=true;this.plan=undefined;this.root.remove();}
}
