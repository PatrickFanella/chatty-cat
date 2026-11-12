// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setProfileScope } from '../account-profiles';
import { mountIntro } from './intro';

beforeEach(() => {
  document.body.innerHTML = '<div id="offline"></div><main id="log"></main>';
  localStorage.clear();
  setProfileScope('anonymous');
});
afterEach(() => setProfileScope('anonymous'));

it('shows the lockup, tagline and description to a signed-out first visit', () => {
  const intro = mountIntro(document.getElementById('offline'))!;
  expect(document.body.firstElementChild).toBe(intro);
  expect(intro.querySelector('img')?.alt).toBe('Chatty Cat');
  expect(intro.querySelector('.intro-tagline')?.textContent).toBe('six channels. one scrollback.');
  expect(intro.textContent).toContain('self-hosted Twitch chat client');
});

it('stays away once dismissed', () => {
  mountIntro(document.getElementById('offline'))!.querySelector('button')!.click();
  expect(document.getElementById('intro')).toBeNull();
  expect(mountIntro(document.getElementById('offline'))).toBeUndefined();
  expect(document.getElementById('intro')).toBeNull();
});

it('is not shown to a signed-in account', () => {
  setProfileScope('12345');
  expect(mountIntro(document.getElementById('offline'))).toBeUndefined();
});
