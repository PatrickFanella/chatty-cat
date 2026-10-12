import type {ChatMessage} from './protocol';
export interface MessageRule {id:string;name:string;enabled:boolean;field:'phrase'|'author'|'badge'|'type';pattern:string;regex:boolean;caseSensitive:boolean;action:'highlight'|'ignore';color:string;sound:boolean;notify:boolean;inbox:boolean;scope:'global'|'pane'}
export interface RuleDecision {hidden:boolean;highlight:boolean;color:string;sound:boolean;notify:boolean;inbox:boolean;matched:string[]}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
// Regex is a finite subset plus at most one wildcard run. No groups, backrefs,
// lookarounds or repeated quantifiers; both pattern and input have hard bounds.
export function compilePattern(pattern:string,regex:boolean,caseSensitive:boolean):(text:string)=>boolean {
 if(!pattern.trim()||pattern.length>128)throw new Error('Choose a pattern of 1–128 characters');
 if(!regex){const needle=caseSensitive?pattern:pattern.toLowerCase();return text=>(caseSensitive?text:text.toLowerCase()).slice(0,2000).includes(needle);}
 let wildcards=0,inClass=false;
 for(let i=0;i<pattern.length;i++){const c=pattern[i]!;if(c==='\\'){const next=pattern[++i];if(!next||/[0-9kp]/.test(next))throw new Error('Backreferences and Unicode properties are unsupported');continue;}if(c==='['){if(inClass)throw new Error('Nested classes are unsupported');inClass=true;continue;}if(c===']'){inClass=false;continue;}if(inClass)continue;if('(){}?'.includes(c))throw new Error('Groups, repetition counts and optional quantifiers are unsupported');if(c==='*'||c==='+'){if(pattern[i-1]!=='.'||++wildcards>1)throw new Error('Only one .* or .+ wildcard is supported');}}
 let compiled:RegExp;try{compiled=new RegExp(pattern,caseSensitive?'u':'iu');}catch{throw new Error('Invalid regular expression');}return text=>compiled.test(text.slice(0,2000));
}
export function parseRules(value:unknown):MessageRule[]{
 if(!object(value)||value.version!==undefined&&value.version!==1||!Array.isArray(value.rules))throw new Error('Invalid rules file');if(value.rules.length>32||JSON.stringify(value).length>32768)throw new Error('At most 32 rules / 32 KB are supported');const ids=new Set<string>();
 return value.rules.map((raw):MessageRule=>{if(!object(raw)||typeof raw.id!=='string'||!/^[a-zA-Z0-9_-]{1,60}$/.test(raw.id)||ids.has(raw.id)||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>60||typeof raw.pattern!=='string'||!['phrase','author','badge','type'].includes(String(raw.field))||!['highlight','ignore'].includes(String(raw.action))||!['global','pane'].includes(String(raw.scope))||typeof raw.color!=='string'||!/^#[\da-f]{6}$/i.test(raw.color))throw new Error('Invalid rule fields');ids.add(raw.id);
 const rule:MessageRule={id:raw.id,name:raw.name,pattern:raw.pattern,field:raw.field as MessageRule['field'],action:raw.action as MessageRule['action'],scope:raw.scope as MessageRule['scope'],color:raw.color,enabled:raw.enabled===true,regex:raw.regex===true,caseSensitive:raw.caseSensitive===true,sound:raw.sound===true,notify:raw.notify===true,inbox:raw.inbox===true};compilePattern(rule.pattern,rule.regex,rule.caseSensitive);return rule;});
}
export class RuleEngine {
 private compiled:{rule:MessageRule;match:(text:string)=>boolean}[];
 private counters:Record<string,number>={};private seen=new Set<string>();private cache=new WeakMap<ChatMessage,Map<string,RuleDecision>>();
 constructor(readonly rules:readonly MessageRule[]){this.compiled=rules.map(rule=>({rule,match:compilePattern(rule.pattern,rule.regex,rule.caseSensitive)}));}
 evaluate(message:ChatMessage,paneRules:readonly string[]=[]):RuleDecision {
  const key=paneRules.join(',');let cached=this.cache.get(message);const previous=cached?.get(key);if(previous)return previous;
  const result:RuleDecision={hidden:false,highlight:false,color:'',sound:false,notify:false,inbox:false,matched:[]};
  for(const {rule,match} of this.compiled){if(!rule.enabled||rule.scope==='pane'&&!paneRules.includes(rule.id))continue;const text=rule.field==='phrase'?message.text:rule.field==='author'?message.login:rule.field==='badge'?(message.tags.badges??'').split(',').map(v=>v.split('/')[0]).join(' '):message.command;if(!match(text))continue;result.matched.push(rule.id);
   if(rule.action==='ignore'){result.hidden=true;result.highlight=false;result.sound=false;result.notify=false;result.inbox=false;break;}
   result.highlight=true;result.color=rule.color;result.sound ||=rule.sound;result.notify ||=rule.notify;result.inbox ||=rule.inbox;
  }
  if(!cached){cached=new Map();this.cache.set(message,cached);}if(cached.size<25)cached.set(key,result);return result;
 }
 observe(message:ChatMessage,paneRules:readonly string[]=[]):RuleDecision{const result=this.evaluate(message,paneRules),key=message.channel+':'+message.id;if(!this.seen.has(key)){this.seen.add(key);for(const id of result.matched)this.counters[id]=Math.min(1e9,(this.counters[id]??0)+1);while(this.seen.size>5000)this.seen.delete(this.seen.values().next().value!);}return result;}
 counts():Record<string,number>{return {...this.counters};}
}
