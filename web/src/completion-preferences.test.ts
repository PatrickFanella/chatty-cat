// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { setProfileScope } from './account-profiles';
import {
  completionDefaults,
  parseCompletionPreferences,
  CompletionPreferenceStore,
  setCompletionPreferences,
  getLocalNickname,
  getCompletionPreferences,
  restoreCompletionPreferences,
} from './completion-preferences';
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setProfileScope('anonymous');
  setCompletionPreferences(completionDefaults);
});
it('validates nickname/priority bounds, duplicate logins and excludes unknown credential fields', () => {
  expect(
    parseCompletionPreferences({
      ...completionDefaults,
      aliases: [{ login: 'Alice', alias: 'Friend', token: 'secret' }],
      token: 'secret',
    }),
  ).toMatchObject({ aliases: [{ login: 'alice', alias: 'Friend' }] });
  expect(() =>
    parseCompletionPreferences({
      ...completionDefaults,
      aliases: [
        { login: 'alice', alias: 'one' },
        { login: 'ALICE', alias: 'two' },
      ],
    }),
  ).toThrow(/Duplicate/);
  expect(() =>
    parseCompletionPreferences({ ...completionDefaults, aliases: [{ login: 'bad login', alias: 'one' }] }),
  ).toThrow(/nickname/);
  expect(() => parseCompletionPreferences({ ...completionDefaults, emotePriority: Array(65).fill('Kappa') })).toThrow(
    /64/,
  );
});
it('isolates saved preferences and rejects account changes, stale writes and quota failure', () => {
  setProfileScope('42');
  const store = new CompletionPreferenceStore();
  store.save({ ...completionDefaults, aliases: [{ login: 'alice', alias: 'Friend' }] });
  setProfileScope('43');
  expect(new CompletionPreferenceStore().read().aliases).toEqual([]);
  expect(() => store.save(completionDefaults)).toThrow(/Account changed/);
  setProfileScope('42');
  localStorage.setItem('chatthing:v1:profile:42:completion-preferences', 'null');
  expect(() => store.save(completionDefaults)).toThrow(/another tab/);
  const fresh = new CompletionPreferenceStore();
  vi.stubGlobal('localStorage', {
    getItem: () => 'null',
    setItem: () => {
      throw new Error('quota');
    },
  });
  expect(() => fresh.save(completionDefaults)).toThrow(/quota/);
});
it('keeps local annotations separate from login identity', () => {
  setCompletionPreferences({ ...completionDefaults, aliases: [{ login: 'alice', alias: 'Friend' }] });
  expect(getLocalNickname('ALICE')).toBe('Friend');
  expect(getLocalNickname('unknown')).toBeUndefined();
});
it('restores saved completion behavior before any editor exists and clears stale account state on invalid storage', () => {
  setProfileScope('42');
  new CompletionPreferenceStore().save({
    ...completionDefaults,
    spellcheck: true,
    aliases: [{ login: 'alice', alias: 'Friend' }],
  });
  restoreCompletionPreferences();
  expect(getLocalNickname('alice')).toBe('Friend');
  expect(getCompletionPreferences().spellcheck).toBe(true);
  expect(document.querySelector('#completion-preferences-panel')).toBeNull();
  setProfileScope('43');
  localStorage.setItem('chatthing:v1:profile:43:completion-preferences', '{broken');
  expect(() => restoreCompletionPreferences()).toThrow();
  expect(getLocalNickname('alice')).toBeUndefined();
  expect(getCompletionPreferences().spellcheck).toBe(false);
  expect(localStorage.getItem('chatthing:v1:profile:43:completion-preferences')).toBe('{broken');
});
