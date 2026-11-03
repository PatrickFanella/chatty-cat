// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { CommandPalette, type PaletteEntry } from './palette';
import { CommandRegistry } from './registry';

afterEach(() => document.body.replaceChildren());

it('refresh repaints an open palette with late entries', () => {
  const late: PaletteEntry[] = [];
  const palette = new CommandPalette(new CommandRegistry(), () => late);
  palette.show();
  const labels = (): string[] =>
    [...document.querySelectorAll('.shell-palette-label')].map((label) => label.textContent ?? '');
  expect(labels()).not.toContain('Settings: General');
  late.push({ id: 'settings:page:general', label: 'Settings: General', context: 'settings', run: () => {} });
  palette.refresh();
  expect(labels()).toContain('Settings: General');
  palette.stop();
});

it('refresh does nothing while the palette is closed', () => {
  const palette = new CommandPalette(new CommandRegistry(), () => []);
  expect(() => palette.refresh()).not.toThrow();
  expect(document.getElementById('shell-palette')).toBeNull();
  palette.stop();
});
