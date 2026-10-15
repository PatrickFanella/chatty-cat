// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { UserNotesPanel } from './user-notes-ui';
let panel: UserNotesPanel | undefined;
afterEach(() => {
  panel?.stop();
  document.body.replaceChildren();
  localStorage.clear();
});
function setup() {
  document.body.innerHTML = '<button id="account-profiles-open"></button>';
  panel = new UserNotesPanel();
  panel.setAccount('42');
  const editor = panel.editor('100', 'alice')!;
  document.body.append(editor);
  const input = editor.querySelector('textarea')!,
    save = [...editor.querySelectorAll('button')].find((b) => b.textContent === 'Save private user note')!;
  const button = (name: string) => [...panel!.root.querySelectorAll('button')].find((b) => b.textContent === name)!;
  return { editor, input, save, button };
}
it('renders bounded plain text, reviews backups and requires a separate reviewed bulk deletion', () => {
  const x = setup();
  x.input.value = '<script>private sentinel</script>';
  x.save.click();
  expect(x.editor.querySelector('script')).toBeNull();
  document.querySelector<HTMLButtonElement>('#user-notes-open')!.click();
  x.button('Preview private user notes backup').click();
  expect(panel!.root.querySelector('pre')?.textContent).toContain('private sentinel');
  expect(x.button('Download reviewed user notes').disabled).toBe(false);
  x.button('Delete reviewed user notes').click();
  expect(localStorage.getItem('chatthing:v1:user-notes:42')).toContain('private sentinel');
  x.button('Preview delete all user notes').click();
  x.button('Delete reviewed user notes').click();
  expect(JSON.parse(localStorage.getItem('chatthing:v1:user-notes:42')!).notes).toEqual([]);
  expect(x.button('Download reviewed user notes').disabled).toBe(true);
});
it('clears private transfer state on account/privacy changes and refuses stale editor actions', () => {
  const x = setup();
  x.input.value = 'alice private';
  x.save.click();
  x.button('Preview private user notes backup').click();
  panel!.setAccount('43');
  x.input.value = 'stale action';
  x.save.click();
  expect(localStorage.getItem('chatthing:v1:user-notes:43')).toBeNull();
  expect(localStorage.getItem('chatthing:v1:user-notes:42')).toContain('alice private');
  expect(panel!.root.querySelector('pre')?.textContent).toBe('');
  panel!.setAccount('42');
  document.querySelector<HTMLButtonElement>('#user-notes-open')!.click();
  x.button('Preview private user notes backup').click();
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  expect(panel!.root.open).toBe(false);
  expect(panel!.root.textContent).not.toContain('alice private');
  expect(x.button('Download reviewed user notes').disabled).toBe(true);
});
it('ignores a delayed private import preview after an account change', async () => {
  const x = setup();
  let finish: ((value: string) => void) | undefined;
  const input = panel!.root.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [
      {
        size: 100,
        text: () =>
          new Promise<string>((r) => {
            finish = r;
          }),
      },
    ],
  });
  input.dispatchEvent(new Event('change'));
  panel!.setAccount('43');
  finish?.(
    JSON.stringify({
      format: 'chatty-cat-user-notes',
      version: 1,
      account: '42',
      notes: [{ id: '100', login: 'alice', text: 'private delayed sentinel', updated: 1 }],
    }),
  );
  await new Promise((r) => setTimeout(r, 0));
  expect(x.button('Import reviewed user notes').disabled).toBe(true);
  expect(panel!.root.textContent).not.toContain('private delayed sentinel');
  expect(localStorage.getItem('chatthing:v1:user-notes:43')).toBeNull();
});
