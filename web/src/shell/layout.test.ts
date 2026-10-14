import {describe,expect,it} from 'vitest';
import {dock,emptyLayout,float,moveWithin,parseLayout,placementOf,release,resizeZone,setClosed,setShares} from './layout';
const viewport={width:1280,height:800};
describe('workbench layout model',()=>{
 it('docks, reorders and releases panels without duplicating them',()=>{
  let layout=dock(emptyLayout(),'a','right');layout=dock(layout,'b','right');layout=dock(layout,'a','right');
  expect(layout.zones.right.panels).toEqual(['b','a']);
  layout=dock(layout,'a','left',0);expect(layout.zones.right.panels).toEqual(['b']);expect(layout.zones.left.panels).toEqual(['a']);
  layout=dock(layout,'c','left',0);layout=moveWithin(layout,'a',-1);expect(layout.zones.left.panels).toEqual(['a','c']);
  expect(moveWithin(layout,'a',-5).zones.left.panels).toEqual(['a','c']);
  layout=release(layout,'a');expect(placementOf(layout,'a')).toEqual({kind:'modal'});expect(layout.zones.left.shares).toEqual({c:1});
 });
 it('floats panels inside the viewport and clears their dock slot',()=>{
  let layout=dock(emptyLayout(),'a','bottom');layout=float(layout,'a',{left:2000,top:-50,width:100,height:50},viewport);
  expect(layout.zones.bottom.panels).toEqual([]);
  expect(placementOf(layout,'a')).toEqual({kind:'floating',box:{left:1032,top:8,width:240,height:160}});
 });
 it('keeps closed state only for managed panels',()=>{
  const layout=dock(emptyLayout(),'a','right');
  expect(setClosed(layout,'a',true).closed).toEqual(['a']);expect(setClosed(setClosed(layout,'a',true),'a',false).closed).toEqual([]);
  expect(setClosed(layout,'zzz',true).closed).toEqual([]);
  expect(release(setClosed(layout,'a',true),'a').closed).toEqual([]);
 });
 it('clamps zone sizes and shares',()=>{
  expect(resizeZone(emptyLayout(),'right',5,viewport).sizes.right).toBe(200);
  expect(resizeZone(emptyLayout(),'right',5000,viewport).sizes.right).toBe(768);
  expect(resizeZone(emptyLayout(),'bottom',5000,viewport).sizes.bottom).toBe(480);
  const layout=dock(dock(emptyLayout(),'a','left'),'b','left');
  expect(setShares(layout,'left',{a:99,b:Number.NaN,c:3}).zones.left.shares).toEqual({a:10,b:1});
 });
 it('parses persisted layouts defensively',()=>{
  expect(parseLayout(null,viewport)).toEqual(emptyLayout());
  expect(parseLayout({version:2},viewport)).toEqual(emptyLayout());
  const parsed=parseLayout({zones:{left:{panels:['a','a',3,'b'],shares:{a:'x',b:2}},right:{panels:['b','c']},bottom:'nope'},sizes:{left:10,right:'x'},floating:{c:{left:1,top:1,width:300,height:200},a:{left:0,top:0,width:1,height:1},d:{left:-5,top:-5,width:999999,height:50}},closed:['a','missing',4]},viewport);
  expect(parsed.zones.left.panels).toEqual(['a','b']);expect(parsed.zones.left.shares).toEqual({a:1,b:2});
  expect(parsed.zones.right.panels).toEqual(['c']);expect(parsed.zones.bottom.panels).toEqual([]);
  expect(parsed.sizes).toEqual({left:200,right:380,bottom:260});
  expect(Object.keys(parsed.floating)).toEqual([]);
  expect(parsed.closed).toEqual(['a']);
 });
});
