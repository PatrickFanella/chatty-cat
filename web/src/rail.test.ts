// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {PanelRail} from './rail';
let rail:PanelRail|undefined;
afterEach(()=>{rail?.stop();document.body.replaceChildren();vi.unstubAllGlobals();});
it('docks the selected rail contents and restores floating homes and visibility',()=>{
 vi.stubGlobal('innerWidth',1280);vi.stubGlobal('innerHeight',800);const log=document.createElement('main');document.body.append(log);
 const roots=['video','emotes','stats'].map(name=>{const root=document.createElement('section');root.id=name;root.hidden=true;root.style.left='40px';document.body.append(root);return root;});
 rail=new PanelRail(log,roots.map((root,i)=>({name:['video','emotes','stats'][i] as 'video'|'emotes'|'stats',root,isOpen:()=>!root.hidden,show:open=>{root.hidden=!open;}})));
 rail.set(4);expect(document.querySelector('#panel-rail')?.children).toHaveLength(3);expect(roots[0]?.style.left).toBe('40px');
 roots[1]?.querySelector<HTMLButtonElement>('.rail-float')?.click();expect(roots[1]?.parentNode).toBe(document.body);expect(roots[1]?.hidden).toBe(false);roots[1]?.querySelector<HTMLButtonElement>('.rail-float')?.click();expect(roots[1]?.parentElement?.id).toBe('panel-rail');
 rail.set(6);expect(document.querySelector('#panel-rail')?.children).toHaveLength(1);expect(roots[0]?.hidden).toBe(true);expect(roots[2]?.hidden).toBe(true);
 rail.set(1);expect(document.querySelector('#panel-rail')?.hasAttribute('hidden')).toBe(true);for(const root of roots){expect(root.parentNode).toBe(document.body);expect(root.hidden).toBe(true);}
});
