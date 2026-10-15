// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { PresentationPanel } from './presentation-ui';
import { presentationDefaults, setPresentation } from './presentation';
import { setProfileScope, profileKey } from './account-profiles';
let panel: PresentationPanel | undefined;
afterEach(() => {
  panel?.stop();
  panel = undefined;
  setPresentation({ ...presentationDefaults });
  setProfileScope('anonymous');
  localStorage.clear();
  document.body.replaceChildren();
  document.documentElement.style.removeProperty('--overlay-background-alpha');
  document.documentElement.style.removeProperty('--overlay-content-shadow');
});
it('previews and cancels overlay rendering independently, then saves it in the current public profile', () => {
  setProfileScope('42');
  panel = new PresentationPanel(() => {});
  panel.trigger.click();
  const input = (id: string) => panel!.root.querySelector<HTMLInputElement>('#presentation-' + id)!;
  const click = (name: string) =>
    Array.from(panel!.root.querySelectorAll('button'))
      .find((b) => b.textContent === name)!
      .click();
  input('overlayBackgroundOpacity').value = '128';
  input('overlayShadow').checked = true;
  input('overlayShadowColor').value = '#123456';
  click('Preview');
  expect(document.documentElement.style.getPropertyValue('--overlay-background-alpha')).toBe('50.19607843137255%');
  expect(document.documentElement.style.getPropertyValue('--overlay-content-shadow')).toContain('rgba(18,52,86,1)');
  click('Cancel');
  expect(document.documentElement.style.getPropertyValue('--overlay-background-alpha')).toBe('0%');
  expect(document.documentElement.style.getPropertyValue('--overlay-content-shadow')).toBe('none');
  panel.trigger.click();
  input('overlayBackgroundOpacity').value = '128';
  click('Apply');
  expect(JSON.parse(localStorage.getItem(profileKey('chatthing:v1:presentation'))!).overlayBackgroundOpacity).toBe(128);
  expect(document.documentElement.style.opacity).toBe('');
});
