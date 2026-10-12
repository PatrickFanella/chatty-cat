// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {PanelRail} from './rail';
let rail:PanelRail|undefined;
afterEach(()=>{rail?.stop();document.body.replaceChildren();localStorage.clear();vi.unstubAllGlobals();});
it('docks the selected rail contents and restores floating homes and visibility',()=>{
 vi.stubGlobal('innerWidth',1280);vi.stubGlobal('innerHeight',800);const log=document.createElement('main');document.body.append(log);
 const roots=['video','emotes','stats'].map(name=>{const root=document.createElement('section');root.id=name;root.hidden=true;root.style.left='40px';document.body.append(root);return root;});
 rail=new PanelRail(log,roots.map((root,i)=>({name:['video','emotes','stats'][i] as 'video'|'emotes'|'stats',root,isOpen:()=>!root.hidden,show:open=>{root.hidden=!open;}})));
 rail.set(4);expect(document.querySelectorAll('#panel-rail>.rail-panel')).toHaveLength(3);expect(roots[0]?.style.left).toBe('40px');
 roots[1]?.querySelector<HTMLButtonElement>('.rail-float')?.click();expect(roots[1]?.parentNode).toBe(document.body);expect(roots[1]?.hidden).toBe(false);roots[1]?.querySelector<HTMLButtonElement>('.rail-float')?.click();expect(roots[1]?.parentElement?.id).toBe('panel-rail');
 rail.set(6);expect(document.querySelectorAll('#panel-rail>.rail-panel')).toHaveLength(1);expect(roots[0]?.hidden).toBe(true);expect(roots[2]?.hidden).toBe(true);
 rail.set(1);expect(document.querySelector('#panel-rail')?.hasAttribute('hidden')).toBe(true);for(const root of roots){expect(root.parentNode).toBe(document.body);expect(root.hidden).toBe(true);}
});

it('exposes a bounded keyboard splitter only while both panes are docked',()=>{
 vi.stubGlobal('innerWidth',1280);vi.stubGlobal('innerHeight',800);const log=document.createElement('main');document.body.append(log);
 const panels=(['emotes','stats'] as const).map(name=>{const root=document.createElement('section');document.body.append(root);return {name,root,isOpen:()=>false,show:()=>{}};});
 rail=new PanelRail(log,panels);rail.set(4);const separator=document.querySelector<HTMLElement>('#rail-split')!;expect(separator.hidden).toBe(false);
 separator.dispatchEvent(new KeyboardEvent('keydown',{key:'End',cancelable:true}));expect(separator.getAttribute('aria-valuenow')).toBe('92');expect(panels[0]!.root.style.flexGrow).toBe('0.92');expect(localStorage.getItem('chatthing:v1:rail:split')).toBe('0.92');
 panels[1]!.root.querySelector<HTMLButtonElement>('.rail-float')!.click();expect(separator.hidden).toBe(true);expect(panels[1]!.root.style.flexGrow).toBe('');
 rail.set(6);expect(separator.hidden).toBe(true);
});
