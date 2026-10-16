// @vitest-environment happy-dom
import { readFileSync, readdirSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
it('provides shell controls and lazy templates without eager panel markup', () => {
  const html = readFileSync(process.cwd() + '/index.html', 'utf8');
  const main = readFileSync(process.cwd() + '/src/main.ts', 'utf8');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network disabled in shell contract test')));
  const dom = new DOMParser().parseFromString(html.replace(/<link[^>]+href="https:[^>]+>/g, ''), 'text/html');
  const ids = [...main.matchAll(/element\('([^']+)'\s*,/g)].map((match) => match[1]!);
  const templates = readdirSync(process.cwd() + '/src/panel-templates')
    .filter((name) => name.endsWith('.html'))
    .map((name) => readFileSync(process.cwd() + '/src/panel-templates/' + name, 'utf8'))
    .join('');
  const complete = new DOMParser().parseFromString(html + templates, 'text/html');
  for (const id of ids) expect(complete.getElementById(id), `Missing shell or lazy control: ${id}`).not.toBeNull();
  expect(dom.querySelectorAll('dialog,section[role=dialog],aside[role=dialog]')).toHaveLength(0);
  for (const id of [
    'display-panel',
    'stats-panel',
    'video-panel',
    'archive-search',
    'workspace-panel',
    'user-inspector',
    'resources-panel',
    'emote-picker',
    'whisper-panel',
  ])
    expect(dom.getElementById(id)).toBeNull();
  const all = [...dom.querySelectorAll('[id]')].map((element) => element.id);
  expect(new Set(all).size).toBe(all.length);
});
