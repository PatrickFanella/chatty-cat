// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { DesktopCompanion, parseOverlayState, validOverlaySettings } from './desktop-companion';
import { DesktopOverlayControls } from './desktop-overlay-ui';
import { setProfileScope, profileKey } from './account-profiles';
const auth = { enabled: true, authenticated: true, userID: '42', csrf: 'token', loginURL: '/login' };
const settings = {
  channel: 'room',
  opacity: 0.8,
  scale: 1,
  width: 400,
  height: 600,
  shadow: true,
  clickThrough: false,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  setProfileScope('anonymous');
  document.body.replaceChildren();
});
it('shows first-open recovery guidance only after a successful receipt and can reopen it without IPC', async () => {
  setProfileScope('42');
  const client = new DesktopCompanion(() => auth),
    action = vi
      .spyOn(client, 'overlay')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ open: true, interactive: true, settings, x: 80, y: 80, recovery: 'Native menu available' });
  const controls = new DesktopOverlayControls(
    client,
    () => auth,
    () => 'room',
  );
  document.body.append(controls.root);
  controls.setAvailable(true);
  const button = (text: string) =>
    Array.from(controls.root.querySelectorAll('button')).find((b) => b.textContent === text)!;
  const guide = () => controls.root.querySelector<HTMLElement>('[aria-label="Native overlay first-use guide"]')!;
  const open = async () => {
    button('Review open native overlay').click();
    await vi.waitFor(() => expect(button('Confirm reviewed overlay action').disabled).toBe(false));
    button('Confirm reviewed overlay action').click();
  };
  await open();
  await vi.waitFor(() => expect(controls.root.textContent).toContain('offline'));
  expect(localStorage.getItem(profileKey('chatthing:v1:overlay-onboarding'))).toBeNull();
  expect(guide().hidden).toBe(true);
  button('Confirm reviewed overlay action').click();
  await vi.waitFor(() => expect(guide().hidden).toBe(false));
  expect(localStorage.getItem(profileKey('chatthing:v1:overlay-onboarding'))).toContain('activated');
  button('Dismiss overlay guide').click();
  await new Promise((r) => setTimeout(r, 0));
  await open();
  await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(3));
  expect(guide().hidden).toBe(true);
  const requests = action.mock.calls.length;
  button('Show overlay guide').click();
  await vi.waitFor(() => expect(guide().hidden).toBe(false));
  expect(action).toHaveBeenCalledTimes(requests);
  controls.reset();
  expect(guide().hidden).toBe(true);
});
it('does not let a late open receipt mark activation or show guidance after account teardown', async () => {
  setProfileScope('42');
  let current = auth;
  const client = new DesktopCompanion(() => current);
  let resolve!: (value: ReturnType<typeof parseOverlayState>) => void;
  vi.spyOn(client, 'overlay').mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const controls = new DesktopOverlayControls(
    client,
    () => current,
    () => 'room',
  );
  document.body.append(controls.root);
  controls.setAvailable(true);
  const button = (text: string) =>
    Array.from(controls.root.querySelectorAll('button')).find((b) => b.textContent === text)!;
  button('Review open native overlay').click();
  await vi.waitFor(() => expect(button('Confirm reviewed overlay action').disabled).toBe(false));
  button('Confirm reviewed overlay action').click();
  await vi.waitFor(() => expect(resolve).toBeDefined());
  controls.reset();
  current = { ...auth, userID: '43' };
  setProfileScope('43');
  resolve({ open: true, interactive: true, settings, x: 80, y: 80, recovery: 'Native menu available' });
  await new Promise((r) => setTimeout(r, 0));
  expect(localStorage.getItem(profileKey('chatthing:v1:overlay-onboarding'))).toBeNull();
  expect(controls.root.querySelector<HTMLElement>('[aria-label="Native overlay first-use guide"]')?.hidden).toBe(true);
  expect(controls.root.textContent).toContain('Overlay unpaired');
});
it('validates the native subset and refuses operations before account pairing', async () => {
  expect(validOverlaySettings(settings)).toBe(true);
  for (const changed of [
    { channel: '../evil' },
    { opacity: NaN },
    { opacity: 0 },
    { scale: 5 },
    { width: 99999 },
    { height: 1 },
    { clickThrough: 'true' },
  ])
    expect(validOverlaySettings({ ...settings, ...changed })).toBe(false);
  expect(() =>
    parseOverlayState({
      open: true,
      interactive: true,
      settings: { ...settings, channel: 'bad/url' },
      x: 0,
      y: 0,
      recovery: '',
    }),
  ).toThrow();
  setProfileScope('42');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const client = new DesktopCompanion(() => auth);
  await expect(client.overlay({ kind: 'open', requestID: 'one', settings })).rejects.toThrow('Pair');
  expect(fetcher).not.toHaveBeenCalled();
});
it('does not open a window on review, invalidates edits, and removes reviews on account teardown', async () => {
  const client = new DesktopCompanion(() => auth);
  const action = vi
    .spyOn(client, 'overlay')
    .mockResolvedValue({ open: true, interactive: true, settings, x: 80, y: 80, recovery: 'Native menu available' });
  const controls = new DesktopOverlayControls(
    client,
    () => auth,
    () => 'room',
  );
  document.body.append(controls.root);
  const button = (text: string) =>
    Array.from(controls.root.querySelectorAll('button')).find((b) => b.textContent === text)!;
  button('Review open native overlay').click();
  await vi.waitFor(() => expect(controls.root.textContent).toContain('Pair and check'));
  controls.setAvailable(true);
  button('Review open native overlay').click();
  await vi.waitFor(() => expect(button('Confirm reviewed overlay action').disabled).toBe(false));
  expect(action).not.toHaveBeenCalled();
  const opacity = controls.root.querySelector<HTMLInputElement>('[aria-label="Native overlay opacity"]')!;
  opacity.value = '.6';
  opacity.dispatchEvent(new Event('input', { bubbles: true }));
  expect(button('Confirm reviewed overlay action').disabled).toBe(true);
  expect(action).not.toHaveBeenCalled();
  button('Review open native overlay').click();
  await vi.waitFor(() => expect(button('Confirm reviewed overlay action').disabled).toBe(false));
  controls.reset();
  expect(button('Confirm reviewed overlay action').disabled).toBe(true);
  expect(action).not.toHaveBeenCalled();
});
