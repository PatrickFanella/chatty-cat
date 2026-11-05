// @vitest-environment happy-dom
import { presentationDefaults, setPresentation } from './presentation';
import { linkDefaults, setLinkPreferences } from './link-preferences';
import { afterEach, expect, it, vi } from 'vitest';
import { IdentityCards, emotePage, parseProfile } from './identity-cards';
import type { ChatMessage } from './protocol';
import { providerDefaults, setProviderPreferences } from './provider-preferences';
let cards: IdentityCards | undefined;
afterEach(() => {
  cards?.stop();
  setPresentation({ ...presentationDefaults });
  setProviderPreferences(providerDefaults());
  setLinkPreferences(linkDefaults);
  localStorage.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('validates public profile fields and provider destinations', () => {
  const value = {
    login: 'alice',
    name: 'Alice',
    bio: 'hello',
    image: 'https://example.com/avatar',
    color: '#123456',
    created: '2020-01-01',
    followers: 42,
    partner: true,
    affiliate: false,
  };
  expect(parseProfile(value, 'alice')).toEqual(value);
  for (const bad of [
    { ...value, login: 'other' },
    { ...value, image: 'javascript:evil' },
    { ...value, followers: -1 },
    { ...value, color: 'red' },
  ])
    expect(() => parseProfile(bad, 'alice')).toThrow();
  expect(emotePage('7TV', 'https://cdn.7tv.app/emote/abc/2x.webp')).toBe('https://7tv.app/emotes/abc');
  expect(emotePage('BTTV', 'https://cdn.betterttv.net/emote/abc/2x')).toBe('https://betterttv.com/emotes/abc');
});
it('opens safe profile and emote cards and drops late profile results', async () => {
  setLinkPreferences({ ...linkDefaults, emoteTooltip: true });
  vi.useFakeTimers();
  setPresentation({ ...presentationDefaults, usercardHover: true });
  const surface = document.createElement('main');
  surface.innerHTML =
    '<article class="row" data-login="alice"><a class="name">Alice</a><img class="emote" data-emote-source="7TV" data-emote-code="wave" alt="wave" src="https://cdn.7tv.app/emote/abc/2x.webp"></article>';
  const root = document.createElement('section');
  root.hidden = true;
  document.body.append(surface, root);
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      login: 'alice',
      name: 'Alice',
      bio: '<script>safe</script>',
      image: '',
      color: '#123456',
      created: '',
      followers: 42,
      partner: false,
      affiliate: false,
    }),
  });
  vi.stubGlobal('fetch', fetcher);
  cards = new IdentityCards(
    surface,
    root,
    () => [],
    async () => 'they/them',
  );
  surface.querySelector('a')?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(350);
  expect(root.hidden).toBe(false);
  expect(root.textContent).toContain('they/them');
  expect(root.textContent).toContain('<script>safe</script>');
  expect(root.querySelector('script')).toBeNull();
  surface.querySelector('img')?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(350);
  expect(root.querySelector<HTMLAnchorElement>('a')?.href).toBe('https://7tv.app/emotes/abc');
  expect(fetcher).toHaveBeenCalledOnce();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(root.hidden).toBe(true);
});
it('links both current and legacy FFZ CDN paths to the provider page', () => {
  expect(emotePage('FFZ', 'https://cdn.frankerfacez.com/emote/660211/2')).toBe(
    'https://www.frankerfacez.com/emoticon/660211',
  );
  expect(emotePage('FFZ', 'https://cdn.frankerfacez.com/emoticon/123/2')).toBe(
    'https://www.frankerfacez.com/emoticon/123',
  );
});
it('applies the explicit emote tooltip scale within the consented image width', async () => {
  vi.useFakeTimers();
  setPresentation({ ...presentationDefaults, usercardHover: true });
  setLinkPreferences({ ...linkDefaults, emoteTooltip: true, thumbnailSize: 120 });
  setProviderPreferences({ ...providerDefaults(), tooltipScale: 2 });
  const surface = document.createElement('main');
  surface.innerHTML = '<img class="emote" data-emote-source="7TV" src="https://cdn.7tv.app/emote/abc/2x.webp">';
  const root = document.createElement('section');
  document.body.append(surface, root);
  cards = new IdentityCards(
    surface,
    root,
    () => [],
    async () => undefined,
  );
  surface.querySelector('img')!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(350);
  const image = root.querySelector<HTMLImageElement>('img')!;
  expect(image.style.height).toBe('192px');
  expect(image.style.maxWidth).toBe('120px');
});
it('refuses a private note when the public profile identity conflicts with a retained author ID', async () => {
  vi.useFakeTimers();
  setPresentation({ ...presentationDefaults, usercardHover: true });
  const surface = document.createElement('main');
  surface.innerHTML =
    '<article class="row" data-id="m" data-login="alice" data-channel="one"><a class="name">Alice</a></article>';
  const root = document.createElement('section');
  document.body.append(surface, root);
  const note = vi.fn(() => document.createElement('fieldset'));
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: '100',
            login: 'alice',
            name: 'Alice',
            bio: 'public',
            image: '',
            color: '',
            created: '',
            followers: null,
            partner: false,
            affiliate: false,
          }),
        ),
    ),
  );
  cards = new IdentityCards(
    surface,
    root,
    () => [
      {
        id: 'm',
        channel: 'one',
        command: 'PRIVMSG',
        login: 'alice',
        text: 'public',
        timestamp: 1,
        tags: { 'user-id': '101' },
      },
    ],
    async () => undefined,
    note,
  );
  cards.setAccount('42');
  surface.querySelector('a')!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(350);
  expect(note).not.toHaveBeenCalled();
  expect(root.textContent).toContain('stable user identity missing or changed');
  cards.setAccount('43');
  expect(root.hidden).toBe(true);
  expect(root.childElementCount).toBe(0);
});

it('does not fetch or open a usercard on hover by default', async () => {
  vi.useFakeTimers();
  setPresentation({ ...presentationDefaults });
  const surface = document.createElement('main');
  surface.innerHTML = '<article class="row" data-login="alice"><a class="name">Alice</a></article>';
  const root = document.createElement('section');
  root.hidden = true;
  document.body.append(surface, root);
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  cards = new IdentityCards(
    surface,
    root,
    () => [],
    async () => undefined,
  );
  surface.querySelector('a')!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(1000);
  expect(root.hidden).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});

const retained = (id: string, timestamp: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  timestamp,
  channel: 'one',
  command: 'PRIVMSG',
  login: 'alice',
  text: 'message ' + id,
  tags: {},
  ...extra,
});
async function hoverHistory(messages: ChatMessage[], hideModerated = false) {
  vi.useFakeTimers();
  setPresentation({ ...presentationDefaults, usercardHover: true, hideModerated });
  const surface = document.createElement('main');
  surface.innerHTML =
    '<article class="row" data-login="alice" data-channel="one"><a class="name" tabindex="0">Alice</a><a class="mention" data-mention="alice">@Alice</a></article>';
  const root = document.createElement('section');
  root.id = 'identity-preview';
  root.hidden = true;
  document.body.append(surface, root);
  const fetcher = vi.fn().mockRejectedValue(new Error('Profile unavailable'));
  vi.stubGlobal('fetch', fetcher);
  cards = new IdentityCards(
    surface,
    root,
    () => messages,
    async () => undefined,
  );
  surface.querySelector('a')!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(presentationDefaults.tooltipDelay);
  return { surface, root, fetcher };
}
it('shows the latest 50 public messages from the hovered channel before profile details, newest first', async () => {
  const messages = Array.from({ length: 65 }, (_, i) => retained(String(i), 1000 + i));
  messages.push(
    retained('other-channel', 2000, { channel: 'two' }),
    retained('other-user', 2001, { login: 'bob' }),
    retained('private', 2002, { command: 'WHISPER', text: 'private text' }),
    retained('markup', 2003, { login: 'ALICE', text: '<script>inert text</script>' }),
  );
  const { root, fetcher } = await hoverHistory(messages);
  const rows = [...root.querySelectorAll('.identity-history li')];
  expect(rows).toHaveLength(50);
  expect(rows[0]!.querySelector('span')?.textContent).toBe('<script>inert text</script>');
  expect(rows[1]!.querySelector('span')?.textContent).toBe('message 64');
  expect(rows[49]!.querySelector('span')?.textContent).toBe('message 16');
  expect(rows[0]!.querySelector('time')?.dateTime).toBe(new Date(2003).toISOString());
  expect(root.querySelector('script')).toBeNull();
  expect(root.textContent).not.toMatch(/other-channel|other-user|private text/);
  expect(root.querySelector('[role="region"]')?.getAttribute('aria-label')).toContain('in #one');
  expect(root.textContent).toContain('Profile details unavailable');
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/users/alice', expect.anything());
});
it.each([false, true])('respects message deletions and the hide-moderated setting (%s)', async (hideModerated) => {
  const { root } = await hoverHistory(
    [
      retained('cleared', 1),
      retained('clear', 2, { command: 'CLEARCHAT', text: 'alice' }),
      retained('deleted', 3),
      retained('remove', 4, { command: 'CLEARMSG', tags: { 'target-msg-id': 'deleted' } }),
      retained('tagged', 5, { tags: { deleted: 'true' } }),
      retained('latest', 6),
    ],
    hideModerated,
  );
  const rows = [...root.querySelectorAll('.identity-history li > span')];
  expect(rows.map((row) => row.textContent)).toEqual(
    hideModerated
      ? ['message latest']
      : ['message latest', '[removed message]', '[removed message]', '[removed message]'],
  );
});
it('keeps the history open while moving into it or scrolling with keyboard focus, then closes after departure', async () => {
  const { surface, root } = await hoverHistory([retained('one', 1)]);
  const history = root.querySelector<HTMLElement>('.identity-history')!;
  surface.querySelector('a')!.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: history }));
  root.dispatchEvent(new PointerEvent('pointerenter'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(root.hidden).toBe(false);
  history.focus();
  root.dispatchEvent(new PointerEvent('pointerleave'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(root.hidden).toBe(false);
  const outside = document.createElement('button');
  document.body.append(outside);
  outside.focus();
  await vi.advanceTimersByTimeAsync(499);
  expect(root.hidden).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(root.hidden).toBe(true);
  expect(root.childElementCount).toBe(0);
});
it('shows an empty state for a mentioned user and clears the history in privacy mode', async () => {
  const { root, surface } = await hoverHistory([retained('other', 1, { channel: 'two' })]);
  surface.querySelector('.mention')!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(presentationDefaults.tooltipDelay);
  expect(root.querySelector('.identity-history')?.textContent).toContain('No messages retained');
  expect(root.querySelectorAll('.identity-history li')).toHaveLength(0);
  document.dispatchEvent(new Event('privacychange'));
  expect(root.hidden).toBe(true);
  expect(root.childElementCount).toBe(0);
});
