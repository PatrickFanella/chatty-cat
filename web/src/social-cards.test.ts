// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { SocialCards } from './social-cards';
let cards: SocialCards | undefined;
afterEach(() => {
  cards?.stop();
  cards = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
  delete document.documentElement.dataset.peek;
});
const card = {
  url: 'https://x.com/alice/status/123',
  title: '@alice',
  description: '<script>post</script>',
  site: 'X / Twitter',
  image: '',
  icon: '',
  author: 'alice',
  published: '2022-07-17T09:35:58Z',
  contentType: 'text/html',
  ttl: 600,
  social: { avatar: '', quote: '', photos: [], videos: [] },
};
function setup() {
  vi.useFakeTimers();
  const log = document.createElement('main');
  log.innerHTML = '<article class="row"><a class="chat-link" href="https://x.com/alice/status/123">link</a></article>';
  document.body.append(log);
  return log;
}
it('coalesces visible links, renders safe cards and applies disabled preview on subsequent mounts', async () => {
  const log = setup(),
    fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => card });
  vi.stubGlobal('fetch', fetcher);
  cards = new SocialCards(log);
  await vi.advanceTimersByTimeAsync(100);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(log.querySelector('.social-card')?.textContent).toContain('<script>post</script>');
  expect(log.querySelector('script')).toBeNull();
  const old = log.querySelector('.social-card')!.cloneNode(true);
  document.documentElement.dataset.peek = '0';
  document.dispatchEvent(new Event('previewsettings'));
  log.querySelector('.row')!.append(old);
  log.dispatchEvent(new Event('virtualpaint'));
  await vi.advanceTimersByTimeAsync(100);
  expect(log.querySelector('.social-card')).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps the original link on failure and suppresses immediate retries', async () => {
  const log = setup(),
    fetcher = vi.fn().mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetcher);
  cards = new SocialCards(log);
  await vi.advanceTimersByTimeAsync(100);
  log.dispatchEvent(new Event('virtualpaint'));
  await vi.advanceTimersByTimeAsync(100);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(log.querySelector('.chat-link')).not.toBeNull();
  expect(log.querySelector('.social-card')).toBeNull();
});

it('keeps distinct posts in the same row and coalesces repeated URLs', async () => {
  const log = setup();
  log.querySelector('.row')!.innerHTML +=
    '<a class="chat-link" href="https://twitter.com/alice/status/123">duplicate</a><a class="chat-link" href="https://x.com/bob/status/456">other</a>';
  const fetcher = vi.fn().mockImplementation(async (raw: string) => ({
    ok: true,
    json: async () => ({ ...card, url: new URL(raw, 'https://chat.test').searchParams.get('url')! }),
  }));
  vi.stubGlobal('fetch', fetcher);
  cards = new SocialCards(log);
  await vi.advanceTimersByTimeAsync(100);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(log.querySelectorAll('.social-card')).toHaveLength(2);
});
it('loads inline YouTube media only on selection and closes it when disabled', async () => {
  const log = setup();
  log.querySelector('.row')!.innerHTML =
    '<a class="chat-link" href="https://youtu.be/abcdefghijk?t=90">video</a><button data-youtube="https://youtu.be/abcdefghijk?t=90">▶</button>';
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...card,
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        site: 'YouTube',
        title: 'Video title',
        description: 'by Alice',
        author: 'Alice',
        social: undefined,
      }),
    }),
  );
  cards = new SocialCards(log);
  await vi.advanceTimersByTimeAsync(100);
  expect(log.textContent).toContain('Video title');
  expect(log.querySelector('iframe')).toBeNull();
  const play = log.querySelector<HTMLButtonElement>('[data-youtube]')!;
  play.click();
  expect(log.querySelector('iframe')?.src).toContain('autoplay=0&start=90');
  expect(play.getAttribute('aria-expanded')).toBe('true');
  play.click();
  expect(log.querySelector('iframe')).toBeNull();
  play.click();
  document.documentElement.dataset.yt = 'false';
  document.dispatchEvent(new Event('previewsettings'));
  expect(log.querySelector('iframe')).toBeNull();
  delete document.documentElement.dataset.yt;
});
