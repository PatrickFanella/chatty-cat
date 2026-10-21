import { expect, it } from 'vitest';
import { external, pairingCode, sendWatched, watchedChannel, type BridgeState } from '../../companion/browser/core.js';
const sender = {
  origin: 'https://chat.subcult.tv',
  url: 'https://chat.subcult.tv/?channel=one',
  frameId: 0,
  tab: { id: 1 },
};
it('accepts only canonical Twitch channel pages', () => {
  expect(watchedChannel('https://www.twitch.tv/Patrick__eff?referrer=x')).toBe('patrick__eff');
  for (const value of [
    'http://www.twitch.tv/one',
    'https://evil.test/one',
    'https://www.twitch.tv/videos/1',
    'https://www.twitch.tv/directory',
    'https://one@www.twitch.tv/one',
    'https://www.twitch.tv:443/one/extra',
  ])
    expect(watchedChannel(value)).toBeNull();
});
it('requires one-use pairing, exact sender origin/tab/account and an active heartbeat', () => {
  const state: BridgeState = {};
  const code = pairingCode(state, 100000);
  const pair = { version: 1, kind: 'pair', account: '42', code };
  expect(external(state, pair, { ...sender, origin: 'https://evil.test' }, 100001).ok).toBe(false);
  const receipt = external(state, pair, sender, 100002);
  expect(receipt.ok).toBe(true);
  expect(external(state, pair, sender, 100003).ok).toBe(false);
  const poll = { version: 1, kind: 'poll', account: '42', token: receipt.token };
  expect(external(state, poll, { ...sender, tab: { id: 2 } }, 101003).ok).toBe(false);
  expect(external(state, { ...poll, account: '43' }, sender, 101003).ok).toBe(false);
  expect(sendWatched(state, 'https://www.twitch.tv/one', 101004).channel).toBe('one');
  expect(external(state, poll, sender, 102004).watched).toEqual({ channel: 'one', seq: 1 });
  expect(external(state, poll, sender, 102005).ok).toBe(false);
  expect(external(state, poll, sender, 222005).ok).toBe(false);
  expect(() => sendWatched(state, 'https://www.twitch.tv/one', 222006)).toThrow('pair');
});
it('keeps pairing across background timer delays while browsing Twitch channels', () => {
  const state: BridgeState = {};
  const code = pairingCode(state, 100000);
  const receipt = external(state, { version: 1, kind: 'pair', account: '42', code }, sender, 100001);
  const poll = { version: 1, kind: 'poll', account: '42', token: receipt.token };
  expect(sendWatched(state, 'https://www.twitch.tv/patrick__eff', 101000).channel).toBe('patrick__eff');
  // A hidden app's chained timer can be checked only once per minute.
  expect(sendWatched(state, 'https://www.twitch.tv/another_channel', 165001).channel).toBe('another_channel');
  expect(external(state, poll, sender, 166001).watched).toEqual({ channel: 'another_channel', seq: 2 });
  expect(external(state, poll, sender, 231001).ok).toBe(true);
  expect(sendWatched(state, 'https://www.twitch.tv/patrick__eff', 296001).channel).toBe('patrick__eff');
});
it('popup sends do not renew the app heartbeat or extend the eight-hour pairing limit', () => {
  const state: BridgeState = {};
  const code = pairingCode(state, 100000);
  external(state, { version: 1, kind: 'pair', account: '42', code }, sender, 100001);
  sendWatched(state, 'https://www.twitch.tv/one', 160001);
  expect(() => sendWatched(state, 'https://www.twitch.tv/two', 220002)).toThrow('pair');
  expect(state.session).toBeNull();
  const code2 = pairingCode(state, 300000);
  external(state, { version: 1, kind: 'pair', account: '42', code: code2 }, sender, 300001);
  state.session!.lastSeen = 300001 + 8 * 3600000;
  expect(() => sendWatched(state, 'https://www.twitch.tv/one', 300002 + 8 * 3600000)).toThrow('pair');
});
it('unpair removes capability and never returns cookies or private app fields', () => {
  const state: BridgeState = {};
  const code = pairingCode(state, 100000);
  const r = external(state, { version: 1, kind: 'pair', account: '42', code }, sender, 100001);
  const result = external(state, { version: 1, kind: 'unpair', account: '42', token: r.token }, sender, 100002);
  expect(result.ok).toBe(true);
  expect(state.session).toBeNull();
  expect(JSON.stringify(result)).not.toMatch(/cookie|csrf|login|workspace|token/);
});
it('resumes one confirmed navigation in the same tab/account/workspace with a rotated token', () => {
  const state: BridgeState = {};
  const code = pairingCode(state, 100000);
  const paired = external(state, { version: 1, kind: 'pair', account: '42', code }, sender, 100001);
  const auth = { version: 1, account: '42', token: paired.token };
  const next = { ...sender, url: 'https://chat.subcult.tv/?workspace=next&channel=two' };
  const resume = { version: 1, kind: 'resume', account: '42', code: 'd'.repeat(64) };
  expect(external(state, resume, next, 101000).ok).toBe(false);
  expect(external(state, { ...auth, kind: 'handoff', code: resume.code, workspace: 'next' }, sender, 102000).ok).toBe(
    true,
  );
  expect(external(state, resume, { ...next, tab: { id: 2 } }, 103000).ok).toBe(false);
  expect(external(state, { ...resume, account: '43' }, next, 103001).ok).toBe(false);
  expect(external(state, resume, sender, 103002).ok).toBe(false);
  expect(external(state, { ...resume, code: 'e'.repeat(64) }, next, 103003).ok).toBe(false);
  const resumed = external(state, resume, next, 104000);
  expect(resumed.ok).toBe(true);
  expect(resumed.token).not.toBe(paired.token);
  expect(external(state, resume, next, 105000).ok).toBe(false);
  expect(external(state, { ...auth, kind: 'unpair' }, sender, 105001).ok).toBe(false);
  sendWatched(state, 'https://www.twitch.tv/two', 105002);
  expect(external(state, { ...auth, token: resumed.token, kind: 'poll' }, next, 105003).watched).toEqual({
    channel: 'two',
    seq: 1,
  });
  expect(state.session?.expires).toBe(100001 + 8 * 3600000);
});
it('expires or cancels navigation handoff and still honors explicit unpair', () => {
  const state: BridgeState = {};
  const code = pairingCode(state, 100000);
  const paired = external(state, { version: 1, kind: 'pair', account: '42', code }, sender, 100001);
  const auth = { version: 1, account: '42', token: paired.token };
  const handoff = { ...auth, kind: 'handoff', code: 'd'.repeat(64), workspace: 'next' };
  const resume = { version: 1, account: '42', kind: 'resume', code: handoff.code };
  const next = { ...sender, url: 'https://chat.subcult.tv/?workspace=next' };
  external(state, handoff, sender, 101000);
  expect(external(state, resume, next, 131001).ok).toBe(false);
  external(state, handoff, sender, 132000);
  expect(external(state, { ...auth, kind: 'cancel-handoff' }, sender, 133000).ok).toBe(true);
  expect(external(state, resume, next, 134000).ok).toBe(false);
  external(state, handoff, sender, 135000);
  external(state, { ...auth, kind: 'unpair' }, sender, 136000);
  expect(external(state, resume, next, 137000).ok).toBe(false);
});
