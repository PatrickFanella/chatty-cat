// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import '../test-support/storage-worker-shim';
import { afterEach, expect, it, vi } from 'vitest';
import { BroadcasterPanel } from './broadcaster-actions-ui';
import { ModerationJournal } from './moderation-journal';
let panel: BroadcasterPanel | undefined;
let journal: ModerationJournal | undefined;
const auth = {
  enabled: true,
  authenticated: true,
  userID: '42',
  login: 'one',
  csrf: 'fixture',
  loginURL: 'http://127.0.0.1:5202/api/auth/login',
  commandPermissions: ['channel:manage:broadcast', 'clips:edit', 'channel:edit:commercial'],
};
const context = {
  account: '42',
  channel: 'one',
  broadcasterID: '42',
  role: 'broadcaster',
  stream: 'live',
  streamID: 'stream-one',
  broadcasterType: 'affiliate',
  title: 'Original',
  gameID: '100',
  gameName: 'Fixture',
  revision: 'a'.repeat(64),
  at: Date.now(),
  categories: [{ id: '101', name: 'Exact game' }],
  detail: 'Provider eligibility final',
};
afterEach(async () => {
  panel?.stop();
  await journal?.stop();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await new Promise((r) => setTimeout(r, 10));
  await new Promise<void>((resolve, reject) => {
    const q = indexedDB.deleteDatabase('chatthing-moderation-journal');
    q.onsuccess = () => resolve();
    q.onerror = () => reject(q.error);
  });
});
async function setup(value = context) {
  journal = new ModerationJournal();
  panel = new BroadcasterPanel(
    journal,
    () => true,
    async () => {},
  );
  panel.setScope(auth, 'one');
  document.body.append(panel.root);
  const fetcher = vi.fn(async (_url: string, _options?: RequestInit) => new Response(JSON.stringify(value)));
  vi.stubGlobal('fetch', fetcher);
  const button = (text: string) => [...panel!.root.querySelectorAll('button')].find((x) => x.textContent === text)!;
  button('Refresh broadcaster context / search category').click();
  await vi.waitFor(() => expect(panel!.root.textContent).toContain('Fresh provider context'));
  return { fetcher, button };
}
it('previews without writing and saves pending before exposing a confirmed clip link', async () => {
  const x = await setup();
  x.button('Preview broadcaster action').click();
  expect(x.fetcher).toHaveBeenCalledTimes(1);
  expect(panel!.root.querySelector('a')).toBeNull();
  x.fetcher.mockImplementation(async (_url, options) => {
    expect((await journal!.list('42')).entries[0]?.outcome).toBe('pending');
    expect(JSON.parse(String(options?.body))).toMatchObject({
      message: '/clip',
      expectedBroadcasterID: '42',
      expectedStreamID: 'stream-one',
      expectedBroadcastRevision: 'a'.repeat(64),
    });
    return new Response(
      JSON.stringify({
        sent: true,
        command: true,
        resourceID: 'FixtureClip',
        url: 'https://clips.twitch.tv/FixtureClip',
        editURL: 'https://clips.twitch.tv/FixtureClip/edit',
        detail: 'Provider confirmed published clip FixtureClip',
      }),
    );
  });
  x.button('Confirm reviewed broadcaster action').click();
  await vi.waitFor(async () => expect((await journal!.list('42')).entries[0]?.outcome).toBe('confirmed'));
  expect(panel!.root.querySelector('a')?.href).toBe('https://clips.twitch.tv/FixtureClip');
  expect(x.fetcher).toHaveBeenCalledTimes(2);
});
it('refuses offline and viewer marker actions before writes', async () => {
  const x = await setup({ ...context, stream: 'offline', streamID: '' });
  x.button('Preview broadcaster action').click();
  expect(x.button('Confirm reviewed broadcaster action').disabled).toBe(true);
  expect(panel!.root.textContent).toContain('verified live stream');
  x.fetcher.mockImplementation(
    async () => new Response(JSON.stringify({ ...context, role: 'viewer', broadcasterID: '123' })),
  );
  x.button('Refresh broadcaster context / search category').click();
  await vi.waitFor(() => expect(panel!.root.textContent).toContain('role viewer'));
  panel!.root.querySelector<HTMLSelectElement>('[aria-label="Broadcaster action"]')!.value = 'marker';
  x.button('Preview broadcaster action').click();
  expect(panel!.root.textContent).toContain('broadcaster account');
  expect(x.fetcher.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(0);
});
it('stages only an exact selected category ID and clears reviews when scope changes', async () => {
  const x = await setup();
  panel!.reviewCommand('/setgame Exact game');
  await vi.waitFor(() => expect(panel!.root.querySelector('pre')?.textContent).toContain('/setgame id:101'));
  expect(x.button('Confirm reviewed broadcaster action').disabled).toBe(false);
  panel!.setScope({ ...auth, commandPermissions: [] }, 'one');
  expect(x.button('Confirm reviewed broadcaster action').disabled).toBe(true);
  expect(x.fetcher.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(0);
});
it('keeps uncertain clip outcomes private and never exposes links or retries', async () => {
  const x = await setup();
  x.button('Preview broadcaster action').click();
  x.fetcher.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({ sent: false, uncertain: true, resourceID: 'FixtureClip', error: 'Still processing' }),
        { status: 502 },
      ),
  );
  x.button('Confirm reviewed broadcaster action').click();
  await vi.waitFor(async () => expect((await journal!.list('42')).entries[0]?.outcome).toBe('uncertain'));
  expect(panel!.root.querySelector('a')).toBeNull();
  x.button('Preview broadcaster action').click();
  expect(x.button('Confirm reviewed broadcaster action').disabled).toBe(true);
  expect(x.fetcher).toHaveBeenCalledTimes(2);
});
