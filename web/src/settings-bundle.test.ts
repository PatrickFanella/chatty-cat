// @vitest-environment happy-dom
import {expect,it,vi} from 'vitest';
import {captureBundle,parseBundle,registerSettings,restoreBundle} from './settings-bundle';
import {defaultDisplay,parseDisplay} from './display';
it('accepts old display-only slots and validates versioned optional parts',()=>{
 expect(parseBundle({size:18},parseDisplay)?.display.size).toBe(18);expect(parseBundle({size:18},parseDisplay)?.extras).toEqual({});
 expect(parseBundle({version:1,display:{size:20},extras:{picker:{options:{zoom:2}},auth:{token:'private'}}},parseDisplay)?.extras).toEqual({picker:{options:{zoom:2}}});
 for(const value of [null,[],{version:2,display:{}},{version:1,display:null}])expect(parseBundle(value,parseDisplay)).toBeNull();expect(parseBundle({version:1,display:{},extras:{picker:{text:'x'.repeat(70000)}}},parseDisplay)?.extras).toEqual({});
});
it('captures detached panel state, restores only registered parts and removes listeners',()=>{
 const options={zoom:2,enabled:['BTTV']},restore=vi.fn();const stop=registerSettings('picker',()=>({options}),restore);const bundle=captureBundle(defaultDisplay());options.enabled.push('FFZ');expect(bundle.extras.picker).toEqual({options:{zoom:2,enabled:['BTTV']}});restoreBundle(bundle);expect(restore).toHaveBeenCalledWith(bundle.extras.picker);stop();restoreBundle(bundle);expect(restore).toHaveBeenCalledTimes(1);expect(captureBundle(defaultDisplay()).extras).toEqual({});
});
