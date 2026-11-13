// First-visit introduction: the lockup, the tagline and two lines on what Chatty Cat is, in the
// brand's phosphor palette. Signed-out visitors see it above the log until they dismiss it.
import lockup from './lockup-primary.svg';
import { getProfileScope } from '../account-profiles';

const KEY = 'chatty-cat:v1:intro-dismissed';

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Inserts the strip before `anchor` and returns it, or returns undefined when it should not show. */
export function mountIntro(anchor: Element | null): HTMLElement | undefined {
  if (!anchor || getProfileScope() !== 'anonymous' || dismissed()) return undefined;
  const root = document.createElement('aside');
  root.id = 'intro';
  root.setAttribute('aria-label', 'About Chatty Cat');
  const mark = document.createElement('img');
  mark.className = 'intro-lockup';
  mark.src = lockup;
  mark.alt = 'Chatty Cat';
  mark.width = 188;
  mark.height = 40;
  const copy = document.createElement('div');
  copy.className = 'intro-copy';
  const tagline = document.createElement('p');
  tagline.className = 'intro-tagline';
  tagline.textContent = 'six channels. one scrollback.';
  const about = document.createElement('p');
  about.textContent =
    'Chatty Cat is a self-hosted Twitch chat client: up to six channels in one log, no sign-in needed to read, ' +
    'in your palette, font and line height.';
  copy.append(tagline, about);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'intro-close';
  close.textContent = 'Got it';
  close.addEventListener('click', () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* Optional storage; the strip returns on the next visit. */
    }
    root.remove();
  });
  root.append(mark, copy, close);
  anchor.before(root);
  return root;
}
