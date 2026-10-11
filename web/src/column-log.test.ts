// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {ColumnLog} from './column-log';
import type {LogItem} from './virtual-log';
let view:ColumnLog|undefined;
afterEach(()=>{view?.stop();document.body.replaceChildren();vi.unstubAllGlobals();});
function records(n:number):LogItem[]{return Array.from({length:n},(_,i)=>({key:String(i),render:()=>{const row=document.createElement('article');row.className='row';row.textContent=String(i);return row;}}));}
function setup(){vi.stubGlobal('innerWidth',1280);vi.stubGlobal('innerHeight',800);const root=document.createElement('main');Object.defineProperty(root,'clientHeight',{value:640});document.body.append(root);view=new ColumnLog(root);return root;}
it('rotates full live pages, retains old history and keeps mounted rows bounded',()=>{
 const root=setup();view?.set(records(100000),true,0,false,3);expect(root.querySelectorAll('.log-column')).toHaveLength(3);expect(root.querySelector('[data-active=true]')).toBe(root.lastElementChild);expect(root.querySelectorAll('.row').length).toBeLessThan(200);
 view?.set(records(100025),true,0,false,3);expect(root.querySelector('[data-active=true]')).not.toBe(root.lastElementChild);
 expect(view?.reveal('200')).toBe(true);expect(root.querySelector('[data-virtual-key="200"]')).not.toBeNull();
});
it('freezes paused normal pages, re-deals on resume and drains reverse pages into last-column history',()=>{
 const root=setup();view?.set(records(1000),true,0,false,2);const text=root.textContent;view?.set(records(1100),false,0,false,2);expect(root.textContent).toBe(text);view?.set(records(1100),true,1,false,2);expect(root.textContent).toContain('1099');
 view?.set(records(1100).reverse(),true,2,true,2);expect(root.firstElementChild?.getAttribute('data-active')).toBe('true');expect(root.firstElementChild?.textContent).toContain('1099');expect(view?.reveal('100')).toBe(true);expect(root.querySelector('[data-virtual-key="100"]')).not.toBeNull();
});
