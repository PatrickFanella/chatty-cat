// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PanelRail} from './rail';
let rail:PanelRail|undefined;
beforeEach(()=>localStorage.clear());
afterEach(()=>{rail?.stop();document.body.replaceChildren();vi.unstubAllGlobals();});
it('docks the selected rail contents and restores floating homes and visibility',()=>{
 vi.stubGlobal('innerWidth',1280);vi.stubGlobal('innerHeight',800);const log=document.createElement('main');document.body.append(log);
 const roots=['video','emotes','stats'].map(name=>{const root=document.createElement('section');root.id=name;root.hidden=true;root.style.left='40px';document.body.append(root);return root;});
 rail=new PanelRail(log,roots.map((root,i)=>({name:['video','emotes','stats'][i] as 'video'|'emotes'|'stats',root,isOpen:()=>!root.hidden,show:open=>{root.hidden=!open;}})));
 rail.set(4);expect(document.querySelectorAll('#panel-rail>.rail-panel')).toHaveLength(3);expect(roots[0]?.style.left).toBe('40px');
 roots[1]?.querySelector<HTMLButtonElement>('.rail-float')?.click();expect(roots[1]?.parentNode).toBe(document.body);expect(roots[1]?.hidden).toBe(false);roots[1]?.querySelector<HTMLButtonElement>('.rail-float')?.click();expect(roots[1]?.parentElement?.id).toBe('panel-rail');
 rail.set(6);expect(document.querySelectorAll('#panel-rail>.rail-panel')).toHaveLength(1);expect(roots[0]?.hidden).toBe(true);expect(roots[2]?.hidden).toBe(true);
 rail.set(1);expect(document.querySelector('#panel-rail')?.hasAttribute('hidden')).toBe(true);for(const root of roots){expect(root.parentNode).toBe(document.body);expect(root.hidden).toBe(true);}
});
it('resizes docked emotes and stats with a bounded keyboard separator and restores their floating styles',()=>{
 vi.stubGlobal('innerWidth',1280);vi.stubGlobal('innerHeight',800);
 const log=document.createElement('main'),emotes=document.createElement('section'),stats=document.createElement('section');document.body.append(log,emotes,stats);emotes.style.flexGrow='2';
 rail=new PanelRail(log,[{name:'emotes',root:emotes,isOpen:()=>!emotes.hidden,show:open=>{emotes.hidden=!open;}},{name:'stats',root:stats,isOpen:()=>!stats.hidden,show:open=>{stats.hidden=!open;}}]);rail.set(4);
 const seam=document.querySelector<HTMLElement>('[role=separator]')!;
 expect(seam.hidden).toBe(false);expect(seam.nextSibling).toBe(stats);
 seam.dispatchEvent(new KeyboardEvent('keydown',{key:'End',cancelable:true}));
 expect(emotes.style.flexGrow).toBe('0.92');expect(Number(stats.style.flexGrow)).toBeCloseTo(.08);expect(seam.getAttribute('aria-valuenow')).toBe('92');
 seam.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',cancelable:true}));expect(emotes.style.flexGrow).toBe('0.08');
 stats.querySelector<HTMLButtonElement>('.rail-float')!.click();expect(seam.hidden).toBe(true);expect(stats.style.flexGrow).toBe('');
 stats.querySelector<HTMLButtonElement>('.rail-float')!.click();expect(seam.hidden).toBe(false);
 rail.set(1);expect(emotes.style.flexGrow).toBe('2');expect(seam.hidden).toBe(true);
 expect(JSON.parse(localStorage.getItem('chatthing:v1:rail:split')??'null')).toBe(.08);
});
