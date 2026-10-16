import type { AuthStatus } from './auth';
export interface UploadConfig {
  enabled: boolean;
  maxBytes: number;
  maxPixels: number;
  retentionSeconds: number;
}
export interface UploadItem {
  id: string;
  url: string;
  type: 'image/png' | 'image/jpeg';
  bytes: number;
  expires: number;
}
export interface Context {
  auth: AuthStatus | undefined;
  channel: string;
  canInsert: boolean;
}
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function bounded(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max;
}
export function parseUploadConfig(value: unknown): UploadConfig {
  if (
    !record(value) ||
    typeof value.enabled !== 'boolean' ||
    !bounded(value.maxBytes, 10 * 1024 * 1024) ||
    !bounded(value.maxPixels, 16000000) ||
    !bounded(value.retentionSeconds, 30 * 86400)
  )
    throw new Error('Upload configuration unavailable');
  return {
    enabled: value.enabled,
    maxBytes: value.maxBytes,
    maxPixels: value.maxPixels,
    retentionSeconds: value.retentionSeconds,
  };
}
export function parseUploadItem(value: unknown): UploadItem {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !/^[a-f0-9]{32}$/.test(value.id) ||
    value.url !== '/uploads/' + value.id ||
    (value.type !== 'image/png' && value.type !== 'image/jpeg') ||
    !bounded(value.bytes, 10 * 1024 * 1024) ||
    !bounded(value.expires, Number.MAX_SAFE_INTEGER) ||
    value.expires <= Date.now()
  )
    throw new Error('Invalid hosted image receipt');
  return { id: value.id, url: value.url, type: value.type, bytes: value.bytes, expires: value.expires };
}
export async function validateUpload(file: File, config: UploadConfig): Promise<void> {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') throw new Error('Choose a PNG or JPEG image');
  if (file.size < 1 || file.size > config.maxBytes) throw new Error('Image size exceeds the configured limit');
  const bitmap = await createImageBitmap(file);
  try {
    if (
      !Number.isSafeInteger(bitmap.width) ||
      !Number.isSafeInteger(bitmap.height) ||
      bitmap.width < 1 ||
      bitmap.height < 1 ||
      bitmap.width > config.maxPixels / bitmap.height
    )
      throw new Error('Image dimensions exceed the configured limit');
  } finally {
    bitmap.close();
  }
}
export type Transport = (
  file: File,
  id: string,
  auth: AuthStatus,
  signal: AbortSignal,
  progress: (percent: number) => void,
) => Promise<unknown>;
export const uploadImage: Transport = (file, id, auth, signal, progress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads/' + id);
    xhr.timeout = 30000;
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('X-CSRF-Token', auth.csrf ?? '');
    xhr.setRequestHeader('X-Account-ID', auth.userID ?? '');
    const abort = (): void => xhr.abort();
    const finish = (): void => signal.removeEventListener('abort', abort);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      finish();
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new Error(
            xhr.status === 429
              ? 'Upload service busy; retry later'
              : xhr.status === 413
                ? 'Image exceeds server size limit'
                : xhr.status === 401 || xhr.status === 403
                  ? 'Login or account changed; reopen uploads'
                  : 'Upload rejected; check image limits or storage quota',
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        reject(new Error('Invalid upload response'));
      }
    };
    xhr.onerror = () => {
      finish();
      reject(new Error('Upload connection failed; retry uses the same upload ID'));
    };
    xhr.ontimeout = () => {
      finish();
      reject(new Error('Upload timed out; retry uses the same upload ID'));
    };
    xhr.onabort = () => {
      finish();
      reject(new Error('Upload cancelled; it may already be hosted. Use My hosted images to check.'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      finish();
      reject(new Error('Upload cancelled'));
      return;
    }
    xhr.send(file);
  });
export type Stage = { file: File; id: string; account: string; channel: string };
