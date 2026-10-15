// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { ComparisonPanel } from './comparison-ui';
import { RateSeries } from './rate-timeline';
import type { ChatMessage } from './protocol';
let panel: ComparisonPanel | undefined;
afterEach(() => {
  panel?.stop();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const flush = () => new Promise((r) => setTimeout(r, 0));
function setup(open = true) {
  document.body.replaceChildren();
  const now = Math.floor(Date.now() / 1000) * 1000,
    rates = new RateSeries(['one', 'two'], now - 60000);
  rates.status({ type: 'status', state: 'connected', detail: '' }, now - 60000);
  for (let second = now - 60000; second <= now; second += 1000) rates.tick(second);
  const raid: ChatMessage = {
    id: 'raid',
    channel: 'one',
    login: 'sender_private',
    text: 'do not export',
    command: 'USERNOTICE',
    timestamp: now - 30000,
    tags: { 'msg-id': 'raid', access_token: 'never' },
  };
  const archive = {
      scanChannel: vi.fn(async (channel: string, visit: (m: ChatMessage) => void) => {
        if (channel === 'one') visit(raid);
      }),
      search: vi.fn(async () => [raid]),
    },
    chat = vi.fn(),
    vod = vi.fn();
  panel = new ComparisonPanel(
    ['one', 'two'],
    { series: rates, ready: Promise.resolve() },
    { samples: () => [] },
    archive,
    chat,
    vod,
  );
  panel.setAccount('42');
  const button = (text: string) => [...panel!.root.querySelectorAll('button')].find((b) => b.textContent === text)!;
  if (open) panel.open();
  return { archive, chat, vod, button };
}
it('builds aligned graphs and source marks, previews a whitelisted export and clears it after filter changes', async () => {
  const ui = setup();
  ui.button('Compare selected channels').click();
  await flush();
  expect(panel!.root.querySelectorAll('svg')).toHaveLength(2);
  expect(panel!.root.textContent).toContain('Retained raid notice');
  ui.button('Preview aggregate export').click();
  const preview = panel!.root.querySelector('iframe')!;
  expect(preview.srcdoc).toContain('Observed stream comparison');
  for (const secret of ['sender_private', 'do not export', 'access_token'])
    expect(preview.srcdoc).not.toContain(secret);
  expect(ui.button('Download reviewed comparison').disabled).toBe(false);
  panel!.root
    .querySelector<HTMLInputElement>('[aria-label="Window start (local time)"]')!
    .dispatchEvent(new Event('input'));
  expect(preview.getAttribute('srcdoc')).toBeNull();
  expect(ui.button('Download reviewed comparison').disabled).toBe(true);
  expect(panel!.root.querySelectorAll('svg')).toHaveLength(0);
});
it('links a retained raid to chat and offers VOD context with only public channel/time', async () => {
  const ui = setup();
  ui.button('Compare selected channels').click();
  await flush();
  ui.button('VOD context').click();
  expect(ui.vod).toHaveBeenCalledWith({ channel: 'one', timestamp: expect.any(Number) });
  expect(ui.chat).not.toHaveBeenCalled();
});
it('cancels stale scans and clears graphs, messages and export on account/privacy changes', async () => {
  const ui = setup();
  let finish: (() => void) | undefined;
  ui.archive.scanChannel.mockImplementation(
    () =>
      new Promise<void>((r) => {
        finish = r;
      }),
  );
  ui.button('Compare selected channels').click();
  await flush();
  panel!.setAccount('43');
  finish?.();
  await flush();
  expect(panel!.root.querySelectorAll('svg')).toHaveLength(0);
  expect(panel!.root.textContent).not.toContain('Retained raid notice');
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  expect(panel!.root.open).toBe(false);
  expect(panel!.root.querySelector('iframe')?.getAttribute('srcdoc')).toBeNull();
});
it('rejects invalid windows before scanning the archive', async () => {
  const ui = setup();
  panel!.root.querySelector<HTMLInputElement>('[aria-label="Window start (local time)"]')!.value =
    '2100-01-01T00:00:00';
  ui.button('Compare selected channels').click();
  await flush();
  expect(ui.archive.scanChannel).not.toHaveBeenCalled();
  expect(panel!.root.textContent).toContain('window of up to');
});
it('keeps public retained comparisons available when account status is unknown or offline', async () => {
  const ui = setup();
  panel!.setAccount(undefined);
  panel!.open();
  ui.button('Compare selected channels').click();
  await flush();
  expect(panel!.root.querySelectorAll('svg')).toHaveLength(2);
  expect(ui.archive.scanChannel).toHaveBeenCalled();
});

it('does not read retained data on construction or opening, and cancels a pending scan on close', async () => {
  const ui = setup(false);
  expect(ui.archive.scanChannel).not.toHaveBeenCalled();
  expect(ui.archive.search).not.toHaveBeenCalled();
  panel!.open();
  expect(ui.archive.scanChannel).not.toHaveBeenCalled();
  let finish: (() => void) | undefined;
  ui.archive.scanChannel.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  ui.button('Compare selected channels').click();
  await flush();
  panel!.close();
  finish?.();
  await flush();
  expect(panel!.root.open).toBe(false);
  expect(panel!.root.querySelectorAll('svg')).toHaveLength(0);
  expect(ui.button('Download reviewed comparison').disabled).toBe(true);
});
