import { describe, expect, it } from 'vitest';
import { nativeEmoteTag, tokenize, stackCheerTokens, type Emote } from './tokens';

const emote: Emote = { code: 'Wave', url: 'https://cdn.example/wave', staticUrl: 'https://cdn.example/still', source: '7TV', animated: true, zeroWidth: false };
describe('emote tokenization', () => {
  it('uses code points after astral Unicode', () => {
    const tokens = tokenize('😀 Kappa hello', '25:2-6', {});
    expect(tokens[0]).toEqual({ type: 'text', text: '😀 ' });
    expect(tokens[1]?.type === 'emote' && tokens[1].emote.code).toBe('Kappa');
    expect(tokens[2]).toEqual({ type: 'text', text: ' hello' });
  });
  it('native tags override matching provider names', () => {
    const token = tokenize('Wave', '25:0-3', { Wave: emote })[0];
    expect(token?.type === 'emote' && token.emote.source).toBe('Twitch');
  });
  it('preserves unknown text and only matches whole tokens', () => {
    expect(tokenize('Wave! hi Wave', '', { Wave: emote })).toEqual([{ type: 'text', text: 'Wave! hi ' }, { type: 'emote', emote }]);
  });
  it('ignores malformed and overlapping native ranges', () => {
    const tokens = tokenize('Kappa test', '25:0-4,2-5,99-101,-1-4/unsafe"id:0-4', {});
    expect(tokens.filter((token) => token.type === 'emote')).toHaveLength(1);
    expect(tokens.at(-1)).toEqual({ type: 'text', text: ' test' });
  });
  it('retains zero-width flags and uses light native assets', () => {
    const tokens = tokenize('Kappa Wave', '25:0-4', { Wave: { ...emote, zeroWidth: true } }, true);
    expect(tokens[0]?.type === 'emote' && tokens[0].emote.url).toContain('/light/');
    expect(tokens[2]?.type === 'emote' && tokens[2].emote.zeroWidth).toBe(true);
  });
  it('does not resolve object prototype keys as emotes', () => expect(tokenize('constructor toString', '', {})).toEqual([{ type: 'text', text: 'constructor toString' }]));
});

it('indexes native action emotes after the CTCP prefix', () => {
  const tokens = tokenize('\x01ACTION 😀 Kappa Wave\x01', '25:2-6', { Wave: { code: 'Wave', url: 'https://example.com/e', staticUrl: '', source: '7TV', animated: false, zeroWidth: false } });
  expect(tokens[0]).toEqual({ type: 'text', text: '😀 ' });
  expect(tokens[1]).toMatchObject({ type: 'emote', emote: { code: 'Kappa' } });
  expect(tokens.at(-1)).toMatchObject({ type: 'emote', emote: { code: 'Wave' } });
});

it('synthesizes usable native emotes for Unicode and action echoes',()=>{
 const native:Emote={...emote,code:'Kappa',source:'Twitch',url:'https://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/2.0'};
 expect(nativeEmoteTag('😀 Kappa Kappa!', [native,emote])).toBe('25:2-6');
 expect(nativeEmoteTag('\x01ACTION 😀 Kappa Kappa\x01',[native])).toBe('25:2-6,8-12');
 expect(nativeEmoteTag('Kappa',[{...native,source:'7TV'}])).toBe('');
});
it('renders allowlisted cheer tiers only when Twitch reports bits and preserves emote precedence',()=>{
 expect(tokenize('Cheer100', '', {})[0]).toEqual({type:'text',text:'Cheer100'});
 const tokens=tokenize('Cheer99 Kappa1000 unknown100 Cheer0','',{},true,true);expect(tokens[0]).toMatchObject({type:'emote',emote:{source:'Cheer',url:expect.stringContaining('/cheer/light/animated/1/2.gif')}});expect(tokens[2]).toMatchObject({type:'emote',emote:{url:expect.stringContaining('/kappa/light/animated/1000/2.gif')}});expect(tokens.at(-1)).toEqual({type:'text',text:' unknown100 Cheer0'});
});
it('stacks recognized cheers only when their sum matches the supplied Twitch bits total',()=>{const tokens=tokenize('Cheer100 hello Kappa50','',{},false,true),stacked=stackCheerTokens(tokens,150);expect(stacked.filter(t=>t.type==='emote')).toHaveLength(1);expect(stacked.find(t=>t.type==='emote')).toMatchObject({emote:{code:'Cheer150',url:expect.stringContaining('/animated/100/')}});expect(tokens.filter(t=>t.type==='emote')).toHaveLength(2);expect(stackCheerTokens(tokens,151)).toBe(tokens);expect(stackCheerTokens(tokens,0)).toBe(tokens);expect(stackCheerTokens(tokens,Number.MAX_SAFE_INTEGER+1)).toBe(tokens);expect(stackCheerTokens(tokenize('custom50 Cheer100','',{},false,true),150)).toHaveLength(2);});
it('uses the explicit static CDN format for tagged native emote fallbacks',()=>{const token=tokenize('Kappa','25:0-4',{},true)[0];expect(token?.type==='emote'&&token.emote.staticUrl).toContain('/static/light/2.0');});
