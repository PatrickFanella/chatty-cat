// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { appendLinks } from './links';
import { getPresentation, parsePresentation, presentationDefaults, setPresentation } from './presentation';
import { messageRow } from './render';

afterEach(() => setPresentation({ ...presentationDefaults }));
const users = new Map([
  ['alice', true],
  ['kappa', true],
]);
it('defaults off and only links known channel names when enabled', () => {
  const node = document.createElement('span');
  appendLinks(node, 'Alice, unknown @Other', users);
  expect([...node.querySelectorAll('.mention')].map((n) => n.textContent)).toEqual(['@Other']);
  setPresentation({ ...getPresentation(), findAllUsernames: true });
  node.replaceChildren();
  appendLinks(node, 'Alice, unknown @Other', users);
  expect([...node.querySelectorAll('.mention')].map((n) => n.textContent)).toEqual(['Alice', '@Other']);
  expect(node.textContent).toBe('Alice, unknown @Other');
  node.replaceChildren();
  appendLinks(node, 'Alice', new Map());
  expect(node.querySelector('.mention')).toBeNull();
});
it('preserves URL, email, markup and whole-token boundaries', () => {
  setPresentation({ ...getPresentation(), findAllUsernames: true });
  const node = document.createElement('span');
  const text = 'Alice!!! alice@example.com https://example.com/Alice malice Alice-long <Alice> (Alice)';
  appendLinks(node, text, users);
  expect([...node.querySelectorAll('.mention')].map((n) => n.textContent)).toEqual(['Alice']);
  expect(node.textContent).toBe(text);
  expect(node.querySelector('alice')).toBeNull();
  expect(node.querySelector('.mention')?.getAttribute('rel')).toBe('noopener noreferrer');
});
it('keeps provider emotes ahead of bare-name detection', () => {
  setPresentation({ ...getPresentation(), findAllUsernames: true });
  const row = messageRow(
    { id: 'one', channel: 'room', login: 'bob', timestamp: 1, command: 'PRIVMSG', text: 'Alice Kappa', tags: {} },
    {
      channel: 'room',
      errors: [],
      badges: {},
      stream: { uptime: '', viewers: '', title: '' },
      emotes: {
        Kappa: {
          code: 'Kappa',
          url: 'https://example.com/kappa.png',
          staticUrl: '',
          source: 'Twitch',
          animated: false,
          zeroWidth: false,
        },
      },
    },
    false,
    users,
  );
  expect(row.querySelector('.mention')?.textContent).toBe('Alice');
  expect(row.querySelector('.emote')?.getAttribute('alt')).toBe('Kappa');
});

it('persists the supported boolean and rejects malformed values', () => {
  expect(
    parsePresentation(JSON.parse(JSON.stringify({ ...presentationDefaults, findAllUsernames: true }))).findAllUsernames,
  ).toBe(true);
  expect(parsePresentation({ findAllUsernames: 'true' }).findAllUsernames).toBe(false);
});
