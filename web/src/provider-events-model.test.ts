import {expect,it} from 'vitest';
import {ProviderBadges,providerEventPlan,parseProviderCapabilities,refreshTargets} from './provider-events-model';
import {providerDefaults} from './provider-preferences';
import type {ChannelMetadata} from './metadata';
const room=(channel='room',id='42'):ChannelMetadata=>({channel,broadcasterID:id,sevenTV:{userID:'owner',channelSetID:'set',globalSetID:'global'},emotes:{},badges:{},errors:[],stream:{title:'',viewers:'',uptime:''}});
it('keeps optional connections off and bounds unique read subscriptions by selected metadata',()=>{
 const p=providerDefaults();expect(providerEventPlan([room()],p,['BTTV','7TV'])).toEqual({bttv:[],sevenTV:[]});
 p.cosmetics.BTTV=true;p.cosmetics['7TV']=true;expect(providerEventPlan([room()],p,['BTTV','7TV']).sevenTV).toHaveLength(0);
 p.sevenTVEventAPI=true;const plan=providerEventPlan([room(),room('other','43')],p,['BTTV','7TV']);expect(plan.bttv).toEqual(['42','43']);expect(plan.sevenTV).toHaveLength(9);
 expect(plan.sevenTV.some(s=>/presence|activity|identify/i.test(JSON.stringify(s)))).toBe(false);
 const many=providerEventPlan(Array.from({length:100},(_,i)=>({...room('room'+i,''+i),sevenTV:{userID:'user'+i,channelSetID:'set'+i,globalSetID:'global'}})),p,['7TV']);expect(many.sevenTV).toHaveLength(121);
});
it('parses only the fixed capability contract and scopes refresh hints to subscribed resources',()=>{
 expect(parseProviderCapabilities({providers:['7TV'],maxChannels:24,maxSockets:3,refreshSeconds:30})).toEqual(['7TV']);
 expect(parseProviderCapabilities({providers:['7TV','7TV'],maxChannels:24,maxSockets:3,refreshSeconds:30})).toBeNull();
 expect(parseProviderCapabilities({providers:['7TV'],maxChannels:240,maxSockets:3,refreshSeconds:30})).toBeNull();
 const p=providerDefaults();p.sevenTVEventAPI=true;
 expect(refreshTargets('7TV',{op:0,d:{type:'emote_set.update',body:{id:'global'}}},[room(),room('other')],p)).toEqual(['room','other']);
 expect(refreshTargets('7TV',{op:0,d:{type:'user.update',body:{id:'unknown'}}},[room()],p)).toEqual([]);
 p.providers['7TV'].live=false;expect(refreshTargets('7TV',{op:0,d:{type:'emote_set.update',body:{id:'set'}}},[room()],p)).toEqual([]);
});
const definition=(id='badge')=>({op:0,d:{type:'cosmetic.create',body:{object:{kind:'BADGE',data:{id,tooltip:'Supporter',host:{url:'//cdn.7tv.app/badge/'+id,files:[{name:'2x.webp'}]}}}}}});
const entitlement=(type='entitlement.create',ref='badge',id='42')=>({op:0,d:{type,body:{object:{kind:'BADGE',ref_id:ref,user:{connections:[{platform:'TWITCH',id}]}}}}});
it('joins out-of-order 7TV definitions and assignments, deletes exact refs and excludes unsafe images',()=>{
 const badges=new ProviderBadges();badges.accept('7TV',entitlement(),1);expect(badges.forUser('7TV','42',2)).toEqual([]);badges.accept('7TV',definition(),2);expect(badges.forUser('7TV','42',3)).toEqual([{provider:'7TV',url:'https://cdn.7tv.app/badge/badge/2x.webp',title:'Supporter'}]);
 badges.accept('7TV',entitlement('entitlement.delete','other'),3);expect(badges.forUser('7TV','42',4)).toHaveLength(1);badges.accept('7TV',entitlement('entitlement.delete'),4);expect(badges.forUser('7TV','42',5)).toEqual([]);
 const bad=definition();bad.d.body.object.data.host.url='https://evil.test/badge/badge';badges.accept('7TV',bad,5);badges.accept('7TV',entitlement(),6);expect(badges.forUser('7TV','42',7)).toHaveLength(1); // Invalid updates retain the last good definition.
 expect(badges.forUser('7TV','42',900007)).toEqual([]);
});
it('bounds provider badge definitions, user assignments and individual refs, and accepts only BTTV CDN badges',()=>{
 const badges=new ProviderBadges();for(let i=0;i<300;i++){badges.accept('7TV',definition('b'+i),i);badges.accept('7TV',entitlement('entitlement.create','b'+i,''+i),i);}
 expect(badges.sizes()).toEqual({definitions:128,users:256});
 badges.accept('BTTV',{name:'lookup_user',data:{providerId:'42',badge:{url:'https://cdn.betterttv.net/badges/pro.svg'}}},400);expect(badges.forUser('BTTV','42',401)).toHaveLength(1);
 badges.accept('BTTV',{name:'lookup_user',data:{providerId:'42',badge:{url:'https://cdn.betterttv.net.evil.test/a'}}},402);expect(badges.forUser('BTTV','42',403)[0]?.url).toContain('/badges/pro.svg');
 badges.accept('BTTV',{name:'lookup_user',data:{providerId:'42',badge:null}},404);expect(badges.forUser('BTTV','42',405)).toEqual([]);badges.clear();expect(badges.sizes()).toEqual({definitions:0,users:0});
});
