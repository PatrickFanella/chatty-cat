// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { RulePanel } from './rules-ui';
import { RuleRuntime } from './rules-runtime';
let panel: RulePanel | undefined;
let runtime: RuleRuntime | undefined;
afterEach(() => {
  panel?.stop();
  runtime?.stop();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});
it('requires a matching preview before applying rules, reports storage failures and enforces overnight quiet hours', () => {
  document.body.innerHTML = '<button id="commands-open"></button>';
  const changed = vi.fn();
  runtime = new RuleRuntime(changed);
  panel = new RulePanel(runtime);
  const field = (id: string) => panel!.root.querySelector<HTMLInputElement>('#rule-' + id)!;
  field('name').value = 'Greeting';
  field('pattern').value = 'hello';
  const click = (a: string) => panel!.root.querySelector<HTMLButtonElement>('[data-action=' + a + ']')!.click();
  click('save');
  expect(panel.engine.rules).toHaveLength(0);
  click('preview');
  expect(panel.root.querySelector('#rule-result')?.textContent).toContain('Highlighted');
  click('save');
  expect(panel.engine.rules).toHaveLength(1);
  expect(localStorage.getItem('chatthing:v1:rules')).toContain('Greeting');
  runtime.preferences = { muted: false, quietStart: 22, quietEnd: 7 };
  expect(runtime.alertsAllowed(new Date(2026, 0, 1, 23))).toBe(false);
  expect(runtime.alertsAllowed(new Date(2026, 0, 1, 12))).toBe(true);
  const saved = localStorage.getItem('chatthing:v1:rules');
  vi.stubGlobal('localStorage', {
    getItem: () => saved,
    setItem: () => {
      throw new Error('Quota');
    },
  });
  click('preferences');
  expect(panel.root.querySelector('#rule-status')?.textContent).toBe('Quota');
  vi.unstubAllGlobals();
});

it('restores runtime rules and portable settings without constructing an editor', () => {
  const value = { version: 1, rules: [], preferences: { muted: true, quietStart: 0, quietEnd: 0 } };
  localStorage.setItem('chatthing:v1:rules', JSON.stringify(value));
  runtime = new RuleRuntime(vi.fn());
  expect(runtime.alertsAllowed()).toBe(false);
  expect(document.querySelector('dialog')).toBeNull();
  const detail: Record<string, unknown> = {};
  document.dispatchEvent(new CustomEvent('capture-settings', { detail }));
  expect(detail.rules).toMatchObject(value);
  document.dispatchEvent(
    new CustomEvent('restore-settings', { detail: { rules: { ...value, preferences: { muted: false } } } }),
  );
  expect(runtime.alertsAllowed()).toBe(true);
  expect(document.querySelector('dialog')).toBeNull();
});
