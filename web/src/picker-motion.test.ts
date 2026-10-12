// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {capturePicker,animatePicker} from './picker-motion';
afterEach(()=>{vi.restoreAllMocks();delete document.documentElement.dataset.anim;});
it('matches repeated cells to their own positions and batches movement',()=>{
 const root=document.createElement('div');root.innerHTML='<button data-insert="Kappa"></button><button data-insert="Kappa"></button><span class="picker-age" data-age="60"></span>';
 const cells=[...root.children] as HTMLElement[];
 for(const [i,cell] of cells.entries())vi.spyOn(cell,'getBoundingClientRect').mockReturnValue({left:10*i,top:20} as DOMRect);
 const positions=capturePicker(root,0),animate=vi.fn().mockReturnValue({cancel:vi.fn()});
 for(const [i,cell] of cells.entries()){vi.spyOn(cell,'getBoundingClientRect').mockReturnValue({left:10*i+5,top:30} as DOMRect);cell.animate=animate;}
 expect(animatePicker(root,0,positions)).toHaveLength(3);expect(animate.mock.calls[0]?.[0][0].transform).toBe('translate(-5px,-10px)');
});
it('omits age rows and respects disabled motion',()=>{
 const root=document.createElement('div');root.innerHTML='<span class="picker-age" data-age="60"></span>';
 expect(capturePicker(root,1).size).toBe(0);document.documentElement.dataset.anim='0';expect(animatePicker(root,0,capturePicker(root,0))).toEqual([]);
});
