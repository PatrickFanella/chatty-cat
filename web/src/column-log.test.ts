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
it('pauses only a hovered message column and ignores empty column space',()=>{
 const root=setup();view?.set(records(100),true,0,false,2,true);const columns=[...root.querySelectorAll<HTMLElement>('.log-column')];
 const row=columns[0]!.querySelector<HTMLElement>('.row')!;row.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));expect(view?.hoverPaused(columns[0]!)).toBe(true);expect(view?.hoverPaused(columns[1]!)).toBe(false);
 view?.set(records(110),true,0,false,2,true);expect(root.textContent).toContain('109');
 columns[0]!.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));expect(view?.hoverPaused(columns[0]!)).toBe(false);
 row.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));view?.set(records(110),true,0,false,2,false);expect(view?.hoverPaused(columns[0]!)).toBe(false);
});

it('holds manually scrolled columns, keeps other pages live and resumes the newest data',()=>{
 const root=setup();view!.set(records(100),true,0,false,3);const columns=[...root.querySelectorAll<HTMLElement>('.log-column')];
 for(const column of columns){Object.defineProperty(column,'scrollHeight',{value:1000});Object.defineProperty(column,'clientHeight',{value:640});column.scrollTop=0;}
 expect(view!.trackScroll(columns[2]!,true)).toBe(true);expect(view!.hasManualPause()).toBe(true);const held=columns[2]!.textContent;
 view!.set(records(125),true,0,false,3);expect(columns[2]!.textContent).toBe(held);expect(root.textContent).toContain('124');
 columns[0]!.scrollTop=0;columns[1]!.scrollTop=0;view!.trackScroll(columns[0]!,true);view!.trackScroll(columns[1]!,true);view!.set(records(125),true,0,false,3);const all=root.textContent;view!.set(records(150),true,0,false,3);expect(root.textContent).toBe(all);
 view!.resume();view!.set(records(150),true,0,false,3);expect(view!.hasManualPause()).toBe(false);expect(root.textContent).toContain('149');
});
it('releases one column on return to its live edge and preserves global navigation pauses',()=>{
 const root=setup();view!.set(records(100),true,0,false,2);const column=root.firstElementChild as HTMLElement;Object.defineProperty(column,'scrollHeight',{value:1000});Object.defineProperty(column,'clientHeight',{value:640});column.scrollTop=0;view!.trackScroll(column,true);expect(view!.hasManualPause()).toBe(true);
 expect(view!.trackScroll(column,false)).toBe(false);column.scrollTop=360;view!.trackScroll(column,true);expect(view!.hasManualPause()).toBe(false);
});
it('retains a held reverse page while another receives the newest rows',()=>{
 const root=setup();view!.set(records(100).reverse(),true,0,true,2);const column=root.firstElementChild as HTMLElement;Object.defineProperty(column,'scrollHeight',{value:1000});Object.defineProperty(column,'clientHeight',{value:640});column.scrollTop=200;view!.trackScroll(column,true);view!.set(records(100).reverse(),true,0,true,2);const held=column.textContent;
 view!.set(records(110).reverse(),true,0,true,2);expect(column.textContent).toBe(held);expect(root.lastElementChild?.textContent).toContain('109');view!.resume();view!.set(records(110).reverse(),true,0,true,2);expect(root.firstElementChild?.textContent).toContain('109');
});
it('retains a deliberate wheel hold made while a message is hovered',()=>{
 const root=setup();view!.set(records(100),true,0,false,2,true);const column=root.firstElementChild as HTMLElement,row=column.querySelector('.row')!;
 row.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));expect(view!.hoverPaused(column)).toBe(true);expect(view!.allFollowing()).toBe(true);
 const current=column.querySelector('.row')!;current.dispatchEvent(new WheelEvent('wheel',{bubbles:true}));expect(view!.hoverPaused(column)).toBe(false);expect(view!.hasManualPause()).toBe(true);
 const held=column.textContent;current.dispatchEvent(new PointerEvent('pointerout',{bubbles:true}));view!.set(records(120),true,0,false,2,true);expect(column.textContent).toBe(held);expect(root.textContent).toContain('119');
 view!.resume();view!.set(records(120),true,0,false,2,true);expect(view!.allFollowing()).toBe(true);
});

it('keeps rail modes 4–6 in one chat column on desktop and portrait screens',()=>{
 const root=setup();for(const mode of [4,5,6]){view!.set(records(100),true,0,false,mode);expect(root.querySelectorAll('.log-column')).toHaveLength(0);expect(root.textContent).toContain('99');}
 vi.stubGlobal('innerWidth',375);vi.stubGlobal('innerHeight',812);view!.set(records(100),true,0,false,4);expect(root.querySelectorAll('.log-column')).toHaveLength(0);
});
