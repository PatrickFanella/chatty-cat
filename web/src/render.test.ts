// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { messageRow } from './render';
import type { ChatMessage } from './protocol';
import type { ChannelMetadata } from './metadata';

const message: ChatMessage = { id: 'one', command: 'PRIVMSG', channel: 'room', login: 'alice', timestamp: 123, text: 'Base Overlay', tags: { badges: 'subscriber/1,vip/1' } };
const metadata: ChannelMetadata = { channel: 'room', errors: [], stream: { uptime: '', viewers: '', title: '' },
  badges: { subscriber: { '1': { url: 'https://cdn.example/badge', title: 'Subscriber', description: 'One month' } } },
  emotes: {
    Base: { code: 'Base', url: 'https://cdn.example/base', staticUrl: 'https://cdn.example/base-static', source: '7TV', animated: true, zeroWidth: false },
    Overlay: { code: 'Overlay', url: 'https://cdn.example/overlay', staticUrl: '', source: '7TV', animated: true, zeroWidth: true },
  },
};
describe('message rendering', () => {
  it('stacks zero-width emotes on the preceding emote and enlarges emote-only text', () => {
    const row = messageRow(message, metadata);
    expect(row.querySelectorAll('.emote-stack')).toHaveLength(1);
    expect(row.querySelectorAll('.emote-stack .emote')).toHaveLength(2);
    expect(row.querySelector('.emote.overlay')?.getAttribute('alt')).toBe('Overlay');
    expect(row.querySelector('.emote-only')).not.toBeNull();
  });
  it('renders known badges and preserves unknown badge fallbacks', () => {
    const row = messageRow(message, metadata);
    expect(row.querySelector('.badge')?.getAttribute('alt')).toBe('[Subscriber]');
    expect(row.querySelector('.badge-fallback')?.textContent).toBe('[vip]');
  });
  it('does not treat chat text or provider labels as markup', () => {
    const row = messageRow({ ...message, text: '<img src=x onerror=alert(1)>', tags: { 'display-name': '<script>bad</script>' } }, metadata);
    expect(row.querySelector('img')).toBeNull();
    expect(row.querySelector('script')).toBeNull();
    expect(row.textContent).toContain('<img src=x onerror=alert(1)>');
  });
  it('uses still images when frozen and falls back when an image fails', () => {
    const row = messageRow(message, metadata, true);
    const image = row.querySelector<HTMLImageElement>('.emote');
    expect(image?.src).toBe('https://cdn.example/base-static');
    image?.dispatchEvent(new Event('error'));
    expect(row.querySelector('.emote')?.getAttribute('alt')).toBe('Overlay');
    expect(row.textContent).toContain('Base');
  });
  it('renders actions without CTCP delimiters', () => {
    const row = messageRow({ ...message, text: '\x01ACTION waves\x01' });
    expect(row.classList.contains('action')).toBe(true);
    expect(row.querySelector('.message')?.textContent).toBe('waves');
  });
});
it('renders subscription system messages safely and avoids duplicated names', () => {
  const row = messageRow({ ...message, command: 'USERNOTICE', text: 'great stream', tags: { 'display-name': 'Alice', 'system-msg': 'Alice subscribed at Tier 1', 'msg-id': 'sub' } });
  expect(row.querySelector('.system-message')?.textContent).toBe('subscribed at Tier 1');
  expect(row.dataset.notice).toBe('sub'); expect(row.textContent).toContain('great stream');
});
it('renders first-message and bits chips with channel links', () => {
  const row = messageRow({ ...message, tags: { 'first-msg': '1', bits: '100' }, text: 'https://example.com?a=1&utm_source=test' });
  expect(row.querySelector('.message-chips')?.textContent).toBe('first100 bits');
  expect(row.querySelector<HTMLAnchorElement>('.name')?.href).toBe('https://www.twitch.tv/alice');
  expect(row.querySelector<HTMLAnchorElement>('.chat-link')?.href).toBe('https://example.com/?a=1');
});
it('renders reported subscriber months without claiming missing counts are zero',()=>{
 const row=messageRow({...message,command:'PRIVMSG',tags:{'badge-info':'subscriber/24'}});expect(row.querySelector('.sub-months')?.textContent).toContain('24');
 const unknown=messageRow({...message,command:'PRIVMSG',tags:{}});expect(unknown.querySelector('.sub-months')?.getAttribute('title')).toBe('No subscriber months reported');
});
it('renders timestamp and localized-name settings and reversible long-message expansion as plain text',async()=>{const {setPresentation,presentationDefaults}=await import('./presentation');setPresentation({...presentationDefaults,timestampFormat:'HH:mm:ss',usernameMode:'both',collapseLines:2});const row=messageRow({...message,text:'long public text '.repeat(30),tags:{'display-name':'艾丽丝'}},metadata);expect(row.querySelector('.name')?.textContent).toBe('alice (艾丽丝)');expect(row.querySelector('time')?.textContent).toMatch(/^\d\d:\d\d:\d\d$/);const button=row.querySelector<HTMLButtonElement>('.expand-message')!;expect(row.querySelector('.collapsed-message')).toBeTruthy();button.click();expect(row.querySelector('.collapsed-message')).toBeNull();expect(button.getAttribute('aria-expanded')).toBe('true');button.click();expect(row.querySelector('.collapsed-message')).toBeTruthy();setPresentation({...presentationDefaults});});
it('truncates only deleted presentation while retaining the complete source record',async()=>{const {decoratePresentation}=await import('./render');const {setPresentation,presentationDefaults}=await import('./presentation');setPresentation({...presentationDefaults,deletedLength:5});const original={...message,text:'😀'.repeat(20)},row=messageRow(original);decoratePresentation(row,original,true,true);expect(row.querySelector('.message-body')?.textContent).toBe('😀'.repeat(5)+'…');expect(original.text).toBe('😀'.repeat(20));expect(row.classList.contains('history-message')).toBe(true);setPresentation({...presentationDefaults});});
it('renders supplied membership notices without interpreting names as markup',()=>{const join=messageRow({...message,command:'JOIN',text:'',login:'alice'});expect(join.querySelector('.message-body')?.textContent).toBe('alice joined the channel');const part=messageRow({...message,command:'PART',text:'',login:'bob'});expect(part.querySelector('.message-body')?.textContent).toBe('bob left the channel');});
