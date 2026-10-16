// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { parsePresentation, setPresentation } from './presentation';
import { ThreadsPanel } from './threads-ui';
import type { ChatMessage } from './protocol';
const root: ChatMessage = {
  id: 'root',
  channel: 'one',
  command: 'PRIVMSG',
  login: 'alice',
  text: 'original',
  timestamp: 1,
  tags: {},
};
const child: ChatMessage = {
  ...root,
  id: 'child',
  login: 'bob',
  text: 'reply',
  timestamp: 2,
  tags: { 'reply-parent-msg-id': 'root' },
};
let panel: ThreadsPanel | undefined;
afterEach(() => {
  setPresentation(parsePresentation(null));
  panel?.stop();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const flush = () => new Promise((r) => setTimeout(r, 0));
function setup() {
  document.body.innerHTML = '<button id="archive-open"></button><div><main id="log"></main></div>';
  const reply = vi.fn(),
    archive = {
      get: vi.fn(async () => root),
      scanChannel: vi.fn(async (_channel: string, visit: (m: ChatMessage) => void) => {
        visit(root);
        visit(child);
      }),
    };
  panel = new ThreadsPanel(document.querySelector('#log')!, () => [], archive, ['one', 'two'], reply);
  panel.setScope('42', 'workspace');
  const button = (name: string) => [...panel!.root.querySelectorAll('button')].find((b) => b.textContent === name)!;
  return { reply, archive, button };
}
it('stages replies, persists explicit read state, and invalidates reviewed copy after moderation or search', async () => {
  const ui = setup(),
    writeText = vi.fn(async (_text: string) => {});
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  await panel!.open(child);
  expect(panel!.root.textContent).toContain('1 unread');
  ui.button('Reply to bob').click();
  expect(ui.reply).toHaveBeenCalledWith(child);
  ui.button('Mark thread read').click();
  expect(panel!.root.textContent).not.toContain('unread');
  ui.button('Preview public context').click();
  ui.button('Copy reviewed thread').click();
  await flush();
  expect(writeText.mock.calls[0]?.[0]).toContain('reply');
  panel!.observe({ ...root, command: 'CLEARMSG', tags: { 'target-msg-id': 'child' } });
  expect(ui.button('Copy reviewed thread').disabled).toBe(true);
  ui.button('Preview public context').click();
  expect(panel!.root.querySelector('pre')?.textContent).not.toContain('bob: reply');
  expect(panel!.root.querySelector('pre')?.textContent).toContain('[removed message]');
  const search = panel!.root.querySelector('input')!;
  search.value = 'original';
  search.dispatchEvent(new Event('input'));
  expect(ui.button('Copy reviewed thread').disabled).toBe(true);
  expect(panel!.root.querySelectorAll('.thread-message')).toHaveLength(1);
});
it('loads background views on reload, isolates scopes and clears content on privacy activation', async () => {
  const ui = setup();
  await panel!.open(root);
  await panel!.open({ ...root, channel: 'two', id: 'other' });
  panel!.setScope('43', 'workspace');
  expect(panel!.root.querySelectorAll('.thread-message')).toHaveLength(0);
  panel!.setScope('42', 'workspace');
  await flush();
  expect(ui.archive.scanChannel).toHaveBeenCalledWith('one', expect.any(Function), expect.any(AbortSignal));
  expect(ui.archive.scanChannel).toHaveBeenCalledWith('two', expect.any(Function), expect.any(AbortSignal));
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  expect(panel!.root.hidden).toBe(true);
  expect(panel!.root.querySelectorAll('.thread-message')).toHaveLength(0);
  expect(panel!.root.querySelector('pre')?.textContent).toBe('');
});
it('ignores a pending parent lookup after account switch', async () => {
  const ui = setup();
  let resolve: ((m: ChatMessage) => void) | undefined;
  ui.archive.get.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = panel!.open(child);
  panel!.setScope('43', 'workspace');
  resolve?.(root);
  await pending;
  expect(panel!.views.state.views).toEqual([]);
  expect(panel!.root.hidden).toBe(true);
});

it('optionally hides on outside focus while preserving views and read state', async () => {
  const ui = setup();
  setPresentation(parsePresentation({ autoCloseThreadPopup: true }));
  await panel!.open(child);
  ui.button('Mark thread read').click();
  const saved = JSON.stringify(panel!.views.state.views);
  const input = panel!.root.querySelector('input')!;
  input.focus();
  ui.button('Preview public context').focus();
  expect(panel!.root.hidden).toBe(false);
  document.querySelector<HTMLButtonElement>('#archive-open')!.focus();
  expect(panel!.root.hidden).toBe(true);
  expect(panel!.views.state.open).toBe(false);
  expect(JSON.stringify(panel!.views.state.views)).toBe(saved);
  panel!.open();
  await flush();
  expect(panel!.root.hidden).toBe(false);
  expect(panel!.root.textContent).not.toContain('unread');
});
it('keeps the panel open by default and ignores a focus loss without a destination', async () => {
  setup();
  await panel!.open(root);
  const input = panel!.root.querySelector('input')!;
  input.focus();
  document.querySelector<HTMLButtonElement>('#archive-open')!.focus();
  expect(panel!.root.hidden).toBe(false);
  setPresentation(parsePresentation({ autoCloseThreadPopup: true }));
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
  expect(panel!.root.hidden).toBe(false);
});
