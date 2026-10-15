// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { firstGiphyResult, GiphyTitles } from './giphy';
const result = {
  data: [
    {
      url: 'https://giphy.com/gifs/one',
      title: 'A GIF',
      images: { fixed_height: { url: 'https://media2.giphy.com/media/one/giphy.gif?cid=keep' } },
    },
  ],
};
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  localStorage.clear();
  delete document.documentElement.dataset.gifsafe;
});
it('keeps the first result and exact media URL, rejecting unsafe or malformed upstream values', () => {
  expect(firstGiphyResult(result)?.image).toContain('?cid=keep');
  expect(firstGiphyResult({ data: [{ ...result.data[0], url: 'javascript:evil' }, result.data[0]] })).toBeUndefined();
  expect(
    firstGiphyResult({ data: [{ ...result.data[0], images: { fixed_height: { url: 'https://evil.example/gif' } } }] }),
  ).toBeUndefined();
  expect(firstGiphyResult({ data: [] })).toBeUndefined();
});
it('loads only on selection, uses direct safe-rated search and displays attribution', async () => {
  document.documentElement.dataset.gifsafe = 'true';
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ giphyApiKey: 'test-public-key' })))
    .mockResolvedValueOnce(new Response(JSON.stringify(result)));
  vi.stubGlobal('fetch', fetcher);
  document.body.innerHTML = '<div id="log"><a class="gif-title" data-gif-query="cat">[cat GIF]</a></div>';
  const log = document.getElementById('log')!,
    controller = new GiphyTitles(log);
  expect(fetcher).not.toHaveBeenCalled();
  (log.querySelector('button') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(log.textContent).toContain('Powered by GIPHY'));
  const url = new URL(String(fetcher.mock.calls[1]?.[0]));
  expect(url.origin).toBe('https://api.giphy.com');
  expect(url.searchParams.get('rating')).toBe('pg-13');
  expect(url.searchParams.get('limit')).toBe('1');
  expect(log.querySelector('img')?.src).toContain('?cid=keep');
  controller.stop();
});
it('retains the search link when configuration is absent', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ giphyApiKey: '' }))));
  document.body.innerHTML =
    '<div id="log"><a class="gif-title" href="https://giphy.com/search/cat" data-gif-query="cat">[cat GIF]</a></div>';
  const log = document.getElementById('log')!,
    controller = new GiphyTitles(log);
  (log.querySelector('button') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(log.textContent).toContain('not configured'));
  expect(log.querySelector('a')?.href).toBe('https://giphy.com/search/cat');
  controller.stop();
});
it('enforces the persisted hourly budget without storing media URLs', async () => {
  localStorage.setItem(
    'chatthing:v1:giphy-budget',
    JSON.stringify({ sent: Array.from({ length: 80 }, () => Date.now() - 5000), pause: 0 }),
  );
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ giphyApiKey: 'test-public-key' })));
  vi.stubGlobal('fetch', fetcher);
  document.body.innerHTML = '<div id="log"><a class="gif-title" data-gif-query="cat">[cat GIF]</a></div>';
  const log = document.getElementById('log')!,
    controller = new GiphyTitles(log);
  log.querySelector<HTMLButtonElement>('button')!.click();
  await vi.waitFor(() => expect(log.textContent).toContain('paused'));
  expect(fetcher).toHaveBeenCalledTimes(1);
  controller.stop();
  expect(localStorage.getItem('chatthing:v1:giphy-budget')).not.toContain('giphy.com');
});
it('backs off for five minutes after 429', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ giphyApiKey: 'test-public-key' })))
    .mockResolvedValueOnce(new Response('', { status: 429 }));
  vi.stubGlobal('fetch', fetcher);
  document.body.innerHTML = '<div id="log"><a class="gif-title" data-gif-query="cat">[cat GIF]</a></div>';
  const log = document.getElementById('log')!,
    controller = new GiphyTitles(log);
  const button = log.querySelector<HTMLButtonElement>('button')!;
  button.click();
  await vi.waitFor(() => expect(button.textContent).toContain('unavailable'));
  button.click();
  await vi.waitFor(() => expect(button.textContent).toContain('paused'));
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(localStorage.getItem('chatthing:v1:giphy-budget')!).pause).toBeGreaterThan(Date.now() + 290000);
  controller.stop();
});
it('discards an unrestricted response that arrives after safe mode is enabled', async () => {
  let resolve!: (response: Response) => void;
  const pending = new Promise<Response>((done) => {
    resolve = done;
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ giphyApiKey: 'test-public-key' })))
    .mockReturnValueOnce(pending);
  vi.stubGlobal('fetch', fetcher);
  document.body.innerHTML = '<div id="log"><a class="gif-title" data-gif-query="cat">[cat GIF]</a></div>';
  const log = document.getElementById('log')!,
    controller = new GiphyTitles(log),
    button = log.querySelector<HTMLButtonElement>('button')!;
  button.click();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  document.documentElement.dataset.gifsafe = 'true';
  document.dispatchEvent(new Event('previewsettings'));
  resolve(new Response(JSON.stringify(result)));
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  expect(log.querySelector('img')).toBeNull();
  controller.stop();
});
