// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import '../test-support/storage-worker-shim';
import { afterEach, expect, it, vi } from 'vitest';
import { StatisticsStorageControls } from './stats-storage-ui';
import { readStatistics } from './stats-storage';
const key = 'chatthing:v1:stats:counts:one',
  raw = JSON.stringify({ version: 1, since: 0, rows: [] });
afterEach(async () => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  await new Promise<void>((resolve, reject) => {
    const q = indexedDB.deleteDatabase('chatthing-statistics');
    q.onsuccess = () => resolve();
    q.onerror = () => reject(q.error);
  });
});
it('requires a separate confirmation after review and retains a readable copy', async () => {
  localStorage.setItem(key, raw);
  const controls = new StatisticsStorageControls(document.body),
    buttons = [...controls.root.querySelectorAll('button')];
  expect(localStorage.getItem(key)).toBe(raw);
  expect(buttons[2]!.disabled).toBe(true);
  buttons[0]!.click();
  expect(controls.root.textContent).toContain('1 public statistics scopes');
  expect(localStorage.getItem(key)).toBe(raw);
  buttons[2]!.click();
  await vi.waitFor(() => expect(controls.root.textContent).toContain('Moved 1'));
  expect(await readStatistics(key)).toBe(raw);
  expect(localStorage.getItem(key)).toBeNull();
  controls.stop();
  expect(document.querySelector('fieldset')).toBeNull();
});
