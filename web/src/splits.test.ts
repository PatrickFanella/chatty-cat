import {expect,it} from 'vitest';
import {SplitLayout,parseSplits} from './splits';

it('validates bounded layouts and drops private or unknown fields',()=>{
 const model=new SplitLayout(['alice','bob']);model.enable();model.duplicatePane(model.activePane.id);
 const raw={...model.snapshot(),token:'secret'};const pane=raw.tabs[0]!.panes[0]!;
 expect(parseSplits(raw,['alice','bob'])?.tabs[0]?.panes[0]?.channels).toEqual(['alice','bob']);
 expect(JSON.stringify(parseSplits(raw,['alice','bob']))).not.toContain('secret');
 expect(parseSplits({...raw,tabs:Array(9).fill(raw.tabs[0])},['alice','bob'])).toBeNull();
 expect(parseSplits({...raw,tabs:[{...raw.tabs[0],panes:[{...pane,channels:['outsider']}]}]},['alice','bob'])).toBeNull();
 expect(parseSplits({...raw,tabs:[{...raw.tabs[0],panes:[{...pane,target:'outsider'}]}]},['alice','bob'])).toBeNull();
 expect(parseSplits({...raw,version:2},['alice','bob'])).toBeNull();
});
it('duplicates independently, reorders, closes and reopens without losing pane preferences',()=>{
 const model=new SplitLayout(['alice','bob']);model.enable();const first=model.activePane;
 model.configure(first.id,{channels:['alice'],target:'alice',filter:'cat',reverse:true,pauseHover:true});
 const second=model.duplicatePane(first.id);model.configure(second.id,{channels:['bob'],target:'bob',filter:'dog',reverse:false,pauseHover:false});
 expect(model.activeTab.panes[0]?.filter).toBe('cat');model.movePane(second.id,-1);expect(model.activeTab.panes[0]?.id).toBe(second.id);
 model.closePane(first.id);model.reopen();expect(model.activeTab.panes.at(-1)?.filter).toBe('cat');
 const tab=model.addTab('Other');expect(tab.panes).toHaveLength(1);model.closeTab(tab.id);model.reopen();expect(model.activeTab.name).toBe('Other');
 expect(()=>model.configure(model.activePane.id,{channels:['alice'],target:'bob',filter:'',reverse:false,pauseHover:false})).toThrow();
});
it('retains public reader anchors, rejects duplicate identities and caps total live panes',()=>{
 const model=new SplitLayout(['alice']);model.enable();model.activePane.reader={key:'alice:message',offset:12};
 const snapshot=model.snapshot();expect(parseSplits(snapshot,['alice'])?.tabs[0]?.panes[0]?.reader).toEqual({key:'alice:message',offset:12});
 snapshot.tabs[0]!.panes.push({...snapshot.tabs[0]!.panes[0]!});expect(parseSplits(snapshot,['alice'])).toBeNull();
 for(let t=0;t<4;t++){if(t)model.addTab('Tab '+t);for(let i=1;i<6;i++)model.duplicatePane(model.activePane.id);}
 expect(()=>model.addTab('Overflow')).toThrow(/24/);expect(model.snapshot().tabs.flatMap(tab=>tab.panes)).toHaveLength(24);
});
