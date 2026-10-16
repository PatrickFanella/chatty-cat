// @vitest-environment happy-dom
import type { RetentionPlan } from './archive-retention';
import { afterEach, expect, it, vi } from 'vitest';
import { PortableLogsPanel } from './portable-logs-ui';
import type { ChatMessage } from './protocol';
import type { ArchiveQuery } from './archive';
const message: ChatMessage = {
  id: 'id',
  channel: 'one',
  command: 'PRIVMSG',
  login: 'alice',
  text: 'public text',
  timestamp: Date.now() - 10000,
  tags: { secret: 'nope' },
};
let panel: PortableLogsPanel | undefined;
afterEach(() => {
  panel?.stop();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});
const flush = () => new Promise((r) => setTimeout(r, 0));
function setup(open = true) {
  document.body.replaceChildren();
  const plan: RetentionPlan = {
      policy: { rows: 100000, days: 0 },
      at: Date.now(),
      rows: 1,
      remove: 0,
      oldest: message.timestamp,
      newest: message.timestamp,
      signature: 'stable',
    },
    archive = {
      searchPage: vi.fn(async (query: ArchiveQuery) => ({
        messages: query.commands ? [message] : [message],
        next: undefined,
        scanned: 1,
        bounds: { rows: 1, oldest: message.timestamp, newest: message.timestamp },
      })),
      scanChannel: vi.fn(async (_channel: string, visit: (m: ChatMessage) => void) => {
        visit({ ...message, command: 'CLEARMSG', tags: { 'target-msg-id': 'id' } });
      }),
      retentionPreview: vi.fn(async () => plan),
      applyRetention: vi.fn(async () => {}),
    };
  panel = new PortableLogsPanel(['one'], archive, { archives: () => [], samples: () => [] });
  panel.setAccount('42');
  if (open) panel.open();
  const button = (name: string) => [...panel!.root.querySelectorAll('button')].find((b) => b.textContent === name)!;
  return { archive, button };
}
it('prepares redacted import-compatible public files with bounds/size and invalidates downloads after filter/account changes', async () => {
  const ui = setup();
  ui.button('Preview selected public logs').click();
  await flush();
  expect(panel!.root.querySelector('pre')?.textContent).toContain('[removed message]');
  expect(panel!.root.querySelector('pre')?.textContent).not.toContain('public text');
  expect(panel!.root.querySelector('pre')?.textContent).not.toContain('nope');
  expect(panel!.root.textContent).toContain('1 records');
  expect(ui.button('Download reviewed log part').disabled).toBe(false);
  panel!.root
    .querySelector<HTMLInputElement>('[aria-label="Log start (local time)"]')!
    .dispatchEvent(new Event('input'));
  expect(ui.button('Download reviewed log part').disabled).toBe(true);
  ui.button('Preview recovery export (all archived channels)').click();
  await flush();
  expect(ui.archive.searchPage.mock.calls.at(-1)?.[0].channels).toBeUndefined();
  panel!.setAccount('43');
  expect(panel!.root.querySelector('pre')?.textContent).toBe('');
  expect(ui.button('Download reviewed log part').disabled).toBe(true);
});
it('requires a reviewed retention plan and ignores an outdated preview after policy inputs change', async () => {
  const ui = setup();
  await flush();
  panel!.root
    .querySelector<HTMLInputElement>('[aria-label="Maximum retained archive rows"]')!
    .dispatchEvent(new Event('input'));
  ui.button('Apply reviewed retention').click();
  expect(ui.archive.applyRetention).not.toHaveBeenCalled();
  let finish: ((value: Awaited<ReturnType<typeof ui.archive.retentionPreview>>) => void) | undefined;
  ui.archive.retentionPreview.mockImplementation(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  ui.button('Preview retention and capacity').click();
  panel!.root.querySelector<HTMLInputElement>('[aria-label="Maximum retained archive rows"]')!.value = '1000';
  panel!.root
    .querySelector<HTMLInputElement>('[aria-label="Maximum retained archive rows"]')!
    .dispatchEvent(new Event('input'));
  finish?.({
    policy: { rows: 100000, days: 0 },
    at: Date.now(),
    rows: 1,
    remove: 0,
    oldest: null,
    newest: null,
    signature: 'old',
  });
  await flush();
  expect(ui.button('Apply reviewed retention').disabled).toBe(true);
});
it('aborts stale export preparation on privacy activation and never restores the prior file', async () => {
  const ui = setup();
  let finish: (() => void) | undefined;
  ui.archive.scanChannel.mockImplementation(
    () =>
      new Promise<void>((r) => {
        finish = r;
      }),
  );
  ui.button('Preview selected public logs').click();
  await flush();
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  finish?.();
  await flush();
  expect(panel!.root.open).toBe(false);
  expect(panel!.root.querySelector('pre')?.textContent).toBe('');
  expect(ui.button('Download reviewed log part').disabled).toBe(true);
});

it('defers archive reads until open or review and drops a pending export after close', async () => {
  const ui = setup(false);
  expect(ui.archive.retentionPreview).not.toHaveBeenCalled();
  expect(ui.archive.searchPage).not.toHaveBeenCalled();
  expect(ui.archive.applyRetention).not.toHaveBeenCalled();
  panel!.open();
  await flush();
  expect(ui.archive.retentionPreview).toHaveBeenCalledTimes(1);
  expect(ui.archive.searchPage).not.toHaveBeenCalled();
  expect(ui.archive.applyRetention).not.toHaveBeenCalled();
  let finish: (() => void) | undefined;
  ui.archive.scanChannel.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  ui.button('Preview selected public logs').click();
  await flush();
  panel!.close();
  finish?.();
  await flush();
  expect(panel!.root.open).toBe(false);
  expect(panel!.root.querySelector('pre')?.textContent).toBe('');
  expect(ui.button('Download reviewed log part').disabled).toBe(true);
  expect(ui.button('Apply reviewed retention').disabled).toBe(true);
});
