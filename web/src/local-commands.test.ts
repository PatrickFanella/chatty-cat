import { expect, it, vi } from 'vitest';
import { LocalTargets, dispatchLocal, type LocalContext } from './local-commands';
const targets = new LocalTargets();
const context = (): LocalContext => ({
  channel: 'one',
  uptime: 'offline',
  targets,
  open: vi.fn(() => true),
  copy: vi.fn(async () => {}),
  clear: vi.fn(),
  user: vi.fn(() => true),
  ignore: vi.fn(),
  connection: vi.fn(),
  popout: vi.fn(() => true),
  reply: vi.fn(),
  stage: vi.fn(),
  help: vi.fn(),
});
it('opens playback setup for the current or named channel and refuses executable arguments', async () => {
  const c = context(),
    playback = vi.fn();
  Object.assign(c, { playback });
  expect(await dispatchLocal('/streamlink', c)).toContain('confirm launch separately');
  expect(playback).toHaveBeenCalledWith('one');
  await dispatchLocal('/STREAMLINK #Two', c);
  expect(playback).toHaveBeenLastCalledWith('two');
  playback.mockClear();
  for (const command of [
    '/streamlink one best',
    '/streamlink https://twitch.tv/one',
    '/streamlink --player',
    '/streamlink one\n',
  ])
    await expect(dispatchLocal(command, c)).rejects.toThrow();
  expect(playback).not.toHaveBeenCalled();
  await expect(dispatchLocal('/streamlink', context())).rejects.toThrow('unavailable');
});
it('handles local actions without a transport call, validates links and discloses popup/clipboard failures', async () => {
  const c = context();
  expect(await dispatchLocal('/clearmessages', c)).toContain('local');
  expect(c.clear).toHaveBeenCalledWith('one');
  await expect(dispatchLocal('/openurl javascript:alert(1)', c)).rejects.toThrow();
  await expect(dispatchLocal('/openurl https://user:pass@host.test', c)).rejects.toThrow();
  await dispatchLocal('/openurl https://example.com', c);
  expect(c.open).toHaveBeenCalledWith('https://example.com/');
  c.open = () => false;
  await expect(dispatchLocal('/requests', c)).rejects.toThrow('popup');
  c.copy = async () => {
    throw new Error('denied');
  };
  await expect(dispatchLocal('/copy hello', c)).rejects.toThrow('Clipboard');
  expect(await dispatchLocal('/ban alice', c)).toBeUndefined();
});
it('keeps public replies and private /r separate and clears account targets', async () => {
  const c = context();
  targets.account('one');
  targets.whisper('alice');
  targets.reply({
    id: 'selected',
    channel: 'one',
    command: 'PRIVMSG',
    login: 'bob',
    text: 'selected text',
    timestamp: 1,
    tags: {},
  });
  await dispatchLocal('/r hello', c);
  expect(c.stage).toHaveBeenCalledWith('/w alice hello');
  await dispatchLocal('/reply public answer', c);
  expect(c.reply).toHaveBeenCalledWith(expect.objectContaining({ id: 'selected' }), 'public answer');
  targets.account('two');
  await expect(dispatchLocal('/r nope', c)).rejects.toThrow('recipient');
  await expect(dispatchLocal('/reply nope', c)).rejects.toThrow('thread');
});
