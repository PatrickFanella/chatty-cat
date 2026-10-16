// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Workbench } from './workbench';
import { dock, emptyLayout, float } from './layout';
import { showPanel } from './open-panel';

let workbench: Workbench;
function resize(width: number, height: number): void {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
  window.dispatchEvent(new Event('resize'));
}
function panel(id: string): HTMLDialogElement {
  const root = document.createElement('dialog');
  root.id = id;
  root.innerHTML = '<input aria-label="Draft">';
  document.body.append(root);
  workbench.adopt(root, () => root.close());
  return root;
}
async function mutations(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
beforeEach(() => {
  localStorage.clear();
  resize(1280, 800);
  document.body.innerHTML = '<main id="log"></main>';
  workbench = new Workbench({ titleFor: (root) => root.id, exclude: () => false, centre: 'main#log' });
});
afterEach(() => {
  workbench.stop();
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it('combines side docks and floats into a sheet without overwriting desktop geometry or drafts', async () => {
  const left = panel('left-tool'),
    floating = panel('floating-tool');
  const layout = float(
    dock(emptyLayout(), left.id, 'left'),
    floating.id,
    { left: 650, top: 100, width: 480, height: 420 },
    { width: 1280, height: 800 },
  );
  document.dispatchEvent(new CustomEvent('restore-settings', { detail: { workbench: layout } }));
  await mutations();
  const close = vi.fn();
  left.addEventListener('close', close);
  floating.addEventListener('close', close);
  left.querySelector('input')!.value = 'Retained draft';
  const saved = localStorage.getItem('chatthing:v1:workbench');
  resize(390, 844);
  expect(left.closest('.wb-sheet')).not.toBeNull();
  expect(floating.closest('.wb-sheet')).not.toBeNull();
  expect(document.querySelectorAll('.wb-sheet [role="tab"]')).toHaveLength(2);
  const first = document.querySelector<HTMLButtonElement>('[role="tab"]')!;
  first.click();
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(document.activeElement?.id).toBe('wb-tab-floating-tool');
  expect(left.parentElement!.hidden).toBe(true);
  expect(left.parentElement!.inert).toBe(true);
  expect(left.open).toBe(true);
  expect(floating.parentElement!.hidden).toBe(false);
  expect(localStorage.getItem('chatthing:v1:workbench')).toBe(saved);
  resize(1280, 800);
  expect(left.closest('[data-zone]')?.getAttribute('data-zone')).toBe('left');
  expect(floating.parentElement!.dataset.placement).toBe('floating');
  expect(floating.parentElement!.style.left).toBe('650px');
  expect(left.querySelector('input')!.value).toBe('Retained draft');
  expect(left.parentElement!.inert).toBe(false);
  expect(close).not.toHaveBeenCalled();
});
it('opens default dialogs non-modally in portrait, switches on reopen and closes through the feature handler', async () => {
  resize(800, 1000);
  const a = panel('first-tool'),
    b = panel('second-tool');
  const close = vi.fn();
  a.addEventListener('close', close);
  expect(a.open).toBe(false);
  showPanel(a);
  showPanel(b);
  await mutations();
  expect(a.open && b.open).toBe(true);
  expect(b.parentElement!.hidden).toBe(false);
  expect(a.parentElement!.hidden).toBe(true);
  showPanel(a);
  expect(a.parentElement!.hidden).toBe(false);
  a.querySelector('input')!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  await mutations();
  expect(a.open).toBe(false);
  expect(close).toHaveBeenCalledOnce();
  expect(b.parentElement!.hidden).toBe(false);
  expect(b.open).toBe(true);
});
it('uses the sheet for default non-dialog panels and removes it when their feature hides them', async () => {
  resize(600, 800);
  const root = document.createElement('section');
  root.id = 'passive-tool';
  root.hidden = true;
  document.body.append(root);
  workbench.adopt(root, () => {
    root.hidden = true;
  });
  expect(document.querySelector<HTMLElement>('.wb-sheet')!.hidden).toBe(true);
  root.hidden = false;
  await mutations();
  expect(root.closest('.wb-sheet')).not.toBeNull();
  expect(document.querySelector<HTMLElement>('.wb-sheet')!.hidden).toBe(false);
  root.querySelector<HTMLButtonElement>('.wb-close')!.click();
  await mutations();
  expect(document.querySelector<HTMLElement>('.wb-sheet')!.hidden).toBe(true);
});
it('docks a touch title drag into the bottom sheet without detaching its content', async () => {
  resize(390, 844);
  const root = panel('touch-tool');
  showPanel(root);
  await mutations();
  const title = root.querySelector<HTMLElement>('.wb-title')!;
  const input = root.querySelector('input')!;
  input.value = 'Keep this';
  for (const [type, x, y] of [
    ['pointerdown', 50, 450],
    ['pointermove', 90, 490],
    ['pointerup', 90, 490],
  ] as const)
    title.dispatchEvent(
      new PointerEvent(type, { pointerType: 'touch', pointerId: 3, button: 0, clientX: x, clientY: y, bubbles: true }),
    );
  expect(root.closest('.wb-sheet')).not.toBeNull();
  expect(root.querySelector('input')).toBe(input);
  expect(input.value).toBe('Keep this');
  expect(workbench.placementLabel(root.id)).toBe('docked bottom');
  resize(1280, 800);
  expect(root.closest('[data-zone]')?.getAttribute('data-zone')).toBe('bottom');
});
