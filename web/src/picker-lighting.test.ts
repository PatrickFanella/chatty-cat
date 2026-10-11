// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {PickerLighting} from './picker-lighting';
let lighting:PickerLighting|undefined;
afterEach(()=>{lighting?.stop();document.body.replaceChildren();vi.useRealTimers();});
it('holds a use wash until the last visible row leaves and expires the transient flash',async()=>{
 vi.useFakeTimers();const log=document.createElement('main'),picker=document.createElement('section');log.innerHTML='<article class="row"><span class="message"><img class="emote" data-emote-code="wave"></span></article>';picker.innerHTML='<button data-insert="wave"></button>';document.body.append(log,picker);
 const rect=(top:number,bottom:number)=>({top,bottom}) as DOMRect;log.getBoundingClientRect=()=>rect(100,500);const row=log.querySelector<HTMLElement>('.row')!;row.getBoundingClientRect=()=>rect(200,220);
 lighting=new PickerLighting(log,picker);lighting.use(['wave']);await vi.advanceTimersByTimeAsync(20);const cell=picker.querySelector('button')!;expect(cell.classList.contains('picker-lit')).toBe(true);expect(cell.classList.contains('picker-flash')).toBe(true);
 await vi.advanceTimersByTimeAsync(3700);expect(cell.classList.contains('picker-flash')).toBe(false);expect(cell.classList.contains('picker-lit')).toBe(true);
 row.getBoundingClientRect=()=>rect(50,80);log.dispatchEvent(new Event('virtualpaint'));await vi.advanceTimersByTimeAsync(20);expect(cell.classList.contains('picker-lit')).toBe(false);
});
