// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { referenceData } from './reference-data';
import { emojiFixture } from '../test-support/reference-data';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('fetches nothing until requested, coalesces concurrent decodes and retries failures', async () => {
  const decode = vi.fn((value: unknown) => value);
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(Response.json({ fixture: true }));
  vi.stubGlobal('fetch', fetcher);
  const load = referenceData('/data/fixture.json', decode);
  expect(fetcher).not.toHaveBeenCalled();
  await expect(load()).rejects.toThrow('offline');
  const first = load(),
    second = load();
  expect(first).toBe(second);
  expect(await first).toEqual({ fixture: true });
  await load();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(decode).toHaveBeenCalledOnce();
});
it('recognizes Unicode sequences and tracks uses before metadata loads, then upgrades names atomically', async () => {
  vi.resetModules();
  const emoji = await import('./emoji');
  const fetcher = vi.fn(async () => Response.json(emojiFixture));
  vi.stubGlobal('fetch', fetcher);
  expect(emoji.emojiCatalogLoaded()).toBe(false);
  expect(emoji.observedEmoji('👩🏽‍💻 and 🫪')).toEqual(['👩🏽‍💻', '🫪']);
  expect(fetcher).not.toHaveBeenCalled();
  const { PickerModel } = await import('./picker-model');
  const model = new PickerModel();
  model.observe(
    {
      command: 'PRIVMSG',
      id: 'fixture',
      channel: 'fixture',
      login: 'viewer',
      text: '🫪',
      timestamp: Date.now(),
      tags: {},
    },
    true,
  );
  expect(model.lastUse('fixture', '🫪')).toBeGreaterThan(0);
  expect(fetcher).not.toHaveBeenCalled();
  const change = vi.fn();
  document.addEventListener('emojistylechange', change);
  emoji.setEmojiStyle('labels');
  expect(emoji.emojiNode('🫪').textContent).toBe('🫪');
  await emoji.loadEmojiCatalog();
  expect(emoji.emojiNode('🫪').textContent).toBe('[distorted face]');
  expect(change).toHaveBeenCalledTimes(2);
  expect(fetcher).toHaveBeenCalledOnce();
  document.removeEventListener('emojistylechange', change);
  localStorage.clear();
});
it('rejects a damaged catalog and retries without exposing partial names or unsafe image paths', async () => {
  vi.resetModules();
  const emoji = await import('./emoji');
  const damaged = structuredClone(emojiFixture);
  damaged.entries[100].asset = '../private.svg';
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(damaged))
    .mockResolvedValueOnce(Response.json(emojiFixture));
  vi.stubGlobal('fetch', fetcher);
  await expect(emoji.loadEmojiCatalog()).rejects.toThrow('Invalid emoji entry');
  expect(emoji.emojiCatalogLoaded()).toBe(false);
  expect(emoji.emojiEntry('😀')).toBeUndefined();
  await emoji.loadEmojiCatalog();
  expect(emoji.emojiCatalogLoaded()).toBe(true);
});
