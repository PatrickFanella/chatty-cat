// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { AccountProfiles, profileKey, setProfileScope } from './account-profiles';
afterEach(() => {
  localStorage.clear();
  setProfileScope('anonymous');
});
it('remembers only validated public identity metadata, bounds profiles and preserves other accounts', () => {
  const store = new AccountProfiles();
  store.remember('42', 'alice');
  store.remember('43', 'bob');
  store.remember('42', 'renamed');
  expect(store.list()).toEqual([
    { id: '42', login: 'renamed' },
    { id: '43', login: 'bob' },
  ]);
  store.forget('43');
  expect(new AccountProfiles().list()).toEqual([{ id: '42', login: 'renamed' }]);
  expect(() => store.remember('bad', 'alice')).toThrow();
  for (let i = 100; i < 107; i++) store.remember(String(i), 'user');
  expect(() => store.remember('108', 'user')).toThrow('eight');
});
it('refuses malformed stored profiles and stale registry writes without replacing existing data', () => {
  localStorage.setItem('chatthing:v1:account-profiles', 'broken');
  expect(() => new AccountProfiles().list()).toThrow();
  localStorage.clear();
  const a = new AccountProfiles(),
    b = new AccountProfiles();
  a.remember('42', 'alice');
  expect(() => b.remember('43', 'bob')).toThrow('changed');
  expect(new AccountProfiles().list()).toEqual([{ id: '42', login: 'alice' }]);
});
it('keeps preferences in fixed account scopes without copying legacy or another profile', () => {
  expect(profileKey('chatthing:v1:display')).toBe('chatthing:v1:display');
  setProfileScope('42');
  const alice = profileKey('chatthing:v1:display');
  localStorage.setItem(alice, 'alice');
  setProfileScope('43');
  expect(localStorage.getItem(profileKey('chatthing:v1:display'))).toBeNull();
  setProfileScope('42');
  expect(localStorage.getItem(profileKey('chatthing:v1:display'))).toBe('alice');
});
