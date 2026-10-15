// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { parseExtension, ExtensionStore } from './extensions';
import { setProfileScope } from './account-profiles';
export const manifest = {
  format: 'chatty-cat-extension',
  version: 1,
  id: 'channel-note',
  name: 'Channel note',
  permissions: ['context:channel', 'input:text'],
  commands: [{ id: 'note', title: 'Format note', template: 'Note for #{{channel}}: {{input}}' }],
  views: [],
};
afterEach(() => {
  localStorage.clear();
  setProfileScope('anonymous');
});
it('rejects code/private/native capabilities, undeclared context and malformed contributions', () => {
  expect(parseExtension(manifest).id).toBe('channel-note');
  for (const value of [
    { ...manifest, script: 'fetch("/api/auth/session")' },
    { ...manifest, permissions: ['tokens:read'] },
    { ...manifest, permissions: [] },
    { ...manifest, commands: [{ id: 'bad', title: 'Bad', template: '{{token}}' }] },
    { ...manifest, commands: Array(17).fill(manifest.commands[0]) },
  ])
    expect(() => parseExtension(value)).toThrow();
});
it('installs disabled, requires explicit enable and isolates each account with stale-write refusal', () => {
  setProfileScope('42');
  const one = new ExtensionStore('42');
  one.install(parseExtension(manifest));
  expect(one.all()[0]?.enabled).toBe(false);
  const old = new ExtensionStore('42');
  one.enable('channel-note', true);
  expect(() => old.remove('channel-note')).toThrow('another tab');
  setProfileScope('43');
  expect(new ExtensionStore('43').all()).toEqual([]);
  expect(() => one.all()).toThrow('account');
  setProfileScope('42');
  one.remove('channel-note');
  expect(one.all()).toEqual([]);
});
