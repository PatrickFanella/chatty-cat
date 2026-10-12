import type {ChatMessage} from './protocol';
export const LOCAL_COMMANDS=['/clearmessages','/uptime','/openurl','/copy','/user','/usercard','/reply','/r','/whisper','/msg','.w','/requests','/help','/disconnect','/reconnect','/popout','/popup','/ignore','/unignore','/follow','/unfollow'] as const;
export function isLocalCommand(text:string):boolean{return (LOCAL_COMMANDS as readonly string[]).includes(text.trim().split(/\s/)[0]!.toLowerCase());}
export class LocalTargets {
 private identity='';publicReply:ChatMessage|undefined;recipient='';
 account(id:string):void{if(id!==this.identity){this.identity=id;this.publicReply=undefined;this.recipient='';}}
 reply(message:ChatMessage):void{if(this.identity&&message.id&&message.command==='PRIVMSG')this.publicReply={...message,tags:{...message.tags}};}
 whisper(login:string):void{if(this.identity&&/^[a-z0-9_]{1,25}$/i.test(login))this.recipient=login.toLowerCase();}
}
export interface LocalContext {channel:string;uptime:string;targets:LocalTargets;open:(url:string)=>boolean;copy:(text:string)=>Promise<void>;clear:(channel:string)=>void;user:(login:string,channel:string)=>boolean;ignore:(login:string,hide:boolean)=>void;connection:(connect:boolean)=>void;popout:(channel:string)=>boolean;reply:(message:ChatMessage,text:string)=>void;stage:(text:string)=>void;help:()=>void}
function login(value:string):string{const result=value.replace(/^#/,'').toLowerCase();if(!/^[a-z0-9_]{1,25}$/.test(result))throw new Error('Choose a valid Twitch user or channel');return result;}
function open(url:string,c:LocalContext):void{if(!c.open(url))throw new Error('Allow popups to open this link');}
export async function dispatchLocal(text:string,c:LocalContext):Promise<string|undefined>{
 const command=text.trim().split(/\s/)[0]!.toLowerCase();if(!isLocalCommand(text))return undefined;if(text.length>2000||/[\x00-\x1f\x7f-\x9f]/.test(text))throw new Error('Local commands must be one line of at most 2,000 characters');const arg=text.trim().slice(command.length).trim(),args=arg?arg.split(/\s+/):[];
 switch(command){
 case '/clearmessages':if(arg)throw new Error('Use /clearmessages in the current channel');c.clear(c.channel);return 'Cleared the local view of #'+c.channel+'; history and Twitch chat are retained';
 case '/uptime':return '#'+c.channel+' uptime: '+(c.uptime||'metadata unavailable');
 case '/openurl':{let u:URL;try{u=new URL(arg);}catch{throw new Error('Use /openurl with an HTTP(S) URL');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Only HTTP(S) links without credentials are supported');open(u.href,c);return 'Opened link';}
 case '/copy':if(!arg)throw new Error('Use /copy text');try{await c.copy(arg);}catch{throw new Error('Clipboard permission unavailable; copy the text manually');}return 'Copied text';
 case '/user':case '/usercard':{if(args.length<1||args.length>2)throw new Error('Use /user name [channel]');const user=login(args[0]!),channel=args[1]?login(args[1]):c.channel;if(!c.user(user,channel))throw new Error('No observed public message for '+user+' in #'+channel+'; open their Twitch profile');return 'Opened observed user card in #'+channel;}
 case '/reply':if(!c.targets.publicReply)throw new Error('Select a public reply thread in this account first');c.reply(c.targets.publicReply,arg);return 'Public reply staged; review and press Send';
 case '/r':if(!c.targets.recipient)throw new Error('Choose a private whisper recipient in this account first');c.stage('/w '+c.targets.recipient+(arg?' '+arg:' '));return 'Private whisper staged; review and press Send';
 case '/whisper':case '/msg':case '.w':if(!args.length)throw new Error('Use '+command+' recipient [text]');{const recipient=login(args[0]!);c.stage('/w '+recipient+' '+arg.slice(args[0]!.length).trim());c.targets.whisper(recipient);return 'Private whisper staged; review and press Send';}
 case '/requests':if(args.length>1)throw new Error('Use /requests [channel]');open('https://www.twitch.tv/popout/'+(args[0]?login(args[0]):c.channel)+'/reward-queue',c);return 'Opened channel-points reward queue; Twitch checks permissions';
 case '/help':c.help();return 'Local command help opened';
 case '/disconnect':case '/reconnect':if(arg)throw new Error('Use '+command+' without arguments');c.connection(command==='/reconnect');return command==='/disconnect'?'Chat streams disconnected; missed messages may be unavailable':'Reconnecting chat streams';
 case '/popout':case '/popup':if(!c.popout(args[0]?login(args[0]):c.channel))throw new Error('Allow popups to open the chat view');return 'Opened browser chat popout';
 case '/ignore':case '/unignore':if(args.length!==1)throw new Error('Use '+command+' username');c.ignore(login(args[0]!),command==='/ignore');return 'Local user visibility updated; Twitch blocking is unchanged. /block and /unblock are separate provider actions';
 case '/follow':case '/unfollow':open('https://www.twitch.tv/'+(args[0]?login(args[0]):c.channel),c);return 'Open Twitch to '+command.slice(1)+'; this app did not change follow state';
 }
}
