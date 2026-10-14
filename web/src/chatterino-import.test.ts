// @vitest-environment happy-dom
import {expect,it} from 'vitest';
import {defaultDisplay} from './display';
import {parseSnapshot,workspaceFile} from './workspaces';
import {planChatterinoImport} from './chatterino-import';
import {parseBundle} from './settings-bundle';
const base=()=>parseSnapshot({channels:['current'],target:'current',focus:'log',settings:{version:1,display:defaultDisplay(),extras:{}},readers:[]});
const split=(name:string)=>({type:'split',data:{type:'twitch',name},flexh:1,flexv:1});
const layout={windows:[{type:'main',x:20,tabs:[{title:'Friends',selected:true,splits2:{type:'horizontal',items:[split('One'),split('two')]}}]}]};
it('maps real splits2 tabs into new workspaces and reports native geometry without changing the current snapshot',()=>{
 const current=base(),original=JSON.stringify(current),plan=planChatterinoImport({layout:JSON.stringify(layout)},current,'Imported');
 expect(plan.workspaces[0]?.channels).toEqual(['one','two']);expect(plan.workspaces[0]?.settings.extras.splits).toMatchObject({enabled:true,tabs:[{name:'Friends',panes:[{channels:['one']},{channels:['two']}]}]});
 expect(plan.report.join('\n')).toContain('geometry');expect(JSON.stringify(current)).toBe(original);expect(workspaceFile(plan.workspaces)).not.toContain('"x"');
});
it('allowlists appearance and compatible command placeholders while excluding credentials and native scripts',()=>{
 const plan=planChatterinoImport({settings:JSON.stringify({appearance:{messages:{showTimestamps:false,timestampFormat:'HH:mm:ss'}},accounts:{oauth:'SECRET_TOKEN'},plugins:{script:'SECRET_SCRIPT'}}),commands:JSON.stringify({commands:[{name:'/hi',func:'Hello {1+} in {channel.name}'},{name:'/shell',func:'/exec SECRET_SCRIPT'}]})},base(),'Imported');
 expect(plan.workspaces[0]?.settings.extras.presentation).toMatchObject({showTimestamps:false,timestampFormat:'HH:mm:ss'});
 expect(plan.workspaces[0]?.settings.extras.commands).toEqual([{trigger:'/hi',name:'/hi',group:'Chatterino',body:'Hello {1+} in {channel.name}'}]);
 const portable=workspaceFile(plan.workspaces)+plan.report.join('\n');expect(portable).not.toMatch(/SECRET_TOKEN|SECRET_SCRIPT|oauth/);expect(plan.report.join('\n')).toContain('excluded');
});
it('keeps existing commands and reports trigger conflicts and unsupported private channel panes',()=>{
 const current=base();current.settings.extras.commands=[{trigger:'/hi',name:'Existing',group:'',body:'kept'}];
 const plan=planChatterinoImport({commands:JSON.stringify({commands:[{name:'/hi',func:'changed'},{name:'/bye',func:'bye'}]}),layout:JSON.stringify({windows:[{tabs:[{splits2:{type:'horizontal',items:[split('one'),{type:'split',data:{type:'whispers'}}]}}]}]})},current,'Import');
 expect(plan.workspaces[0]?.settings.extras.commands).toEqual(expect.arrayContaining([expect.objectContaining({body:'kept'}),expect.objectContaining({trigger:'/bye'})]));
 expect(plan.workspaces[0]?.channels).toEqual(['one']);expect(plan.report.join('\n')).toMatch(/conflict/);expect(plan.report.join('\n')).toMatch(/unsupported channel/);
});
it('rejects malformed supported fields, duplicate commands and oversized/deep input before producing an import',()=>{
 expect(()=>planChatterinoImport({settings:'{"appearance":{"messages":{"showTimestamps":"yes"}}}'},base(),'Import')).toThrow(/boolean/);
 expect(()=>planChatterinoImport({commands:'{"commands":[{"name":"/x","func":"x"},{"name":"/x","func":"y"}]}'},base(),'Import')).toThrow(/Duplicate/);
 expect(()=>planChatterinoImport({layout:JSON.stringify({windows:[{tabs:[{splits2:split('bad channel')}]}]})},base(),'Import')).toThrow(/channel/);
 expect(()=>planChatterinoImport({settings:' '.repeat(256*1024+1)},base(),'Import')).toThrow(/256/);
 expect(()=>planChatterinoImport({settings:'{"x":'.repeat(20)+'0'+'}'.repeat(20)},base(),'Import')).toThrow(/depth/);
 expect(()=>planChatterinoImport({settings:'{"__proto__":{"x":1}}'},base(),'Import')).toThrow(/key/);
});
it('refuses a layout above pane/channel limits rather than silently dropping supported channels',()=>{
 expect(()=>planChatterinoImport({layout:JSON.stringify({windows:[{tabs:[{splits2:{type:'horizontal',items:Array.from({length:7},(_,i)=>split('channel'+i))}}]}]})},base(),'Import')).toThrow(/six/);
});
it('maps source font keys and separator settings into validated target appearance fields',()=>{
 const plan=planChatterinoImport({settings:JSON.stringify({appearance:{currentFontFamily:'Consolas',currentFontSize:18,messages:{separateMessages:true,alternateMessageBackground:false}}})},base(),'Fonts');
 expect(plan.workspaces[0]?.settings.display).toMatchObject({font:'mono',size:24});expect(plan.workspaces[0]?.settings.extras.presentation).toMatchObject({separators:'on',alternating:'off'});expect(plan.report.join('\n')).toContain('18pt');
});
it('retains a large validated command and pane bundle when capturing portable preferences',()=>{
 const current=base();current.settings.extras.splits={version:1,enabled:true,active:'t0',closed:[],tabs:Array.from({length:4},(_,i)=>({id:'t'+i,name:'Tab '+i,active:'p'+i+'-0',panes:Array.from({length:6},(_,j)=>({id:'p'+i+'-'+j,channels:['current'],target:'current',filter:'x'.repeat(180),weight:1,reverse:false,pauseHover:false,unread:0,reader:null}))}))};
 const plan=planChatterinoImport({commands:JSON.stringify({commands:Array.from({length:30},(_,i)=>({name:'/c'+i,func:'x'.repeat(1900)}))})},current,'Large');
 const workspace=plan.workspaces[0]!;
 expect(JSON.stringify(workspace.settings.extras).length).toBeGreaterThan(65536);
 const parsed=parseBundle(workspace.settings,defaultDisplay);expect(parsed?.extras.commands).toHaveLength(30);expect(parsed?.extras.splits).toMatchObject({enabled:true});
});
it('maps reviewed overlay background and content-shadow fields without native window commands',()=>{
 const plan=planChatterinoImport({settings:JSON.stringify({appearance:{overlay:{backgroundOpacity:128,shadow:true,shadowOpacity:200,shadowColor:'#abc',shadowOffsetX:-3,shadowOffsetY:4,shadowRadius:6}},native:{script:'SECRET'}})},base(),'Overlay');
 expect(plan.workspaces[0]?.settings.extras.presentation).toMatchObject({overlayBackgroundOpacity:128,overlayShadow:true,overlayShadowOpacity:200,overlayShadowColor:'#aabbcc',overlayShadowOffsetX:-3,overlayShadowOffsetY:4,overlayShadowRadius:6});expect(JSON.stringify(plan)).not.toContain('SECRET');
});
