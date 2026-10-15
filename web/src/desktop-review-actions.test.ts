// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { DesktopPlaybackPanel } from './desktop-companion-ui';
import { HotkeyPanel } from './hotkeys-ui';
import { defaultBindings, parseHotkeys } from './hotkeys';
import { setProfileScope } from './account-profiles';
import { resetPrivacyFallback, savePrivacy } from './privacy';
const auth = { enabled: true, authenticated: true, loginURL: '/login', userID: '42', csrf: 'token' };
let desktop: DesktopPlaybackPanel | undefined;
let hotkeys: HotkeyPanel | undefined;
afterEach(() => {
  hotkeys?.stop();
  desktop?.stop();
  hotkeys = undefined;
  desktop = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  resetPrivacyFallback();
  setProfileScope('anonymous');
  vi.unstubAllGlobals();
});
function setup(hidden = false) {
  setProfileScope('42');
  document.body.innerHTML = '<button id="commands-open">Commands</button>';
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  desktop = new DesktopPlaybackPanel(
    () => auth,
    () => ['one', 'two'],
    () => 'two',
    hidden,
  );
  return fetcher;
}
it('opens the selected channel review section with no pairing, launch or native-window request', () => {
  const fetcher = setup();
  desktop!.openReview('playback');
  expect(desktop!.root.open).toBe(true);
  expect(desktop!.root.querySelector<HTMLSelectElement>('[aria-label="Desktop playback channel"]')?.value).toBe('two');
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Playback quality');
  desktop!.root.close();
  desktop!.openReview('overlay');
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Native overlay opacity');
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    Array.from(desktop!.root.querySelectorAll('button'))
      .filter(
        (b) => b.textContent === 'Launch reviewed playback' || b.textContent === 'Confirm reviewed overlay action',
      )
      .every((b) => b.disabled),
  ).toBe(true);
});
it('keeps new bindings unbound in old snapshots and respects editable, modal and privacy guards', () => {
  const fetcher = setup();
  expect(defaultBindings()['desktop-playback']).toBe('');
  expect(defaultBindings()['desktop-overlay']).toBe('');
  expect(parseHotkeys({ version: 1, bindings: { compose: 'Alt+KeyM' } })?.bindings['desktop-overlay']).toBe('');
  const trigger = document.createElement('button'),
    editor = document.createElement('button');
  document.body.append(trigger, editor);
  // Hotkey storage is resolved through the current account's profile key.
  const bindings = { ...defaultBindings(), 'desktop-overlay': 'Alt+Shift+KeyO' };
  importStorage(bindings);
  hotkeys = new HotkeyPanel(
    trigger,
    editor,
    (id) => {
      if (id === 'desktop-overlay') desktop!.openReview('overlay');
    },
    () => [],
  );
  const key = () =>
    new KeyboardEvent('keydown', { code: 'KeyO', altKey: true, shiftKey: true, bubbles: true, cancelable: true });
  const field = document.createElement('textarea');
  document.body.append(field);
  field.dispatchEvent(key());
  expect(desktop!.root.open).toBe(false);
  document.body.dispatchEvent(key());
  expect(desktop!.root.open).toBe(true);
  desktop!.root.close();
  const modal = document.createElement('dialog');
  document.body.append(modal);
  modal.showModal();
  document.body.dispatchEvent(key());
  expect(desktop!.root.open).toBe(false);
  modal.close();
  savePrivacy({ version: 1, enabled: true, allowed: [], panic: true });
  document.body.dispatchEvent(key());
  expect(desktop!.root.open).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
it('refuses review entry from hidden popout/OBS views', () => {
  setup(true);
  expect(() => desktop!.openReview('overlay')).toThrow('main workspace');
  expect(desktop!.root.open).toBe(false);
});
import { profileKey } from './account-profiles';
import { dispatchLocal, LocalTargets, type LocalContext } from './local-commands';
it('routes /streamlink to a joined channel without IPC and rejects unavailable views/channels', async () => {
  const fetcher = setup();
  const c: LocalContext = {
    channel: 'two',
    uptime: '',
    targets: new LocalTargets(),
    playback: (channel) => desktop!.openReview('playback', channel),
    open: vi.fn(() => true),
    copy: vi.fn(async () => {}),
    clear: vi.fn(),
    user: vi.fn(() => true),
    ignore: vi.fn(),
    connection: vi.fn(),
    popout: vi.fn(() => true),
    reply: vi.fn(),
    stage: vi.fn(),
    help: vi.fn(),
  };
  await dispatchLocal('/streamlink #one', c);
  expect(desktop!.root.open).toBe(true);
  expect(desktop!.root.querySelector<HTMLSelectElement>('[aria-label="Desktop playback channel"]')?.value).toBe('one');
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    Array.from(desktop!.root.querySelectorAll('button')).find((b) => b.textContent === 'Launch reviewed playback')
      ?.disabled,
  ).toBe(true);
  desktop!.root.close();
  await expect(dispatchLocal('/streamlink unjoined', c)).rejects.toThrow('joined channel');
  expect(desktop!.root.open).toBe(false);
  setProfileScope('anonymous');
  await expect(dispatchLocal('/streamlink', c)).rejects.toThrow('signed-in');
  expect(fetcher).not.toHaveBeenCalled();
});
function importStorage(bindings: Record<string, string>): void {
  localStorage.setItem(profileKey('chatthing:v1:hotkeys'), JSON.stringify({ version: 1, bindings }));
}
it('discards a previous overlay review when reopening playback setup', async () => {
  const fetcher = setup();
  fetcher.mockImplementation((url: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          url.endsWith('/v1/pair')
            ? { version: 1, account: '42', token: 'b'.repeat(64) }
            : { version: 1, platform: 'darwin', tools: [], jobs: [], overlayAvailable: true },
        ),
      ),
    ),
  );
  desktop!.openReview('overlay');
  const button = (text: string) =>
    Array.from(desktop!.root.querySelectorAll('button')).find((b) => b.textContent === text)!;
  desktop!.root.querySelector('input')!.value = 'a'.repeat(64);
  button('Pair local companion').click();
  await vi.waitFor(() =>
    expect(desktop!.root.querySelector('section [role=status]')?.textContent).toContain('Paired macOS'),
  );
  button('Review open native overlay').click();
  await vi.waitFor(() => expect(button('Confirm reviewed overlay action').disabled).toBe(false));
  const requests = fetcher.mock.calls.length;
  desktop!.root.close();
  desktop!.openReview('playback');
  expect(button('Confirm reviewed overlay action').disabled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(requests);
});
