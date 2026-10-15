// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { Whispers } from './whispers';
import type { ChatMessage } from './protocol';
let pane: Whispers | undefined;
afterEach(() => {
  pane?.stop();
  pane = undefined;
  localStorage.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
function setup() {
  const root = document.createElement('section');
  root.hidden = true;
  root.innerHTML =
    '<button id="whisper-handle">Whispers</button><button id="whisper-pin">Pin</button><button id="whisper-close">Close</button><p id="whisper-status"></p><div id="whisper-log"></div>';
  const trigger = document.createElement('button');
  document.body.append(trigger, root);
  const answer = vi.fn(),
    alert = vi.fn();
  pane = new Whispers(root, trigger, answer, alert);
  pane.update({
    enabled: true,
    authenticated: true,
    loginURL: 'https://chat.subcult.tv/api/auth/login',
    userID: '42',
    login: 'viewer',
  });
  return { root, trigger, answer, alert };
}
const message: ChatMessage = {
  command: 'WHISPER',
  id: 'private-id',
  channel: '',
  login: 'alice',
  text: '<script>private</script> https://example.com',
  timestamp: 1000,
  tags: { 'display-name': 'Alice' },
};
it('keeps private content in a bounded pane, deduplicates and clears account changes', () => {
  const { root, trigger, alert, answer } = setup();
  pane?.receive(message);
  pane?.receive(message);
  expect(root.querySelectorAll('article')).toHaveLength(1);
  expect(root.querySelector('script')).toBeNull();
  expect(alert).toHaveBeenCalledTimes(1);
  expect(trigger.textContent).toBe('Whispers (1)');
  expect(
    [...Array.from({ length: localStorage.length }, (_, i) => localStorage.getItem(localStorage.key(i)!))].join(''),
  ).not.toContain('private');
  trigger.click();
  expect(root.hidden).toBe(false);
  expect(trigger.textContent).toBe('Whispers');
  root.querySelector<HTMLButtonElement>('[data-answer]')?.click();
  expect(answer).toHaveBeenCalledWith('alice');
  for (let i = 0; i < 250; i++) pane?.receive({ ...message, id: 'id-' + i });
  expect(root.querySelectorAll('article')).toHaveLength(200);
  pane?.update(undefined);
  expect(root.hidden).toBe(true);
  expect(root.querySelectorAll('article')).toHaveLength(0);
  expect(trigger.disabled).toBe(true);
});
it('does not write outgoing requests after logout and labels acceptance accurately', () => {
  const { root } = setup();
  pane?.echo('alice', 'hello', 'request-id');
  expect(root.textContent).toContain('Requested → alice');
  pane?.update(undefined);
  pane?.echo('alice', 'late', 'late-id');
  expect(root.textContent).not.toContain('late');
});
