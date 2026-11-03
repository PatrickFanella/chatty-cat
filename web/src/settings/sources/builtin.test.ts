// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import type { SettingsHost } from '../host';
import { builtinSections } from './builtin';

const flush = () => new Promise((r) => setTimeout(r, 0));
const section = (host: Partial<SettingsHost>, id: string) =>
  builtinSections(host as SettingsHost).find((s) => s.id === id)!;

it('builtin sections are private', () => {
  expect(builtinSections({} as SettingsHost).every((s) => s.private)).toBe(true);
});

it('builtin alert test shows the attention result', async () => {
  const el = document.createElement('div');
  const test = vi.fn().mockResolvedValue('Alert sent');
  const dispose = await section({ attention: { permission: vi.fn(), test } }, 'builtin.alerts').mount(el);
  el.querySelector('button')!.click();
  await flush();
  expect(el.querySelector('[role=status]')!.textContent).toBe('Alert sent');
  dispose();
  expect(el.children).toHaveLength(0);
});

it('builtin moderation opens the workspace', async () => {
  const el = document.createElement('div');
  const openPanel = vi.fn();
  await section({ openPanel }, 'builtin.moderation').mount(el);
  el.querySelector('button')!.click();
  expect(openPanel).toHaveBeenCalledWith('moderation-workspace');
});

it('builtin provider reload reports throttling', async () => {
  const el = document.createElement('div');
  const reloadProviders = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
  const dispose = await section({ reloadProviders, providerStatus: () => 'Events ok' }, 'builtin.providers').mount(el);
  expect(el.textContent).toContain('Events ok');
  const click = () => el.querySelector('button')!.click();
  click();
  expect(el.querySelector('[role=status]')!.textContent).toBe(
    'Reload requested; existing server cache remains in effect.',
  );
  click();
  expect(el.querySelector('[role=status]')!.textContent).toBe('Wait 30 seconds between reload requests.');
  dispose();
  expect(el.children).toHaveLength(0);
});
