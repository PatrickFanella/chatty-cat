// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { UserInspector } from './inspector';
import { messageRow } from './render';
import type { ChatMessage } from './protocol';
const message: ChatMessage = {
  id: 'msg-id',
  channel: 'hasanabi',
  login: 'alice',
  text: 'hello',
  command: 'PRIVMSG',
  timestamp: 1,
  tags: { 'display-name': 'Alice' },
};
const auth = {
  enabled: true,
  authenticated: true,
  loginURL: 'https://chat.subcult.tv/api/auth/login',
  login: 'viewer',
  userID: '42',
  csrf: 'csrf',
  commandPermissions: ['moderator:manage:banned_users', 'moderator:manage:chat_messages'],
};
let inspector: UserInspector | undefined;
function setup(signed = true) {
  const dialog = document.createElement('dialog');
  dialog.innerHTML =
    '<button data-close>Close</button><h2></h2><a data-profile></a><p data-facts></p><blockquote data-text></blockquote><button data-reply>Reply</button><button data-command="timeout">Timeout</button><button data-command="ban">Ban</button><button data-command="delete">Delete</button><button data-confirm hidden></button><p role="status"></p>';
  const log = document.createElement('main');
  log.append(messageRow(message));
  document.body.append(log, dialog);
  const reply = vi.fn();
  inspector = new UserInspector(
    dialog,
    log,
    () => [message],
    () => (signed ? auth : undefined),
    reply,
  );
  log.querySelector<HTMLAnchorElement>('.name')!.click();
  return { dialog, log, reply };
}
afterEach(() => {
  inspector?.stop();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
it('shows user context and leaves moderation disabled for anonymous viewing', () => {
  const { dialog } = setup(false);
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector('h2')?.textContent).toBe('Alice');
  expect(dialog.querySelector('[data-facts]')?.textContent).toContain('1 retained messages');
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-command]')) expect(button.disabled).toBe(true);
});
it('stages a command and sends only after confirmation with session CSRF and channel', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sent: true, command: true }) });
  vi.stubGlobal('fetch', fetcher);
  const { dialog } = setup();
  dialog.querySelector<HTMLButtonElement>('[data-command=timeout]')!.click();
  expect(fetcher).not.toHaveBeenCalled();
  expect(dialog.querySelector('[role=status]')?.textContent).toBe('/timeout alice 600');
  dialog.querySelector<HTMLButtonElement>('[data-confirm]')!.click();
  await vi.waitFor(() => expect(dialog.querySelector('[role=status]')?.textContent).toBe('Command completed'));
  const options = fetcher.mock.calls[0]?.[1] as RequestInit;
  expect(options.headers).toEqual({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf' });
  expect(JSON.parse(options.body as string)).toMatchObject({ channel: 'hasanabi', message: '/timeout alice 600' });
  expect(JSON.parse(options.body as string)).not.toHaveProperty('moderator_id');
});
it('reuses a request identifier after an ambiguous result', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ sent: true, command: true }) });
  vi.stubGlobal('fetch', fetcher);
  const { dialog } = setup();
  dialog.querySelector<HTMLButtonElement>('[data-command=ban]')!.click();
  dialog.querySelector<HTMLButtonElement>('[data-confirm]')!.click();
  await vi.waitFor(() =>
    expect(dialog.querySelector('[role=status]')?.textContent).toContain('could not be confirmed'),
  );
  dialog.querySelector<HTMLButtonElement>('[data-confirm]')!.click();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body).requestID).toBe(
    JSON.parse(fetcher.mock.calls[1]?.[1].body).requestID,
  );
});
it('arms a reply and preserves modified clicks for Twitch profiles', () => {
  const { dialog, log, reply } = setup();
  dialog.querySelector<HTMLButtonElement>('[data-reply]')!.click();
  expect(reply).toHaveBeenCalledWith(message);
  expect(dialog.open).toBe(false);
  log
    .querySelector('.name')!
    .dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true, cancelable: true }));
  expect(dialog.open).toBe(false);
});
it('closes account context and aborts an old command without applying its late result', async () => {
  let finish: ((value: Response) => void) | undefined;
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn((_input: string, options: RequestInit) => {
      signal = options.signal as AbortSignal;
      return new Promise<Response>((r) => {
        finish = r;
      });
    }),
  );
  const x = setup();
  inspector!.setAccount('42');
  inspector!.openUser('alice', 'hasanabi');
  x.dialog.querySelector<HTMLButtonElement>('[data-command=timeout]')!.click();
  x.dialog.querySelector<HTMLButtonElement>('[data-confirm]')!.click();
  inspector!.setAccount('43');
  expect(signal?.aborted).toBe(true);
  expect(x.dialog.open).toBe(false);
  finish?.(new Response(JSON.stringify({ sent: true, command: true })));
  await new Promise((r) => setTimeout(r, 0));
  expect(x.dialog.querySelector('[role=status]')?.textContent).not.toBe('Command completed');
});
