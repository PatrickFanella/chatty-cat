// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
it('provides every required startup control in the production HTML shell', () => {
  const html = readFileSync(process.cwd() + '/index.html', 'utf8');
  const main = readFileSync(process.cwd() + '/src/main.ts', 'utf8');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network disabled in shell contract test')));
  const dom = new DOMParser().parseFromString(html.replace(/<link[^>]+href="https:[^>]+>/g, ''), 'text/html');
  const ids = [...main.matchAll(/element\('([^']+)'\s*,/g)].map((match) => match[1]!);
  for (const id of ids) expect(dom.getElementById(id), `Missing startup control: ${id}`).not.toBeNull();
  const all = [...dom.querySelectorAll('[id]')].map((element) => element.id);
  expect(new Set(all).size).toBe(all.length);
});
