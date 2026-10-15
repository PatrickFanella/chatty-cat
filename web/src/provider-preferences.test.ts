// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import {
  providerDefaults,
  parseProviderPreferences,
  selectProviderMetadata,
  ProviderPreferenceStore,
  badgeCategory,
  setProviderPreferences,
  getProviderPreferences,
  ProviderPanel,
  reconcileProviderMetadata,
} from './provider-preferences';
import { setProfileScope } from './account-profiles';
import type { ChannelMetadata, EmoteSet } from './metadata';
import { messageRow, messageText } from './render';
import type { ChatMessage } from './protocol';
afterEach(() => {
  setProfileScope('anonymous');
  localStorage.clear();
  setProviderPreferences(providerDefaults());
});
const wave = (source: string, scope: 'global' | 'channel'): EmoteSet => ({
  provider: source === '7TV' ? '7TV' : 'FFZ',
  scope,
  emotes: {
    Wave: {
      code: 'Wave',
      source,
      url: 'https://cdn.test/' + source + scope,
      staticUrl: 'https://cdn.test/static',
      animated: true,
      zeroWidth: false,
    },
  },
});
const data: ChannelMetadata = {
  channel: 'room',
  emotes: {},
  emoteSets: [wave('7TV', 'global'), wave('FFZ', 'channel')],
  badges: {},
  errors: [],
  stream: { title: '', uptime: '', viewers: '' },
};
it('adds disabled event/cosmetic defaults to older profiles and rejects malformed opt-ins', () => {
  const p = providerDefaults();
  const { sevenTVEventAPI: _omit, activity: _activity, ...old } = p;
  const legacy = { ...old, cosmetics: { FFZ: false, Chatterino: false } };
  expect(parseProviderPreferences(legacy)).toEqual(p);
  expect(() => parseProviderPreferences({ ...p, sevenTVEventAPI: 'yes' })).toThrow();
  expect(() => parseProviderPreferences({ ...p, cosmetics: { ...p.cosmetics, BTTV: 1 } })).toThrow();
});
it('disabling a winning channel source restores the global source without duplicates', () => {
  const p = providerDefaults();
  expect(selectProviderMetadata(data, p).emotes.Wave?.source).toBe('FFZ');
  p.providers.FFZ.channel = false;
  expect(selectProviderMetadata(data, p).emotes.Wave?.source).toBe('7TV');
  p.providers['7TV'].global = false;
  expect(selectProviderMetadata(data, p).emotes).toEqual({});
});
it('static rendering and badge filters preserve tagged native identity and overlay layout', () => {
  const p = providerDefaults();
  p.animated = false;
  p.badges.channelAuthority = false;
  setProviderPreferences(p);
  const message: ChatMessage = {
    channel: 'room',
    command: 'PRIVMSG',
    login: 'alice',
    id: 'x',
    text: 'Kappa',
    timestamp: 1,
    tags: { emotes: '25:0-4', badges: 'moderator/1,subscriber/1' },
  };
  const row = messageRow(message, data);
  expect(row.querySelector('.emote')?.getAttribute('src')).toContain('/static/');
  expect(row.querySelector('.badges')?.textContent).toBe('[subscriber]');
  expect(message.tags.badges).toBe('moderator/1,subscriber/1');
});
it('validates bounds and rejects unknown provider controls instead of enabling services', () => {
  const p = providerDefaults();
  expect(() => parseProviderPreferences({ ...p, scale: 5 })).toThrow();
  expect(() =>
    parseProviderPreferences({
      ...p,
      providers: { ...p.providers, FFZ: { global: 'yes', channel: true, live: true } },
    }),
  ).toThrow();
  expect(parseProviderPreferences({ ...p, oauthToken: 'secret' })).toEqual(p);
  expect(getProviderPreferences().animated).toBe(true);
});
it('prevents stale-tab saves and account crossover, retaining corrupt local data', () => {
  const store = new ProviderPreferenceStore();
  store.read();
  localStorage.setItem('chatthing:v1:provider-preferences', 'broken');
  expect(() => store.save(providerDefaults())).toThrow();
  expect(localStorage.getItem('chatthing:v1:provider-preferences')).toBe('broken');
  setProfileScope('42');
  expect(() => store.read()).toThrow();
});
it('maps Twitch categories conservatively with unknown badges under vanity', () => {
  expect(badgeCategory('staff')).toBe('globalAuthority');
  expect(badgeCategory('vip')).toBe('channelAuthority');
  expect(badgeCategory('predictions')).toBe('predictions');
  expect(badgeCategory('subscriber')).toBe('subscription');
  expect(badgeCategory('future')).toBe('vanity');
});

it('live refresh replaces removed names while a paused provider waits for explicit reload', () => {
  const p = providerDefaults(),
    next = { ...data, emoteSets: [{ ...wave('FFZ', 'channel'), emotes: {} }] };
  p.providers.FFZ.live = false;
  expect(selectProviderMetadata(reconcileProviderMetadata(next, data, p), p).emotes.Wave).toBeDefined();
  expect(selectProviderMetadata(reconcileProviderMetadata(next, data, p, true), p).emotes.Wave).toBeUndefined();
  p.providers.FFZ.live = true;
  expect(selectProviderMetadata(reconcileProviderMetadata(next, data, p), p).emotes.Wave).toBeUndefined();
});
it('requires review, invalidates edits, and persists only after apply', () => {
  document.body.innerHTML = '<button id="commands-open">Commands</button>';
  const changed = () => {},
    panel = new ProviderPanel(changed, () => true);
  try {
    const checkbox = panel.root.querySelector<HTMLInputElement>('[name="FFZ.channel"]')!;
    checkbox.checked = false;
    const button = (text: string) => [...panel.root.querySelectorAll('button')].find((b) => b.textContent === text)!;
    expect(button('Apply provider preferences').disabled).toBe(true);
    button('Review provider preferences').click();
    expect(button('Apply provider preferences').disabled).toBe(false);
    checkbox.dispatchEvent(new Event('input', { bubbles: true }));
    expect(button('Apply provider preferences').disabled).toBe(true);
    button('Review provider preferences').click();
    button('Apply provider preferences').click();
    expect(new ProviderPreferenceStore().read().providers.FFZ.channel).toBe(false);
  } finally {
    panel.stop();
  }
});
it('uses optional FFZ role artwork only for supplied native tags and restores native images on error or opt-out', () => {
  const metadata = {
    ...data,
    badges: { moderator: { '1': { url: 'https://cdn.test/twitch-mod', title: 'Moderator', description: 'Native' } } },
    ffzRoleBadges: { moderator: { url: 'https://cdn.test/ffz-mod', title: 'Moderator', description: 'FFZ artwork' } },
  };
  const message: ChatMessage = {
    channel: 'room',
    command: 'PRIVMSG',
    login: 'alice',
    id: 'x',
    text: 'hello',
    timestamp: 1,
    tags: { badges: 'moderator/1' },
  };
  let row = messageRow(message, metadata),
    image = row.querySelector<HTMLImageElement>('.badge')!;
  expect(image.src).toBe('https://cdn.test/ffz-mod');
  expect(image.title).toContain('FFZ artwork');
  image.dispatchEvent(new Event('error'));
  expect(image.src).toBe('https://cdn.test/twitch-mod');
  image.dispatchEvent(new Event('error'));
  expect(row.querySelector('.badges')?.textContent).toBe('[moderator]');
  const p = providerDefaults();
  p.ffzRoleArtwork.moderator = false;
  setProviderPreferences(p);
  row = messageRow(message, metadata);
  expect(row.querySelector<HTMLImageElement>('.badge')?.src).toBe('https://cdn.test/twitch-mod');
  setProviderPreferences(providerDefaults());
  expect(messageRow({ ...message, tags: {} }, metadata).querySelector('.badge')).toBeNull();
  expect(message.tags.badges).toBe('moderator/1');
});
it('adds FFZ role artwork defaults to older saved preferences without affecting native role filters', () => {
  const { ffzRoleArtwork: _omitted, ...old } = providerDefaults();
  expect(parseProviderPreferences(old).ffzRoleArtwork).toEqual({ moderator: true, vip: true });
  expect(() => parseProviderPreferences({ ...old, ffzRoleArtwork: { moderator: 'yes', vip: true } })).toThrow();
});
it('keeps FFZ origin artwork separate from receiving-channel roles', () => {
  const badge = { url: 'https://cdn.test/origin-vip', title: 'VIP', description: 'FFZ artwork' };
  const message: ChatMessage = {
    channel: 'room',
    command: 'PRIVMSG',
    login: 'alice',
    id: 'x',
    text: 'hello',
    timestamp: 1,
    tags: {
      'room-id': '200',
      'source-room-id': '100',
      'source-id': '11111111-1111-4111-8111-111111111111',
      'source-badges': 'vip/1',
    },
  };
  const row = messageRow(message, data, false, undefined, {
    ...data,
    channel: 'origin',
    broadcasterID: '100',
    ffzRoleBadges: { vip: badge },
  });
  expect(row.querySelector('.badges .badge')).toBeNull();
  expect(row.querySelector<HTMLImageElement>('.source-badge')?.src).toBe(badge.url);
  expect(row.querySelector<HTMLImageElement>('.source-badge')?.title).toContain('Origin room 100');
});
it('exposes unlisted 7TV names only on opt-in without erasing lower-precedence emotes', () => {
  const global = wave('FFZ', 'global'),
    channel = wave('7TV', 'channel');
  channel.emotes.Wave!.unlisted = true;
  const metadata = { ...data, emoteSets: [global, channel] },
    p = providerDefaults();
  expect(selectProviderMetadata(metadata, p).emotes.Wave?.source).toBe('FFZ');
  p.showUnlistedSevenTV = true;
  expect(selectProviderMetadata(metadata, p).emotes.Wave?.source).toBe('7TV');
  p.providers['7TV'].channel = false;
  expect(selectProviderMetadata(metadata, p).emotes.Wave?.source).toBe('FFZ');
});
it('removes only visual whitespace between adjacent emotes while retaining text and overlays', () => {
  const p = providerDefaults();
  p.removeSpacesBetweenEmotes = true;
  setProviderPreferences(p);
  const metadata = {
    ...data,
    emotes: {
      Wave: wave('7TV', 'global').emotes.Wave!,
      Overlay: { ...wave('FFZ', 'channel').emotes.Wave!, code: 'Overlay', zeroWidth: true },
    },
  };
  const message: ChatMessage = {
    channel: 'room',
    command: 'PRIVMSG',
    login: 'alice',
    id: 'gap',
    text: 'hello Wave  Overlay Kappa end',
    timestamp: 1,
    tags: { emotes: '25:20-24' },
  };
  const text = messageText(message, metadata);
  expect(text.querySelector('.emote-gap')?.textContent).toBe('  ');
  expect(text.querySelector<HTMLElement>('.emote-gap')?.style.fontSize).toBe('0px');
  expect(text.querySelector('.overlay')).not.toBeNull();
  expect(text.textContent).toContain('hello ');
  expect(text.textContent).toContain(' end');
  expect(message.text).toBe('hello Wave  Overlay Kappa end');
});
it('scales emotes by the line height without scaling zero-width overlays twice', () => {
  const p = providerDefaults();
  p.scaleEmotesByLineHeight = true;
  p.scale = 2;
  setProviderPreferences(p);
  const metadata = {
    ...data,
    emotes: {
      Wave: wave('7TV', 'global').emotes.Wave!,
      Overlay: { ...wave('FFZ', 'channel').emotes.Wave!, code: 'Overlay', zeroWidth: true },
    },
  };
  const text = messageText(
    { channel: 'room', command: 'PRIVMSG', login: 'alice', id: 'scale', text: 'Wave Overlay', timestamp: 1, tags: {} },
    metadata,
  );
  expect(text.querySelector('.emote:not(.overlay)')?.classList.contains('line-scaled')).toBe(true);
  expect(text.querySelector<HTMLImageElement>('.emote:not(.overlay)')?.style.getPropertyValue('--emote-scale')).toBe(
    '2',
  );
  expect(text.querySelector<HTMLImageElement>('.overlay')?.style.height).toBe('100%');
});
it('keeps supplied cheer amounts visible and stacks only on a complete bits match', () => {
  const message: ChatMessage = {
    channel: 'room',
    command: 'PRIVMSG',
    login: 'alice',
    id: 'bits',
    text: 'Cheer100 hello Kappa50',
    timestamp: 1,
    tags: { bits: '150' },
  };
  expect(messageText(message, data).querySelectorAll('.cheer-amount')).toHaveLength(2);
  setProviderPreferences({ ...providerDefaults(), stackBits: true });
  const text = messageText(message, data);
  expect(text.querySelectorAll('img.emote')).toHaveLength(1);
  expect(text.querySelector('.cheer-amount')?.textContent).toBe('150');
  expect(text.textContent).toContain(' hello ');
  expect(message.text).toBe('Cheer100 hello Kappa50');
  expect(messageText({ ...message, tags: { bits: '151' } }, data).querySelectorAll('img.emote')).toHaveLength(2);
  expect(messageText({ ...message, tags: {} }, data).querySelectorAll('img.emote')).toHaveLength(0);
});
it('independently toggles emote images and zero-width layering while preserving native ranges and static fallback', () => {
  const metadata = {
    ...data,
    emotes: {
      Wave: wave('7TV', 'global').emotes.Wave!,
      Overlay: { ...wave('FFZ', 'channel').emotes.Wave!, code: 'Overlay', zeroWidth: true },
    },
  };
  const message: ChatMessage = {
    channel: 'room',
    command: 'PRIVMSG',
    login: 'alice',
    id: 'image',
    text: 'Wave Overlay Kappa',
    timestamp: 1,
    tags: { emotes: '25:13-17' },
  };
  let p = providerDefaults();
  p.images = false;
  setProviderPreferences(p);
  let text = messageText(message, metadata);
  expect(text.querySelector('img')).toBeNull();
  expect(text.textContent).toBe(message.text);
  p = { ...p, images: true, zeroWidth: false, animated: false };
  setProviderPreferences(p);
  text = messageText(message, metadata);
  expect(text.querySelectorAll('img')).toHaveLength(3);
  expect(text.querySelector('.overlay')).toBeNull();
  expect(text.querySelector<HTMLImageElement>('[data-emote-code="Kappa"]')?.src).toContain('/static/');
  expect(message.tags.emotes).toBe('25:13-17');
  p.zeroWidth = true;
  setProviderPreferences(p);
  expect(messageText(message, metadata).querySelectorAll('.overlay')).toHaveLength(1);
});
