// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { ResourceStreams } from './resource-streams';
afterEach(() => vi.unstubAllGlobals());
it('marks valid stream observations, caches them and leaves failed metadata unknown', async () => {
  const root = document.createElement('div'); root.innerHTML = '<a href="?channel=one" data-channel-link>one</a><a href="?channel=two" data-channel-link>two</a>';
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => ({ channel: url.endsWith('one') ? 'one' : 'two', emotes: {}, badges: {}, stream: { uptime: '1h 2m', viewers: '123', title: 'Title' }, errors: url.endsWith('two') ? ['stream uptime'] : [] }) })); vi.stubGlobal('fetch', fetcher);
  const streams = new ResourceStreams(root); streams.start(); await vi.waitFor(() => expect(root.querySelector('a')?.dataset.live).toBe('true'));
  expect(root.querySelectorAll('a')[1]?.dataset.live).toBeUndefined(); streams.stop(); streams.start(); await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3)); streams.stop();
});
