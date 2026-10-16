// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { WhisperRuntime } from './whispers-runtime';
import { WhisperPanel } from './whispers-ui';
import type { ChatMessage } from './protocol';
let runtime: WhisperRuntime | undefined;
let view: WhisperPanel | undefined;
afterEach(() => {
  view?.stop();
  runtime?.stop();
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
});
const message: ChatMessage = {
  command: 'WHISPER',
  id: 'private-id',
  channel: '',
  login: 'alice',
  text: '<script>private</script> https://example.com',
  timestamp: 1000,
  tags: { 'display-name': 'Alice' },
};
function setup() {
  const root = document.createElement('section');
  root.hidden = true;
  root.innerHTML =
    '<button id="whisper-handle">Whispers</button><button id="whisper-pin">Pin</button><button id="whisper-close">Close</button><p id="whisper-status"></p><div id="whisper-log"></div>';
  document.body.append(root);
  const alert = vi.fn(),
    answer = vi.fn();
  runtime = new WhisperRuntime(alert);
  runtime.update({
    enabled: true,
    authenticated: true,
    loginURL: 'https://chat.subcult.tv/api/auth/login',
    userID: '42',
    login: 'viewer',
  });
  view = new WhisperPanel(root, runtime, answer);
  return { root, alert, answer };
}
it('retains and deduplicates private observations without a view or storage and clears them on account change', () => {
  const alert = vi.fn();
  runtime = new WhisperRuntime(alert);
  runtime.update({ enabled: true, authenticated: true, loginURL: '', userID: '42' });
  runtime.receive(message);
  runtime.receive(message);
  expect(runtime.messages).toHaveLength(1);
  expect(runtime.unread).toBe(1);
  expect(document.querySelector('article')).toBeNull();
  expect(alert).toHaveBeenCalledTimes(1);
  expect(
    [...Array.from({ length: localStorage.length }, (_, i) => localStorage.getItem(localStorage.key(i)!))].join(''),
  ).not.toContain('private');
  runtime.update(undefined);
  expect(runtime.messages).toHaveLength(0);
  runtime.echo('alice', 'late', 'late-id');
  expect(runtime.messages).toHaveLength(0);
});
it('renders inert bounded text only while open and clears private DOM immediately on sign-out', () => {
  const { root, alert, answer } = setup();
  runtime!.receive(message);
  expect(root.querySelectorAll('article')).toHaveLength(0);
  view!.open();
  expect(root.querySelectorAll('article')).toHaveLength(1);
  expect(root.querySelector('script')).toBeNull();
  expect(runtime!.unread).toBe(0);
  root.querySelector<HTMLButtonElement>('[data-answer]')!.click();
  expect(answer).toHaveBeenCalledWith('alice');
  for (let i = 0; i < 250; i++) runtime!.receive({ ...message, id: 'id-' + i });
  expect(runtime!.messages).toHaveLength(200);
  expect(root.querySelectorAll('article')).toHaveLength(200);
  expect(alert).toHaveBeenCalledTimes(1);
  runtime!.update(undefined);
  expect(root.hidden).toBe(true);
  expect(root.querySelectorAll('article')).toHaveLength(0);
});
it('labels outgoing requests accurately and clears closed view content without losing retained observations', () => {
  const { root } = setup();
  runtime!.echo('alice', 'hello', 'request-id');
  view!.open();
  expect(root.textContent).toContain('Requested → alice');
  view!.close();
  expect(root.querySelectorAll('article')).toHaveLength(0);
  expect(runtime!.messages).toHaveLength(1);
  view!.open();
  expect(root.textContent).toContain('hello');
});
