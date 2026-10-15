// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { parseUploadConfig, parseUploadItem, validateUpload, ImageUploads } from './image-uploads';
import type { AuthStatus } from './auth';
let panel: ImageUploads | undefined;
afterEach(() => {
  panel?.stop();
  panel = undefined;
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});
const cfg = { enabled: true, maxBytes: 1024, maxPixels: 100, retentionSeconds: 3600 };
const auth: AuthStatus = {
  enabled: true,
  authenticated: true,
  userID: '42',
  login: 'alice',
  csrf: 'fixture',
  loginURL: 'https://chat.subcult.tv/api/auth/login',
};
const id = 'a'.repeat(32);
const item = { id, url: '/uploads/' + id, type: 'image/png', bytes: 80, expires: Date.now() + 3600000 };
it('refuses unsafe config, receipts, MIME, bytes and dimensions', async () => {
  expect(() => parseUploadConfig({ ...cfg, maxBytes: Infinity })).toThrow();
  for (const url of ['https://evil.test/x', 'javascript:alert(1)', '/uploads/' + id + '?secret=1'])
    expect(() => parseUploadItem({ ...item, url })).toThrow();
  vi.stubGlobal('createImageBitmap', async () => ({ width: 11, height: 10, close: vi.fn() }));
  await expect(validateUpload(new File(['x'], 'x.png', { type: 'image/png' }), cfg)).rejects.toThrow('dimensions');
  await expect(validateUpload(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }), cfg)).rejects.toThrow('PNG');
  await expect(validateUpload(new File(['x'.repeat(1025)], 'x.png', { type: 'image/png' }), cfg)).rejects.toThrow(
    'size',
  );
});
function setup(transport: () => Promise<unknown>) {
  document.body.innerHTML = '<button id="commands-open"></button><textarea id="message"></textarea>';
  vi.stubGlobal('createImageBitmap', async () => ({ width: 2, height: 2, close: vi.fn() }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(cfg))),
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  let account: AuthStatus | undefined = auth,
    channel = 'one';
  const inserted = vi.fn();
  panel = new ImageUploads(() => ({ auth: account, channel, canInsert: true }), inserted, false, transport);
  return {
    inserted,
    account: (v: AuthStatus | undefined) => {
      account = v;
      panel?.contextChanged();
    },
    channel: (v: string) => {
      channel = v;
      panel?.contextChanged();
    },
    click: (text: string) => [...panel!.root.querySelectorAll('button')].find((b) => b.textContent === text)!.click(),
  };
}
it('stages without a write, explicitly uploads, then inserts a safe link without sending', async () => {
  const write = vi.fn(async () => ({ account: '42', item }));
  const x = setup(write);
  await panel!.ready;
  await panel!.stage(new File(['image'], 'x.png', { type: 'image/png' }));
  expect(write).not.toHaveBeenCalled();
  expect(x.inserted).not.toHaveBeenCalled();
  x.click('Upload reviewed image');
  await vi.waitFor(() => expect(panel!.root.textContent).toContain('Uploaded'));
  expect(write).toHaveBeenCalledOnce();
  expect(x.inserted).not.toHaveBeenCalled();
  x.click('Insert hosted link');
  expect(x.inserted).toHaveBeenCalledWith(new URL(item.url, location.origin).href);
});
it('discards delayed upload receipts after account/channel changes or cancellation', async () => {
  let finish: (v: unknown) => void = () => {};
  const x = setup(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await panel!.ready;
  await panel!.stage(new File(['image'], 'x.png', { type: 'image/png' }));
  x.click('Upload reviewed image');
  x.channel('two');
  finish({ account: '42', item });
  await Promise.resolve();
  expect(x.inserted).not.toHaveBeenCalled();
  expect(panel!.root.querySelector<HTMLButtonElement>('[data-action=insert]')!.disabled).toBe(true);
  await panel!.stage(new File(['image'], 'x.png', { type: 'image/png' }));
  x.account({ ...auth, userID: '43' });
  expect(panel!.root.querySelector('img')?.getAttribute('src')).toBeNull();
});
it('blocks unconfigured destinations and removes previews on privacy', async () => {
  const write = vi.fn();
  const x = setup(write);
  await panel!.ready;
  await panel!.stage(new File(['image'], 'x.png', { type: 'image/png' }));
  localStorage.setItem('chatthing:v1:privacy', JSON.stringify({ version: 1, enabled: true, allowed: [], panic: true }));
  document.dispatchEvent(new Event('privacychange'));
  x.click('Upload reviewed image');
  expect(write).not.toHaveBeenCalled();
  expect(panel!.root.querySelector('img')?.getAttribute('src')).toBeNull();
});

it('keeps uploads disabled when destination configuration is missing', async () => {
  document.body.innerHTML = '<button id="commands-open"></button><textarea id="message"></textarea>';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ ...cfg, enabled: false }))),
  );
  const write = vi.fn();
  panel = new ImageUploads(() => ({ auth, channel: 'one', canInsert: true }), vi.fn(), false, write);
  await panel.ready;
  await expect(panel.stage(new File(['x'], 'x.png', { type: 'image/png' }))).rejects.toThrow('not configured');
  expect(write).not.toHaveBeenCalled();
});

it('lists only validated owner receipts and stages deletion before a CSRF-protected request', async () => {
  const x = setup(async () => ({ account: '42', item }));
  await panel!.ready;
  const requests = vi.fn(
    async (url: string) =>
      new Response(url === '/api/uploads' ? JSON.stringify({ account: '42', items: [item] }) : null, {
        status: url === '/api/uploads' ? 200 : 204,
      }),
  );
  vi.stubGlobal('fetch', requests);
  x.click('My hosted images');
  await vi.waitFor(() => expect(panel!.root.textContent).toContain(id.slice(0, 8)));
  x.click('Delete hosted image ' + id.slice(0, 8));
  expect(requests).toHaveBeenCalledOnce();
  x.click('Confirm deletion ' + id.slice(0, 8));
  await vi.waitFor(() => expect(panel!.root.textContent).toContain('Hosted image deleted'));
  expect(requests).toHaveBeenLastCalledWith(
    '/api/uploads/' + id,
    expect.objectContaining({ method: 'DELETE', headers: { 'X-Account-ID': '42', 'X-CSRF-Token': 'fixture' } }),
  );
  expect(x.inserted).not.toHaveBeenCalled();
});
