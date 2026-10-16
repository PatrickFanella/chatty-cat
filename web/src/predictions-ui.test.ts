// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import '../test-support/storage-worker-shim';
import { afterEach, expect, it, vi } from 'vitest';
import { PredictionPanel } from './predictions-ui';
import { ModerationJournal } from './moderation-journal';
let panel: PredictionPanel | undefined;
let journal: ModerationJournal | undefined;
const auth = {
  enabled: true,
  authenticated: true,
  userID: '42',
  login: 'one',
  csrf: 'fixture',
  loginURL: 'http://127.0.0.1:5201/api/auth/login',
  predictionsEnabled: true,
  predictionsManageEnabled: true,
};
const prediction = {
  id: 'prediction-one',
  broadcaster_id: '42',
  title: 'Question?',
  status: 'ACTIVE',
  prediction_window: 30,
  winning_outcome_id: null,
  created_at: '2026-10-12T12:00:00Z',
  ended_at: null,
  locked_at: null,
  outcomes: [
    { id: 'outcome-one', title: 'One', users: 2, channel_points: 10, color: 'BLUE' },
    { id: 'outcome-two', title: 'Two', users: 1, channel_points: 20, color: 'PINK' },
  ],
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
async function setup(predictions: unknown[] = []) {
  journal = new ModerationJournal();
  panel = new PredictionPanel(
    journal,
    () => true,
    async () => {},
  );
  panel.setScope(auth, 'one');
  document.body.append(panel.root);
  const fetcher = vi.fn(
    async (_url: string, _options?: RequestInit) =>
      new Response(JSON.stringify({ account: '42', broadcasterID: '42', channel: 'one', at: Date.now(), predictions })),
  );
  vi.stubGlobal('fetch', fetcher);
  const button = (text: string) => [...panel!.root.querySelectorAll('button')].find((x) => x.textContent === text)!;
  button('Refresh/reconnect broadcaster predictions').click();
  await vi.waitFor(() => expect(panel!.root.textContent).toContain('Latest ' + predictions.length + ' predictions'));
  return { fetcher, button };
}
it('previews creation without writes and stores pending before one confirmation', async () => {
  const x = await setup();
  panel!.root.querySelector<HTMLInputElement>('[aria-label="Prediction title"]')!.value = 'Question?';
  panel!.root.querySelector<HTMLTextAreaElement>('[aria-label="Prediction outcomes, one per line"]')!.value =
    'One\nTwo';
  x.button('Preview new prediction').click();
  expect(x.fetcher).toHaveBeenCalledTimes(1);
  x.fetcher.mockImplementation(async (_url, options) => {
    expect((await journal!.list('42')).entries[0]?.outcome).toBe('pending');
    expect(JSON.parse(String(options?.body))).toMatchObject({ outcomes: ['One', 'Two'], window: 30, action: 'CREATE' });
    return new Response(JSON.stringify({ sent: true, prediction }));
  });
  x.button('Confirm reviewed prediction action').click();
  await vi.waitFor(async () => expect((await journal!.list('42')).entries[0]?.outcome).toBe('confirmed'));
  expect(x.fetcher).toHaveBeenCalledTimes(2);
});
it('freezes an explicit winning outcome and refuses a different provider winner', async () => {
  const x = await setup([prediction]);
  x.button('Preview resolve prediction-one with One').click();
  expect(panel!.root.querySelector('pre')?.textContent).toContain('WINNING OUTCOME: One / ID outcome-one');
  x.fetcher.mockImplementation(async (_url, options) => {
    expect(JSON.parse(String(options?.body))).toMatchObject({
      action: 'RESOLVED',
      id: 'prediction-one',
      winnerID: 'outcome-one',
    });
    return new Response(
      JSON.stringify({
        sent: true,
        prediction: {
          ...prediction,
          status: 'RESOLVED',
          ended_at: '2026-10-12T12:01:00Z',
          winning_outcome_id: 'outcome-two',
        },
      }),
    );
  });
  x.button('Confirm reviewed prediction action').click();
  await vi.waitFor(async () => expect((await journal!.list('42')).entries[0]?.outcome).toBe('uncertain'));
  x.button('Preview resolve prediction-one with One').click();
  expect(x.button('Confirm reviewed prediction action').disabled).toBe(true);
  expect(panel!.root.textContent).toContain('Refresh provider state before another action');
  expect(x.fetcher).toHaveBeenCalledTimes(2);
});
it('clears staged resolution after provider settlement and removes write controls with read-only consent', async () => {
  const x = await setup([prediction]);
  x.button('Preview resolve prediction-one with Two').click();
  x.fetcher.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          account: '42',
          broadcasterID: '42',
          channel: 'one',
          at: Date.now(),
          predictions: [{ ...prediction, status: 'CANCELED', ended_at: '2026-10-12T12:01:00Z' }],
        }),
      ),
  );
  x.button('Refresh/reconnect broadcaster predictions').click();
  await vi.waitFor(() => expect(x.button('Confirm reviewed prediction action').disabled).toBe(true));
  expect(panel!.root.textContent).toContain('CANCELED');
  panel!.setScope({ ...auth, predictionsManageEnabled: false }, 'one');
  expect(panel!.root.textContent).toContain('Read-only prediction view');
});
it('keeps an in-flight outcome in its original account after a scope change', async () => {
  const x = await setup([prediction]);
  let resolve: ((response: Response) => void) | undefined;
  x.fetcher.mockImplementation(
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  x.button('Preview CANCELED prediction prediction-one').click();
  x.button('Confirm reviewed prediction action').click();
  await vi.waitFor(() => expect(resolve).toBeDefined());
  panel!.setScope({ ...auth, userID: '43', csrf: 'new' }, 'one');
  resolve!(new Response(JSON.stringify({ sent: false, uncertain: true, error: 'Unknown result' }), { status: 502 }));
  await vi.waitFor(async () => expect((await journal!.list('42')).entries[0]?.outcome).toBe('uncertain'));
  expect((await journal!.list('43')).entries).toEqual([]);
  expect(panel!.root.textContent).not.toContain('Question?');
});

it('preserves focused action controls when a refresh returns unchanged provider state', async () => {
  const x = await setup([prediction]);
  const action = x.button('Preview resolve prediction-one with One');
  action.focus();
  x.button('Refresh/reconnect broadcaster predictions').click();
  await vi.waitFor(() => expect(x.fetcher).toHaveBeenCalledTimes(2));
  await new Promise((r) => setTimeout(r, 20));
  expect(document.activeElement).toBe(action);
  expect(action.isConnected).toBe(true);
});
