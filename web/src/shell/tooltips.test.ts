// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountTooltips } from './tooltips';
import { presentationDefaults, setPresentation } from '../presentation';
let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  document.body.replaceChildren();
  setPresentation({ ...presentationDefaults });
  vi.useRealTimers();
});
it('uses the configured delay, then shows immediately on focus inside an open dialog', () => {
  vi.useFakeTimers();
  const dialog = document.createElement('dialog');
  dialog.open = true;
  const button = document.createElement('button');
  button.title = 'Explanation';
  button.setAttribute('aria-describedby', 'existing');
  dialog.append(button);
  document.body.append(dialog);
  stop = mountTooltips();
  button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  vi.advanceTimersByTime(100);
  expect(document.querySelector('[role=tooltip]')).toBeNull();
  button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  const tip = dialog.querySelector('[role=tooltip]')!;
  expect(tip.textContent).toBe('Explanation');
  expect(button.getAttribute('aria-describedby')).toContain(tip.id);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(document.querySelector('[role=tooltip]')).toBeNull();
  expect(button.title).toBe('Explanation');
  expect(button.getAttribute('aria-describedby')).toBe('existing');
});
it('cancels delayed help on departure and removes visible help on privacy change', () => {
  vi.useFakeTimers();
  const button = document.createElement('button');
  button.title = 'Help';
  document.body.append(button);
  stop = mountTooltips();
  button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  button.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
  vi.advanceTimersByTime(200);
  expect(document.querySelector('[role=tooltip]')).toBeNull();
  button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  vi.advanceTimersByTime(150);
  expect(document.querySelector('[role=tooltip]')).not.toBeNull();
  document.dispatchEvent(new Event('privacychange'));
  expect(document.querySelector('[role=tooltip]')).toBeNull();
});
