// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountLifecycle } from './lifecycle';
let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
  delete (navigator as unknown as Record<string, unknown>).onLine;
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
});
it('shows offline history status and tracks connectivity until cleanup', () => {
  let online = false;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  const offline = document.createElement('div');
  const update = document.createElement('button');
  stop = mountLifecycle(offline, update);
  expect(offline.hidden).toBe(false);
  online = true;
  window.dispatchEvent(new Event('online'));
  expect(offline.hidden).toBe(true);
  stop();
  stop = undefined;
  online = false;
  window.dispatchEvent(new Event('offline'));
  expect(offline.hidden).toBe(true);
});
it('offers a waiting update and activates only after explicit selection', async () => {
  vi.stubGlobal('isSecureContext', true);
  const postMessage = vi.fn();
  const registration = Object.assign(new EventTarget(), { waiting: { postMessage }, installing: null });
  const serviceWorker = Object.assign(new EventTarget(), { register: vi.fn().mockResolvedValue(registration) });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
  const update = document.createElement('button');
  update.hidden = true;
  stop = mountLifecycle(document.createElement('div'), update, '/assets/app-one.js');
  await Promise.resolve();
  expect(update.hidden).toBe(false);
  expect(postMessage).not.toHaveBeenCalled();
  update.click();
  expect(postMessage).toHaveBeenCalledWith('activate-update');
  expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js?build=%2Fassets%2Fapp-one.js', {
    scope: '/',
    updateViaCache: 'none',
  });
  stop();
  stop = mountLifecycle(document.createElement('div'), update, '/assets/app-two.js');
  await Promise.resolve();
  expect(serviceWorker.register).toHaveBeenLastCalledWith('/sw.js?build=%2Fassets%2Fapp-two.js', {
    scope: '/',
    updateViaCache: 'none',
  });
});
