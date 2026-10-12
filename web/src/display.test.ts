// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { defaultDisplay, displayFromURL, messageVisibility, parseDisplay, wordsPattern } from './display';
import { PRESETS } from './display-data';
import type { ChatMessage } from './protocol';
const message: ChatMessage = { id: 'one', command: 'PRIVMSG', channel: 'one', login: 'alice', text: 'hello bob, special [a] words', timestamp: 1, tags: {} };
it('validates font, metrics, enumerations and text limits', () => {
  const options = parseDisplay({ font: 'url(evil)', size: 100000, keywords: 'x'.repeat(2000), hideMode: 'bad', shade: -1 });
  expect(options.font).toBe('sans'); expect(options.size).toBe(14); expect(options.keywords).toHaveLength(1000); expect(options.hideMode).toBe('stub'); expect(options.shade).toBe(7);
});
it('applies preset aliases before URL overrides and legacy palette names', () => {
  const options = displayFromURL(defaultDisplay(), new URLSearchParams('theme=default&size=18&shade=1&times=12h'));
  expect(options.colour).toBe('gray'); expect(options.size).toBe(18); expect(options.font).toBe('roobert'); expect(options.shade).toBe(1); expect(options.times).toBe(3);
  expect(displayFromURL(defaultDisplay(), new URLSearchParams('style=console')).variant).toBe('phosphor'); expect(Object.keys(PRESETS)).toHaveLength(18);
});
it('filters literal whole words, highlights own mentions and preserves moderation notices', () => {
  const options = parseDisplay({ keywords: 'special', blocked: 'hello', hidden: 'ALICE,badbot', hideMode: 'ghost' });
  expect(messageVisibility(message, options, 'bob')).toEqual({ highlight: true, blocked: true, hiddenUser: true });
  expect(messageVisibility({ ...message, command: 'CLEARCHAT' }, options, 'bob')).toEqual({ highlight: false, blocked: false, hiddenUser: false });
  expect(messageVisibility({ ...message, login: 'bob' }, options, 'bob').highlight).toBe(false);
  expect(wordsPattern('a.b')?.test('axb')).toBe(false); expect(wordsPattern('a.b')?.test('a.b')).toBe(true); expect(wordsPattern('hello')?.test('helloworld')).toBe(false);
});
it('applies original attention, shadow and emote-size URL controls',()=>{
 const options=displayFromURL(defaultDisplay(),new URLSearchParams('self=0&ping=1&notify=1&nbots=1&shadow=5&eonly=off'));
 expect(options).toMatchObject({self:false,ping:true,notify:true,nbots:true,shadow:5,eonly:2});
 expect(messageVisibility({...message,text:'bob'},options,'bob').highlight).toBe(false);
 expect(messageVisibility({...message,login:'fossabot'},options).hiddenUser).toBe(true);
 expect(displayFromURL(defaultDisplay(),new URLSearchParams('theme=cinema')).eonly).toBe(1);
});
it('restores documented filter aliases and shade/motion/chip controls',()=>{
 const o=displayFromURL(defaultDisplay(),new URLSearchParams('kw=hello&bw=spam&hw=alice&hwm=ghost&shade=auto&zebra&sub=hidden&anim=1&rbw=3&clean=1&cmodes=0'));
 expect(o).toMatchObject({keywords:'hello',blocked:'spam',hidden:'alice',hideMode:'ghost',autoShade:true,zebra:2,sub:'hidden',anim:1,rbw:3,clean:true,cmodes:false});
 expect(displayFromURL(o,new URLSearchParams('shade=2&keywords=explicit&kw=alias')).autoShade).toBe(false);
 expect(displayFromURL(o,new URLSearchParams('keywords=explicit&kw=alias')).keywords).toBe('explicit');
});
it('parses reverse flow and top-docked input flags',()=>{expect(displayFromURL(defaultDisplay(),new URLSearchParams('rev&bartop=1'))).toMatchObject({rev:true,bartop:true});expect(displayFromURL(defaultDisplay(),new URLSearchParams('rev=0&bartop=0'))).toMatchObject({rev:false,bartop:false});});
it('maps preset subscriber chips and header/help sizing',()=>{
 expect(displayFromURL(defaultDisplay(),new URLSearchParams('theme=cinema')).sub).toBe('left');expect(displayFromURL(defaultDisplay(),new URLSearchParams('theme=nightshade'))).toMatchObject({sub:'num-left',hfs:13,hpfs:-2});
 expect(displayFromURL(defaultDisplay(),new URLSearchParams('min=graph&hfs=auto&hpfs=-3&lw=700'))).toMatchObject({min:2,hfs:0,hpfs:-3,lw:700});
});

it('restores preview modes and media flags from shared URLs with validated bounds',()=>{const value=displayFromURL(defaultDisplay(),new URLSearchParams('peek=3&yt=0&lkico=0'));expect(value.peek).toBe(3);expect(value.yt).toBe(false);expect(value.lkico).toBe(false);expect(parseDisplay({peek:4,yt:'yes'}).peek).toBe(2);});

it('restores composer autohide including bare bauto flag',()=>{expect(displayFromURL(defaultDisplay(),new URLSearchParams('bauto')).bauto).toBe(1);expect(displayFromURL(defaultDisplay(),new URLSearchParams('bauto=2')).bauto).toBe(2);expect(parseDisplay({bauto:9}).bauto).toBe(0);});
it('maps the original minimal preset header follow sentinel to automatic size',()=>{
 const saved=defaultDisplay();saved.hfs=18;const minimal=displayFromURL(saved,new URLSearchParams('theme=minimal'));expect(minimal.hfs).toBe(0);expect(displayFromURL(saved,new URLSearchParams('theme=minimal&hfs=13')).hfs).toBe(13);
});

it('preserves preset labels and link weights with explicit URL overrides',()=>{
 expect(displayFromURL(defaultDisplay(),new URLSearchParams('theme=old-default'))).toMatchObject({lbls:false,lw:400});
 expect(displayFromURL(defaultDisplay(),new URLSearchParams('theme=nightshade'))).toMatchObject({lbls:false,size:18,split:4});
 expect(displayFromURL(defaultDisplay(),new URLSearchParams('theme=nightshade&lbls=1&lw=700'))).toMatchObject({lbls:true,lw:700});
});
