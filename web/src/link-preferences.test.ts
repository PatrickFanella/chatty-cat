// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import {
  parseLinkPreferences,
  linkDefaults,
  setLinkPreferences,
  LinkPreferenceStore,
  searchURL,
  LinkTools,
} from './link-preferences';
import { setProfileScope } from './account-profiles';
let tools: LinkTools | undefined;
afterEach(() => {
  tools?.stop();
  tools = undefined;
  setLinkPreferences(linkDefaults);
  setProfileScope('anonymous');
  localStorage.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
it('validates public-web search templates, bounded sizes and flags', () => {
  for (const engineURL of [
    'javascript:alert(1)',
    'https://user:password@example.com/?q={query}',
    'https://example.com/?q={query}&x={query}',
    'https://example.com/',
  ])
    expect(() => parseLinkPreferences({ ...linkDefaults, engineURL })).toThrow();
  expect(() => parseLinkPreferences({ ...linkDefaults, thumbnailSize: 10000 })).toThrow();
  expect(searchURL({ ...linkDefaults, searchEnabled: true }, 'x & 😀')).toBe(
    'https://duckduckgo.com/?q=x%20%26%20%F0%9F%98%80',
  );
});
it('keeps local-only policy isolated and refuses stale writes', () => {
  setProfileScope('42');
  const a = new LinkPreferenceStore(),
    b = new LinkPreferenceStore();
  a.save({ ...linkDefaults, doubleClick: true });
  expect(() => b.save(linkDefaults)).toThrow('another tab');
  setProfileScope('43');
  expect(() => a.save(linkDefaults)).toThrow('Account');
  expect(localStorage.getItem('chatthing:v1:profile:43:link-preferences')).toBeNull();
});
it('reviews settings before enabling remote fetches and never persists selected text', () => {
  document.body.innerHTML = '<button id="commands-open"></button><main id="test-log">public</main>';
  tools = new LinkTools(document.getElementById('test-log')!);
  const d = tools.root;
  d.querySelector<HTMLInputElement>('[name=enabled]')!.checked = true;
  d.querySelector<HTMLInputElement>('[name=thumbnails]')!.checked = true;
  const click = (name: string) => [...d.querySelectorAll('button')].find((x) => x.textContent === name)!.click();
  click('Review link preferences');
  expect(localStorage.getItem('chatthing:v1:link-preferences')).toBeNull();
  click('Apply link preferences');
  expect(d.textContent).toContain('Saved');
});
it('suppresses link/search tools and clears input in privacy mode', () => {
  document.body.innerHTML = '<button id="commands-open"></button><main id="test-log">public</main>';
  tools = new LinkTools(document.getElementById('test-log')!);
  const field = tools.root.querySelector<HTMLInputElement>('[name=engineURL]')!;
  field.value = 'https://example.com/?q={query}';
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  expect(field.value).toBe('');
});

it('reviews only selection contained in public chat and exposes a safe encoded search link', () => {
  document.body.innerHTML =
    '<button id="commands-open"></button><main id="test-log"><p>Alice & 😀</p></main><p id="outside">private note</p>';
  tools = new LinkTools(document.getElementById('test-log')!);
  setLinkPreferences({ ...linkDefaults, searchEnabled: true });
  document.dispatchEvent(new Event('privacychange'));
  const selection = document.getSelection()!,
    range = document.createRange();
  range.selectNodeContents(document.querySelector('#test-log p')!);
  selection.removeAllRanges();
  selection.addRange(range);
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Search selected chat text')!.click();
  const review = document.querySelector<HTMLDialogElement>('[aria-label="Review selection search"]')!;
  expect(review.textContent).toContain('Alice & 😀');
  expect(review.querySelector('a')?.href).toBe('https://duckduckgo.com/?q=Alice%20%26%20%F0%9F%98%80');
  expect(localStorage.getItem('chatthing:v1:link-preferences') ?? '').not.toContain('Alice');
  review.close();
  range.selectNodeContents(document.getElementById('outside')!);
  selection.removeAllRanges();
  selection.addRange(range);
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Search selected chat text')!.click();
  expect(review.open).toBe(false);
});
it('requires double-click for pointer opening while preserving Enter and handles a blocked new tab', () => {
  document.body.innerHTML =
    '<button id="commands-open"></button><main id="test-log"><a class="chat-link" href="https://example.com/">public</a></main>';
  tools = new LinkTools(document.getElementById('test-log')!);
  setLinkPreferences({ ...linkDefaults, doubleClick: true });
  const link = document.querySelector('a')!,
    first = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
  link.dispatchEvent(first);
  expect(first.defaultPrevented).toBe(true);
  const enter = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 });
  link.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(false);
  const opener = vi.spyOn(window, 'open').mockReturnValue(null);
  link.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
  expect(opener).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
  expect(tools.root.textContent).toContain('blocked');
});

it('resolves a link only after review and drops a late response on privacy', async () => {
  document.body.innerHTML =
    '<button id="commands-open"></button><main id="test-log"><button data-resolve-link="https://example.com/short">Resolve link</button></main>';
  tools = new LinkTools(document.getElementById('test-log')!);
  setLinkPreferences({ ...linkDefaults, unshorten: true });
  let finish: (value: Response) => void = () => {};
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  document.querySelector<HTMLButtonElement>('[data-resolve-link]')!.click();
  expect(fetcher).not.toHaveBeenCalled();
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Resolve this public URL')!.click();
  expect(fetcher).toHaveBeenCalledOnce();
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  finish(new Response(JSON.stringify({ url: 'https://example.com/resolved' })));
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector('[aria-label="Review selection search"]')?.textContent).not.toContain('resolved');
});
