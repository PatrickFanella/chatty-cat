import { expect, it } from 'vitest';
import { compileTemplate, expandTemplate, parseCommandList } from './commands';
const context={channel:{name:'room',id:'10',title:'Live',game:'Games'},account:{name:'viewer',id:'20'},message:{name:'alice',id:'30',text:'hello {my.name}'},input:'draft'};
it('expands positional ranges and supported context variables once, preserving escapes',()=>{
 expect(expandTemplate(compileTemplate('{{1} {1} {2+} {channel.name} {my.id} {msg.text}'),['one','two','three'],context)).toBe('{1} one two three room 20 hello {my.name}');
});
it('rejects unknown or unfinished placeholders and oversized expansion',()=>{
 expect(()=>compileTemplate('{process.exec}')).toThrow(/placeholder/);expect(()=>compileTemplate('{1')).toThrow();
 expect(()=>expandTemplate(compileTemplate('{1}{1}'),['x'.repeat(300)],context)).toThrow(/500/);
 expect(()=>expandTemplate(compileTemplate('{user.name}'),[],{...context,message:undefined})).toThrow(/message/);
});
it('validates and bounds user definitions, excludes unknown metadata and duplicate triggers',()=>{
 const item={trigger:'/hello',name:'Greet',group:'Community',body:'Hello {1}',csrf:'secret'};
 expect(parseCommandList([item])).toEqual([{trigger:'/hello',name:'Greet',group:'Community',body:'Hello {1}'}]);
 expect(()=>parseCommandList([item,item])).toThrow(/Duplicate/);expect(()=>parseCommandList(Array(51).fill(item))).toThrow(/50/);
 expect(()=>parseCommandList([{...item,trigger:'/ban'}])).toThrow(/built-in/);
});
it('treats code-shaped text literally and rejects recursive command expansion',()=>{
 expect(expandTemplate(compileTemplate('<script>{1}</script>'),['literal'],context)).toBe('<script>literal</script>');
 expect(()=>expandTemplate(compileTemplate('/hello {1}'),['loop'],context,['/hello'])).toThrow(/recursive/);
});
