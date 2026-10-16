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

it('searches across groups without discarding edited controls and restores every section when cleared', () => {
  runtime = new PresentationRuntime(vi.fn());
  panel = new PresentationPanel(runtime);
  const search = panel.root.querySelector<HTMLInputElement>('input[type="search"]')!;
  const edited = panel.root.querySelector<HTMLInputElement>('#presentation-collapseLines')!;
  edited.value = '7';
  search.value = 'shadow';
  search.dispatchEvent(new Event('input'));
  const visible = [...panel.root.querySelectorAll<HTMLFieldSetElement>('fieldset')].filter((group) => !group.hidden);
  expect(visible.map((group) => group.querySelector('legend')?.textContent)).toEqual(['Overlay']);
  expect(panel.root.querySelector('#presentation-collapseLines')).toBe(edited);
  search.value = '';
  search.dispatchEvent(new Event('input'));
  expect([...panel.root.querySelectorAll<HTMLFieldSetElement>('fieldset')].every((group) => !group.hidden)).toBe(true);
  expect(edited.value).toBe('7');
  [...panel.root.querySelectorAll('button')].find((b) => b.textContent === 'Preview')!.click();
  expect(getPresentation().collapseLines).toBe(7);
  expect(localStorage.getItem('chatthing:v1:presentation')).toBeNull();
});
