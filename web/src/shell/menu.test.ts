// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { closeMenus, openMenu } from './menu';
afterEach(() => {
  closeMenus();
  document.body.replaceChildren();
});
it('keeps a modal placement menu inside the dialog so its actions are not inert', () => {
  const dialog = document.createElement('dialog');
  const anchor = document.createElement('button');
  dialog.append(anchor);
  document.body.append(dialog);
  dialog.showModal();
  const run = vi.fn();
  const menu = openMenu(anchor, [{ items: [{ label: 'Dock left', run }] }]);
  expect(menu.parentElement).toBe(dialog);
  menu.querySelector<HTMLButtonElement>('button')!.click();
  expect(run).toHaveBeenCalledOnce();
  expect(menu.isConnected).toBe(false);
});
