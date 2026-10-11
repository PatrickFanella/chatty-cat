// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {parsePronouns,Pronouns} from './pronouns';
let pronouns:Pronouns|undefined;
afterEach(()=>{pronouns?.stop();localStorage.clear();vi.unstubAllGlobals();});
it('validates pronoun identifiers and distinguishes unset from unavailable',()=>{
 expect(parsePronouns([{pronoun_id:'theythem'}])).toBe('they/them');expect(parsePronouns([])).toBe('');for(const value of [null,{},[{},{}],[{pronoun_id:'<script>'}]])expect(()=>parsePronouns(value)).toThrow();
});
it('coalesces lookups and restores bounded cached public labels',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify([{pronoun_id:'hehim'}]),{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetcher);pronouns=new Pronouns();
 const a=pronouns.get('Alice'),b=pronouns.get('alice');expect(a).toBe(b);expect(await a).toBe('he/him');expect(await pronouns.get('alice')).toBe('he/him');expect(fetcher).toHaveBeenCalledOnce();pronouns.stop();pronouns=new Pronouns();expect(await pronouns.get('alice')).toBe('he/him');expect(fetcher).toHaveBeenCalledOnce();
 expect(fetcher.mock.calls[0]?.[1]).toMatchObject({credentials:'omit',referrerPolicy:'no-referrer'});
});
it('does not turn transient failure into a cached unset pronoun',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response('unavailable',{status:503}));vi.stubGlobal('fetch',fetcher);pronouns=new Pronouns();expect(await pronouns.get('alice')).toBeUndefined();expect(await pronouns.get('alice')).toBeUndefined();expect(fetcher).toHaveBeenCalledOnce();expect(localStorage.getItem('chatthing:v1:pronouns')).toBeNull();expect(await pronouns.get('bad/name')).toBeUndefined();
});
