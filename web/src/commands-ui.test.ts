// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { CommandPanel } from './commands-ui';
import { CommandRuntime } from './commands-runtime';
import { Composer } from './composer';
import type { CommandContext } from './commands';
afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
it('stages a selected-message action in its channel while preserving the other channel draft', () => {
  const trigger = document.createElement('button');
  trigger.id = 'workspace-open';
  const form = document.createElement('form');
  form.innerHTML =
    '<select id="send-channel"></select><textarea id="message"></textarea><div id="completions" hidden></div><button id="send"></button><span id="message-length"></span><span id="send-status"></span><div id="reply-target"><span id="reply-label"></span><button type="button" id="cancel-reply"></button></div>';
  const inspector = document.createElement('dialog');
  document.body.append(trigger, form, inspector);
  const composer = new Composer(form, ['other', 'room']);
  composer.setAuth({
    enabled: true,
    authenticated: true,
    login: 'viewer',
    userID: '20',
    csrf: 'fixture',
    loginURL: '',
  });
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const input = form.querySelector<HTMLTextAreaElement>('#message')!;
  input.value = 'keep this draft';
  input.dispatchEvent(new Event('input'));
  const context: CommandContext = {
    channel: { name: 'room', id: '10', title: 'Live', game: '' },
    account: { name: 'viewer', id: '20' },
    message: { name: 'alice', id: 'message', text: 'hello' },
    input: '',
  };
  const runtime = new CommandRuntime(composer, (command, invocation) => panel.showPreview(command, invocation));
  const panel = new CommandPanel(composer, () => context, inspector, runtime);
  const set = (id: string, value: string) => {
    document.querySelector<HTMLInputElement>('#command-' + id)!.value = value;
  };
  set('name', 'Timeout');
  set('group', 'Moderation');
  set('trigger', '/short');
  set('body', '/timeout {user.name} 30');
  document.querySelector<HTMLButtonElement>('[data-action=save]')!.click();
  inspector.showModal();
  inspector.addEventListener('close', () => {
    context.message = undefined;
  });
  inspector.querySelector<HTMLButtonElement>('button')!.click();
  set('input', '/short');
  document.querySelector<HTMLButtonElement>('[data-action=preview]')!.click();
  expect(document.querySelector('#command-preview')?.textContent).toBe('/timeout alice 30');
  document.querySelector<HTMLButtonElement>('[data-action=stage]')!.click();
  expect(composer.target).toBe('room');
  expect(input.value).toBe('/timeout alice 30');
  expect(sessionStorage.getItem('chatthing:v1:draft:20:other')).toBe('keep this draft');
  expect(fetcher).not.toHaveBeenCalled();
  panel.stop();
  runtime.stop();
  composer.stop();
});
