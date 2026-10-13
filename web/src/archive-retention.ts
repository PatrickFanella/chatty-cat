export interface ArchiveRetention {rows:number;days:number}
export const RETENTION_KEY='chatthing:v1:archive-retention';
export function parseRetention(value:unknown):ArchiveRetention {
 if(value&&typeof value==='object'&&'rows' in value&&'days' in value&&typeof value.rows==='number'&&Number.isSafeInteger(value.rows)&&value.rows>=1000&&value.rows<=100000&&typeof value.days==='number'&&[0,7,30,90].includes(value.days))return {rows:value.rows,days:value.days};
 return {rows:100000,days:0};
}
export function readRetention():ArchiveRetention{try{return parseRetention(JSON.parse(localStorage.getItem(RETENTION_KEY)??'null'));}catch{return parseRetention(null);}}
export interface RetentionPlan {policy:ArchiveRetention;at:number;rows:number;remove:number;oldest:number|null;newest:number|null;signature:string}
