// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { ArchiveSearch } from './archive-ui';
import type { ArchivePage, MessageArchive } from './archive';
import type { ChatMessage } from './protocol';
const message: ChatMessage = {
  id: 'id',
  command: 'PRIVMSG',
  channel: 'one',
  login: 'alice',
  text: 'hello',
  timestamp: 100,
  tags: {},
};
const page: ArchivePage = {
  messages: [message],
  next: { timestamp: 100, key: 'one:id' },
  scanned: 1,
  bounds: { rows: 1, oldest: 100, newest: 100 },
};
let search: ArchiveSearch | undefined;
afterEach(() => {
  search?.stop();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});
const flush = () => new Promise((r) => setTimeout(r, 0));
function setup(
  fetchPage = vi.fn<MessageArchive['searchPage']>(async () => page),
  vod?: (message: ChatMessage) => void,
) {
  document.body.innerHTML =
    '<button id="open">Archive</button><dialog><button id="archive-close">Close</button><form><input id="archive-query"><select id="archive-channel"><option value="">All</option></select><button>Search</button></form><p id="archive-status"></p><div id="archive-results"></div></dialog>';
  const dialog = document.querySelector('dialog')!,
    select = vi.fn();
  search = new ArchiveSearch(
    dialog,
    document.querySelector<HTMLButtonElement>('#open')!,
    { searchPage: fetchPage },
    ['one'],
    select,
    undefined,
    vod,
  );
  search.setAccount('42');
  const button = (text: string) => [...dialog.querySelectorAll('button')].find((b) => b.textContent === text)!;
  return { dialog, select, button, input: dialog.querySelector<HTMLInputElement>('#archive-query')!, fetchPage };
}
it('builds and saves a query, executes it locally, pages and jumps through the context callback', async () => {
  const ui = setup();
  ui.dialog.querySelector<HTMLSelectElement>('[aria-label="Archive filter"]')!.value = 'sender';
  ui.dialog.querySelector<HTMLInputElement>('[aria-label="Filter value"]')!.value = 'alice,bob';
  ui.button('Add filter').click();
  expect(ui.input.value).toBe('sender:"alice","bob"');
  ui.dialog.querySelector<HTMLInputElement>('[aria-label="Query name"]')!.value = 'authors';
  ui.button('Save query').click();
  ui.dialog.querySelector<HTMLSelectElement>('[aria-label="Saved query"]')!.selectedIndex = 1;
  ui.button('Run saved query').click();
  await flush();
  expect(ui.fetchPage).toHaveBeenCalledTimes(1);
  expect(ui.dialog.querySelector('#archive-status')?.textContent).toContain('Page 1');
  ui.button('Next results').click();
  await flush();
  expect(ui.fetchPage.mock.calls[1]?.[1]).toEqual(page.next);
  ui.dialog.querySelector<HTMLButtonElement>('.archive-result')!.click();
  expect(ui.select).toHaveBeenCalledWith(message);
});
it('reports query errors without scanning, and clears account/private results on transition', async () => {
  const ui = setup();
  ui.input.value = 'unknown:value';
  ui.dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
  await flush();
  expect(ui.fetchPage).not.toHaveBeenCalled();
  expect(ui.dialog.querySelector('#archive-status')?.textContent).toContain('Unknown filter');
  ui.input.value = 'hello';
  ui.dialog.querySelector<HTMLInputElement>('[aria-label="Query name"]')!.value = 'private';
  ui.button('Save query').click();
  search!.setAccount('43');
  expect(ui.input.value).toBe('');
  expect(ui.dialog.querySelector('[aria-label="Saved query"]')?.textContent).not.toContain('private');
});
it('opens the current-channel or joined-channel scope and includes the channel in saved queries', () => {
  const ui = setup();
  search!.show('one');
  expect(ui.dialog.querySelector<HTMLSelectElement>('#archive-channel')!.value).toBe('one');
  ui.input.value = 'hello';
  ui.dialog.querySelector<HTMLInputElement>('[aria-label="Query name"]')!.value = 'channel';
  ui.button('Save query').click();
  expect(localStorage.getItem('chatthing:v1:archive-queries:42')).toContain('channel:');
  ui.dialog.close();
  search!.show();
  expect(ui.dialog.querySelector<HTMLSelectElement>('#archive-channel')!.value).toBe('');
});
it('cancels stale requests and hides saved names and results when privacy activates', async () => {
  let resolve: (page: ArchivePage) => void = () => {};
  const fetchPage = vi.fn<MessageArchive['searchPage']>(
    () =>
      new Promise<ArchivePage>((r) => {
        resolve = r;
      }),
  );
  const ui = setup(fetchPage);
  ui.input.value = 'hello';
  ui.dialog.querySelector<HTMLInputElement>('[aria-label="Query name"]')!.value = 'private';
  ui.button('Save query').click();
  ui.dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, panic: true, allowed: [] }));
  document.dispatchEvent(new Event('privacychange'));
  resolve(page);
  await flush();
  expect(ui.dialog.querySelector('#archive-results')?.textContent).toBe('');
  expect(ui.dialog.querySelector('[aria-label="Saved query"]')?.textContent).not.toContain('private');
  expect(ui.input.value).toBe('');
});

it('opens VOD context from an archive result without replacing the main reader context', async () => {
  const vod = vi.fn(),
    ui = setup(undefined, vod);
  search!.show();
  ui.dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
  await flush();
  ui.button('VOD context').click();
  expect(vod).toHaveBeenCalledWith(message);
  expect(ui.select).not.toHaveBeenCalled();
  expect(ui.dialog.open).toBe(false);
});
