// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { ImageUploadRuntime } from './image-upload-runtime';
import type { Context } from './image-upload-model';
let runtime: ImageUploadRuntime | undefined;
afterEach(() => {
  runtime?.stop();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  localStorage.clear();
});
it('keeps the first paste files for lazy review, without constructing an editor or uploading', async () => {
  document.body.innerHTML = '<textarea id="message"></textarea>';
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ enabled: true, maxBytes: 1024, maxPixels: 1024, retentionSeconds: 3600 })),
  );
  vi.stubGlobal('fetch', fetcher);
  const context: Context = {
    auth: { authenticated: true, userID: 'fixture' } as Context['auth'],
    channel: 'fixture',
    canInsert: true,
  };
  const request = vi.fn();
  let mounted = false;
  runtime = new ImageUploadRuntime(
    () => context,
    false,
    () => mounted,
    request,
  );
  await runtime.ready;
  expect(document.querySelector('dialog')).toBeNull();
  const file = new File(['fixture'], 'fixture.png', { type: 'image/png' });
  const paste = () => {
    const event = new Event('paste', { cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [file] } });
    document.querySelector('textarea')!.dispatchEvent(event);
    return event;
  };
  expect(paste().defaultPrevented).toBe(true);
  expect(request).toHaveBeenCalledWith([file]);
  mounted = true;
  expect(paste().defaultPrevented).toBe(false);
  mounted = false;
  context.canInsert = false;
  expect(paste().defaultPrevented).toBe(false);
  expect(request).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledOnce();
});
it('ignores a config response that arrives after teardown', async () => {
  let resolve!: (value: Response) => void;
  vi.stubGlobal(
    'fetch',
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  runtime = new ImageUploadRuntime(
    () => ({ auth: undefined, channel: '', canInsert: false }),
    false,
    () => false,
    vi.fn(),
  );
  runtime.stop();
  resolve(new Response(JSON.stringify({ enabled: true, maxBytes: 1024, maxPixels: 1024, retentionSeconds: 3600 })));
  await runtime.ready;
  expect(runtime.config).toBeUndefined();
  expect(runtime.enabled).toBe(false);
});
