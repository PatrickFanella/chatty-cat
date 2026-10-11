import type { ChatMessage,ServerEvent } from './protocol';
export class ChatRecovery {
 private connected=false;
 private interrupted:number|undefined;
 constructor(private channel:string,private add:(message:ChatMessage)=>void){}
 status(event:Extract<ServerEvent,{type:'status'}>,now=Date.now()):void {
  if(event.state==='connected'){
   if(this.interrupted!==undefined){const seconds=Math.max(0,Math.round((now-this.interrupted)/1000));this.notice(`Chat reconnected after ${seconds}s; available backfill may not cover the entire gap`,now);this.interrupted=undefined;}
   this.connected=true;
  }else if(this.connected&&this.interrupted===undefined){this.interrupted=now;this.notice('Chat connection interrupted; messages may be missed while reconnecting',now);}
 }
 private notice(text:string,timestamp:number):void {this.add({id:'gap-'+crypto.randomUUID(),command:'NOTICE',channel:this.channel,login:'',text,timestamp,tags:{'msg-id':'gap','client-notice':'1'}});}
}
