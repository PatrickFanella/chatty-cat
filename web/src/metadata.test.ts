import { describe, expect, it } from 'vitest';
import { parseMetadata } from './metadata';

const valid = {
  emoteUse: { Wave: 42 },
  channel: 'room',
  errors: ['FFZ channel'],
  stream: { uptime: '2 hours', viewers: '1000', title: 'Hello' },
  emotes: {
    Wave: {
      code: 'Wave',
      url: 'https://cdn.example/wave',
      staticUrl: '',
      source: '7TV',
      animated: true,
      zeroWidth: false,
    },
  },
  badges: { subscriber: { '1': { url: 'https://cdn.example/badge', title: 'Subscriber', description: 'One month' } } },
};
it('accepts the live Twitch catalog size while retaining category and version bounds', () => {
  const badges = (count: number) =>
    Object.fromEntries(Array.from({ length: count }, (_, i) => ['badge' + i, valid.badges.subscriber]));
  expect(Object.keys(parseMetadata({ ...valid, badges: badges(420) })?.badges ?? {})).toHaveLength(420);
  expect(parseMetadata({ ...valid, badges: badges(1025) })).toBeNull();
  expect(
    parseMetadata({
      ...valid,
      badges: {
        subscriber: Object.fromEntries(Array.from({ length: 257 }, (_, i) => ['' + i, valid.badges.subscriber['1']])),
      },
    }),
  ).toBeNull();
});
describe('metadata wire boundary', () => {
  it('retains normalized data and partial-provider failures', () => expect(parseMetadata(valid)).toEqual(valid));
  it.each([
    null,
    [],
    {},
    { ...valid, channel: '../room' },
    { ...valid, stream: { title: 1 } },
    { ...valid, errors: [42] },
  ])('rejects malformed responses', (value) => expect(parseMetadata(value)).toBeNull());
  it.each(['javascript:alert(1)', 'http://cdn.example/image', 'https://user:password@cdn.example/image'])(
    'rejects unsafe image %s',
    (url) => {
      expect(parseMetadata({ ...valid, emotes: { Wave: { ...valid.emotes.Wave, url } } })).toBeNull();
      expect(
        parseMetadata({ ...valid, badges: { subscriber: { '1': { ...valid.badges.subscriber['1'], url } } } }),
      ).toBeNull();
    },
  );
  it('keeps dictionaries free of inherited emote keys', () => {
    const metadata = parseMetadata(valid);
    expect(metadata).not.toBeNull();
    expect(Object.getPrototypeOf(metadata?.emotes)).toBeNull();
    expect(metadata?.emotes.constructor).toBeUndefined();
  });
  it('rejects an emote with a mismatched code', () =>
    expect(parseMetadata({ ...valid, emotes: { Wave: { ...valid.emotes.Wave, code: 'Other' } } })).toBeNull());
});

it('validates optional lifetime usage seeds separately from stream/emote data', () => {
  expect(parseMetadata({ ...valid, emoteUse: undefined })?.emoteUse).toEqual({});
  for (const count of [-1, Infinity, 1.5, '12'])
    expect(parseMetadata({ ...valid, emoteUse: { Wave: count } })).toBeNull();
});
it('validates public VOD timing and Twitch-only destinations', () => {
  const lastVod = {
    start: '2026-10-10T12:00:00Z',
    end: '2026-10-10T13:00:00Z',
    url: 'https://www.twitch.tv/videos/12345',
    title: 'Latest archive',
  };
  expect(parseMetadata({ ...valid, lastVod })?.lastVod).toEqual(lastVod);
  for (const bad of [
    { ...lastVod, end: lastVod.start },
    { ...lastVod, url: 'https://evil.test/videos/12345' },
    { ...lastVod, start: 'not a date' },
  ])
    expect(parseMetadata({ ...valid, lastVod: bad })).toBeNull();
});

it('validates optional category metadata while accepting older servers', () => {
  expect(parseMetadata({ ...valid, stream: { ...valid.stream, game: 'Music' } })?.stream.game).toBe('Music');
  expect(parseMetadata({ ...valid, stream: { ...valid.stream, game: 42 } })).toBeNull();
  expect(parseMetadata(valid)?.stream.game).toBeUndefined();
});

it('retains bounded provider scopes and rejects ambiguous/malformed sets', () => {
  const set = { provider: '7TV', scope: 'global', emotes: valid.emotes };
  expect(parseMetadata({ ...valid, emoteSets: [set] })?.emoteSets).toEqual([set]);
  for (const emoteSets of [[{ ...set, scope: 'other' }], [set, set], [{ ...set, provider: 'FFZ' }], Array(9).fill(set)])
    expect(parseMetadata({ ...valid, emoteSets })).toBeNull();
  expect(parseMetadata({ ...valid, errors: Array(65).fill('bad') })).toBeNull();
  expect(
    parseMetadata({
      ...valid,
      emotes: Object.fromEntries(
        Array.from({ length: 16385 }, (_, i) => ['x' + i, { ...valid.emotes.Wave, code: 'x' + i }]),
      ),
    }),
  ).toBeNull();
  expect(
    parseMetadata({
      ...valid,
      emotes: { Wave: { ...valid.emotes.Wave, url: 'https://cdn.example/' + 'a'.repeat(2048) } },
    }),
  ).toBeNull();
});

it('validates optional public broadcaster IDs without requiring newer metadata', () => {
  expect(parseMetadata({ ...valid, broadcasterID: '123' })?.broadcasterID).toBe('123');
  for (const broadcasterID of ['../bad', 42, '']) expect(parseMetadata({ ...valid, broadcasterID })).toBeNull();
});
it('accepts only the two bounded FFZ role artwork entries with safe images', () => {
  const badge = { url: 'https://cdn.example/mod', title: 'Moderator', description: 'FFZ artwork' };
  expect(parseMetadata({ ...valid, ffzRoleBadges: { moderator: badge } })?.ffzRoleBadges?.moderator).toEqual(badge);
  for (const ffzRoleBadges of [
    { staff: badge },
    { vip: { ...badge, url: 'javascript:alert(1)' } },
    { moderator: { ...badge, description: 'x'.repeat(1001) } },
  ])
    expect(parseMetadata({ ...valid, ffzRoleBadges })).toBeNull();
  expect(parseMetadata(valid)?.ffzRoleBadges).toBeUndefined();
});

it('keeps optional public 7TV object identities bounded and accepts older servers', () => {
  const sevenTV = { userID: 'owner-7tv', channelSetID: 'channel-set', globalSetID: 'global-set' };
  expect(parseMetadata({ ...valid, sevenTV })?.sevenTV).toEqual(sevenTV);
  for (const bad of [
    { ...sevenTV, userID: 'https://other.example' },
    { ...sevenTV, channelSetID: 'x'.repeat(101) },
    { ...sevenTV, privateToken: 'never' },
  ])
    expect(parseMetadata({ ...valid, sevenTV: bad })).toBeNull();
  expect(parseMetadata(valid)?.sevenTV).toBeUndefined();
});
