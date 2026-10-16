// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { PresentationPanel } from './presentation-ui';
import { PresentationRuntime } from './presentation-runtime';
import { getPresentation, setPresentation, presentationDefaults } from './presentation';
let panel: PresentationPanel | undefined;
let runtime: PresentationRuntime | undefined;
afterEach(() => {
  panel?.stop();
  runtime?.stop();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
  setPresentation({ ...presentationDefaults });
});
it('previews without saving, cancels reversibly, clamps values and reports failed storage without changing saved preferences', () => {
  document.body.innerHTML = '<button id="display-open"></button>';
  runtime = new PresentationRuntime(vi.fn());
  panel = new PresentationPanel(runtime);
  const field = panel.root.querySelector<HTMLInputElement>('#presentation-collapseLines')!,
    click = (text: string) => [...panel!.root.querySelectorAll('button')].find((b) => b.textContent === text)!.click();
  field.value = '9';
  click('Preview');
  expect(getPresentation().collapseLines).toBe(9);
  expect(localStorage.getItem('chatthing:v1:presentation')).toBeNull();
  panel.root.dispatchEvent(new Event('close'));
  expect(getPresentation().collapseLines).toBe(0);
  field.value = '999';
  click('Apply');
  expect(getPresentation().collapseLines).toBe(20);
  const raw = localStorage.getItem('chatthing:v1:presentation');
  vi.stubGlobal('localStorage', {
    getItem: () => raw,
    setItem: () => {
      throw new Error('Quota');
    },
  });
  field.value = '4';
  click('Apply');
  expect(getPresentation().collapseLines).toBe(20);
  expect(panel.root.querySelector('#presentation-status')?.textContent).toBe('Quota');
});

it('applies saved presentation without an editor and ignores editor cancellation after runtime teardown', () => {
  localStorage.setItem('chatthing:v1:presentation', JSON.stringify({ ...presentationDefaults, collapseLines: 8 }));
  const changed = vi.fn();
  runtime = new PresentationRuntime(changed);
  expect(getPresentation().collapseLines).toBe(8);
  expect(document.querySelector('dialog')).toBeNull();
  runtime.stop();
  changed.mockClear();
  const event = vi.fn();
  document.addEventListener('presentationchange', event);
  runtime.cancel();
  expect(changed).not.toHaveBeenCalled();
  expect(event).not.toHaveBeenCalled();
  document.removeEventListener('presentationchange', event);
});
