// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { InboxPanel } from './inbox-ui';
import type { ChatMessage } from './protocol';
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  localStorage.clear();
});
it('jumps to public context without changing send target and clears private items on account switch', () => {
  const workspace = document.createElement('button');
  workspace.id = 'workspace-open';
  const target = document.createElement('select');
  target.id = 'send-channel';
  target.innerHTML = '<option value="other">other</option>';
  document.body.append(workspace, target);
  const jump = vi.fn(),
    answer = vi.fn(),
    panel = new InboxPanel(['room', 'other'], jump, answer);
  panel.setAccount('42', 'viewer');
  const message: ChatMessage = {
    id: 'public',
    command: 'PRIVMSG',
    channel: 'room',
    login: 'alice',
    text: '@viewer hello',
    timestamp: 1000,
    tags: {},
  };
  panel.observe(message);
  document.getElementById('inbox-open')!.click();
  document.querySelector<HTMLButtonElement>('[data-inbox-action=jump]')!.click();
  expect(jump).toHaveBeenCalledWith(expect.objectContaining({ id: 'public', channel: 'room' }));
  expect(target.value).toBe('other');
  panel.whisper({ ...message, id: 'private', command: 'WHISPER', channel: '', text: 'secret body' }, false);
  document.getElementById('inbox-open')!.click();
  const section = document.getElementById('inbox-section') as HTMLSelectElement;
  section.value = 'whispers';
  section.dispatchEvent(new Event('change', { bubbles: true }));
  expect(document.getElementById('inbox-items')!.textContent).toContain('secret body');
  panel.setAccount('43', 'another');
  expect(document.getElementById('inbox-items')!.textContent).toBe('');
  document.getElementById('inbox-open')!.click();
  expect(document.getElementById('inbox-items')!.textContent).not.toContain('secret body');
  panel.stop();
});

it('keeps public context jumps available when read-state storage is denied', () => {
  const workspace = document.createElement('button');
  workspace.id = 'workspace-open';
  document.body.append(workspace);
  const jump = vi.fn(),
    panel = new InboxPanel(['room'], jump, vi.fn());
  panel.setAccount('42', 'viewer');
  panel.observe({
    id: 'one',
    command: 'PRIVMSG',
    channel: 'room',
    login: 'alice',
    text: '@viewer hello',
    timestamp: 1,
    tags: {},
  });
  document.getElementById('inbox-open')!.click();
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
  });
  document.querySelector<HTMLButtonElement>('[data-inbox-action=jump]')!.click();
  expect(jump).toHaveBeenCalled();
  panel.stop();
});
