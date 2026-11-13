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

function shellDom(): void {
  document.body.innerHTML =
    '<header><span class="brand">Chatty Cat</span><span id="status"></span><span id="rate"></span>' +
    '<button id="login">Log in</button><span id="account"></span><div id="joined-channels"></div>' +
    '<form id="channels"></form></header><footer></footer>';
}

it('Ctrl+, opens settings', async () => {
  shellDom();
  const { startShell } = await import('./shell');
  const openSettings = vi.fn();
  const shell = startShell({ actions: [], run: vi.fn(), available: () => true, extra: () => [], openSettings });
  try {
    const plain = new KeyboardEvent('keydown', { code: 'Comma', ctrlKey: true, cancelable: true, bubbles: true });
    document.dispatchEvent(plain);
    expect(openSettings).toHaveBeenCalledOnce();
    expect(plain.defaultPrevented).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Comma', metaKey: true, bubbles: true }));
    expect(openSettings).toHaveBeenCalledTimes(2);
    for (const modifiers of [{ ctrlKey: true, altKey: true }, { ctrlKey: true, shiftKey: true }, {}])
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Comma', ...modifiers, bubbles: true }));
    expect(openSettings).toHaveBeenCalledTimes(2);
  } finally {
    shell.stop();
  }
});

it('the Settings… command is registered', async () => {
  shellDom();
  const { startShell } = await import('./shell');
  const openSettings = vi.fn();
  const shell = startShell({ actions: [], run: vi.fn(), available: () => true, extra: () => [], openSettings });
  try {
    const command = shell.registry.get('settings:open');
    expect(command?.label).toBe('Settings…');
    expect(command?.group).toBe('view');
    expect(command?.hint).toMatch(/^(Ctrl\+,|⌘,)$/);
    document.getElementById('shell-settings')!.click();
    expect(openSettings).toHaveBeenCalledOnce();
  } finally {
    shell.stop();
  }
});

it('privacy mode disables the Settings command and Ctrl+,', async () => {
  shellDom();
  const { startShell } = await import('./shell');
  const openSettings = vi.fn();
  const shell = startShell({ actions: [], run: vi.fn(), available: () => true, extra: () => [], openSettings });
  localStorage.setItem(
    'chatty-cat:v1:privacy',
    JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }),
  );
  try {
    expect(shell.registry.get('settings:open')?.available?.()).toBe(false);
    const event = new KeyboardEvent('keydown', { code: 'Comma', ctrlKey: true, cancelable: true, bubbles: true });
    document.dispatchEvent(event);
    expect(openSettings).not.toHaveBeenCalled();
    localStorage.removeItem('chatty-cat:v1:privacy');
    expect(shell.registry.get('settings:open')?.available?.()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Comma', ctrlKey: true, bubbles: true }));
    expect(openSettings).toHaveBeenCalledOnce();
  } finally {
    localStorage.removeItem('chatty-cat:v1:privacy');
    shell.stop();
  }
});

it('readonly views have no Settings command or shortcut', async () => {
  shellDom();
  const { startShell } = await import('./shell');
  const shell = startShell({ actions: [], run: vi.fn(), available: () => true, extra: () => [] });
  try {
    expect(shell.registry.get('settings:open')).toBeUndefined();
    expect(document.getElementById('shell-settings')?.hidden).toBe(true);
    const event = new KeyboardEvent('keydown', { code: 'Comma', ctrlKey: true, cancelable: true, bubbles: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  } finally {
    shell.stop();
  }
});

it('opens the lazy emote picker from the visible button while signed out', async () => {
  shellDom();
  const picker = document.createElement('button');
  picker.id = 'picker-open';
  document.body.append(picker);
  const { startShell } = await import('./shell');
  const run = vi.fn();
  let available = true;
  const shell = startShell({ actions: [], run, available: () => available, extra: () => [] });
  try {
    picker.click();
    expect(run).toHaveBeenCalledWith('emotes');
    available = false;
    picker.click();
    expect(run).toHaveBeenCalledOnce();
  } finally {
    shell.stop();
  }
  picker.click();
  expect(run).toHaveBeenCalledOnce();
});
