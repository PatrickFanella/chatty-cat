// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { setProfileScope, profileKey } from './account-profiles';
import { recordOverlayActivation } from './overlay-onboarding';
afterEach(() => {
  localStorage.clear();
  setProfileScope('anonymous');
});
it('records first activation per account and retains malformed data', () => {
  setProfileScope('42');
  expect(recordOverlayActivation('42')).toBe(true);
  expect(recordOverlayActivation('42')).toBe(false);
  setProfileScope('43');
  expect(() => recordOverlayActivation('42')).toThrow('account');
  expect(recordOverlayActivation('43')).toBe(true);
  const key = profileKey('chatthing:v1:overlay-onboarding');
  localStorage.setItem(key, 'unreadable');
  expect(recordOverlayActivation('43')).toBe(true);
  expect(localStorage.getItem(key)).toBe('unreadable');
});
