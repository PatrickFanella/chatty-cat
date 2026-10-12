// Retained message objects keep only weak cache identities. DOM reuse has an
// independent bound across all pane scopes, even after browsing deep history.
export class RowCache {
 private identities=new WeakMap<object,number>();
 private next=0;
 private rows=new Map<string,{revision:number;row:HTMLElement}>();
 constructor(private limit=2048){}
 get size():number{return this.rows.size;}
 get(message:object,scope:string,revision:number,build:()=>HTMLElement):HTMLElement{
  let id=this.identities.get(message);if(id===undefined){id=++this.next;this.identities.set(message,id);}const key=scope+':'+id,previous=this.rows.get(key);this.rows.delete(key);
  const row=previous?.revision===revision?previous.row:build();this.rows.set(key,{revision,row});while(this.rows.size>this.limit){const oldest=this.rows.keys().next().value;if(oldest===undefined)break;this.rows.delete(oldest);}return row;
 }
 clear():void{this.rows.clear();}
}
