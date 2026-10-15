// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { TwitchVolume } from './twitch-volume';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete window.Twitch;
  document.body.replaceChildren();
});
it('keeps the existing player if the SDK fails', async () => {
  const host = document.createElement('div'),
    frame = document.createElement('iframe');
  host.append(frame);
  document.body.append(host);
  let fail = () => {};
  const append = vi.spyOn(document.head, 'append').mockImplementation((node) => {
    if (node instanceof HTMLScriptElement) fail = () => node.dispatchEvent(new Event('error'));
  });
  const memory = new TwitchVolume(),
    pending = memory.mount(host, 'one', 0.7, false, vi.fn());
  expect(append).toHaveBeenCalled();
  fail();
  expect(await pending).toBe(false);
  expect(host.firstChild).toBe(frame);
  memory.stop();
});
it('restores only through official controls, saves valid native changes and disposes polling', async () => {
  vi.useFakeTimers();
  const save = vi.fn(),
    setVolume = vi.fn(),
    setMuted = vi.fn();
  let ready = () => {};
  let current = 0.7;
  class Player {
    static READY = 'ready';
    constructor(
      _id: string,
      public options: unknown,
    ) {}
    pause = () => {};
    setVolume = setVolume;
    setMuted = setMuted;
    getVolume = () => current;
    getMuted = () => false;
    addEventListener(_event: string, callback: () => void) {
      ready = callback;
    }
  }
  window.Twitch = { Player };
  const host = document.createElement('div');
  document.body.append(host);
  const memory = new TwitchVolume();
  expect(await memory.mount(host, 'one', 0.7, false, save)).toBe(true);
  ready();
  ready();
  expect(setVolume).toHaveBeenCalledWith(0.7);
  expect(setMuted).toHaveBeenCalledWith(false);
  current = 0.3;
  vi.advanceTimersByTime(2000);
  expect(save).toHaveBeenCalledWith(0.3, false);
  expect(save).toHaveBeenCalledTimes(1);
  memory.stop();
  const calls = save.mock.calls.length;
  vi.advanceTimersByTime(4000);
  expect(save).toHaveBeenCalledTimes(calls);
});
it('does not replace a closed player after a delayed SDK response', async () => {
  const host = document.createElement('div'),
    frame = document.createElement('iframe');
  host.append(frame);
  document.body.append(host);
  const memory = new TwitchVolume();
  let fail = () => {};
  vi.spyOn(document.head, 'append').mockImplementation((node) => {
    if (node instanceof HTMLScriptElement) fail = () => node.dispatchEvent(new Event('error'));
  });
  const pending = memory.mount(host, 'one', 0.5, true, vi.fn());
  memory.stop();
  fail();
  expect(await pending).toBe(false);
  expect(host.firstChild).toBe(frame);
});
