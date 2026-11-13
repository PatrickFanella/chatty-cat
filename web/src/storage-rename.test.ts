// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { renameStoredKeys } from './storage-rename';
import { recoverDeviceApply } from './device-sync';
import { setProfileScope } from './account-profiles';
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setProfileScope('anonymous');
});
function keys(area: Storage): string[] {
  return Array.from({ length: area.length }, (_, i) => area.key(i)!).sort();
}
// A Map-backed Storage whose total size is capped, like a browser's per-origin quota.
class SmallStorage implements Storage {
  private items = new Map<string, string>();
  constructor(private capacity: number) {}
  get length(): number {
    return this.items.size;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    let used = key.length + value.length;
    for (const [k, v] of this.items) if (k !== key) used += k.length + v.length;
    if (used > this.capacity) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  clear(): void {
    this.items.clear();
  }
}

it('moves every key under the former prefix and leaves other keys alone', () => {
  localStorage.setItem('chatthing:v1:display', '{"size":18}');
  localStorage.setItem('chatthing:v1:profile:42:rules', '[]');
  localStorage.setItem('chatthing:v1:bookmarks:42', '{"items":[]}');
  localStorage.setItem('other-app', 'kept');
  renameStoredKeys(localStorage);
  expect(keys(localStorage)).toEqual([
    'chatty-cat:v1:bookmarks:42',
    'chatty-cat:v1:display',
    'chatty-cat:v1:profile:42:rules',
    'other-app',
  ]);
  expect(localStorage.getItem('chatty-cat:v1:display')).toBe('{"size":18}');
  expect(localStorage.getItem('other-app')).toBe('kept');
});

it('keeps the current key when both exist and drops the old one', () => {
  localStorage.setItem('chatthing:v1:display', 'written by an old tab');
  localStorage.setItem('chatty-cat:v1:display', 'current');
  renameStoredKeys(localStorage);
  expect(keys(localStorage)).toEqual(['chatty-cat:v1:display']);
  expect(localStorage.getItem('chatty-cat:v1:display')).toBe('current');
});

it('moves sessionStorage keys such as unsent drafts', () => {
  sessionStorage.setItem('chatthing:v1:draft:anonymous:hasanabi', 'half a message');
  sessionStorage.setItem('chatthing:v1:last-profile', '42');
  renameStoredKeys(sessionStorage);
  expect(keys(sessionStorage)).toEqual(['chatty-cat:v1:draft:anonymous:hasanabi', 'chatty-cat:v1:last-profile']);
});

it('renames the keys listed in a device sync recovery journal so recovery still works', async () => {
  setProfileScope('42');
  const before = '{"size":14}',
    after = '{"size":18}';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(after)),
    hash = [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
  localStorage.setItem('chatthing:v1:profile:42:display', after);
  localStorage.setItem(
    'chatthing:v1:profile:42:sync-local-recovery',
    JSON.stringify({
      version: 1,
      account: '42',
      state: 0,
      started: Date.now() - 31000,
      entries: [{ key: 'chatthing:v1:profile:42:display', before, afterDigest: hash }],
    }),
  );
  renameStoredKeys(localStorage);
  expect(JSON.parse(localStorage.getItem('chatty-cat:v1:profile:42:sync-local-recovery')!).entries[0].key).toBe(
    'chatty-cat:v1:profile:42:display',
  );
  expect(await recoverDeviceApply('42')).toContain('rolled back');
  expect(localStorage.getItem('chatty-cat:v1:profile:42:display')).toBe(before);
});

it('moves a value too large for two copies by freeing the old key first', () => {
  const area = new SmallStorage(1000),
    big = 'x'.repeat(700);
  area.setItem('chatthing:v1:stats:counts:one', big);
  renameStoredKeys(area);
  expect(keys(area)).toEqual(['chatty-cat:v1:stats:counts:one']);
  expect(area.getItem('chatty-cat:v1:stats:counts:one')).toBe(big);
});

it('keeps the old key when the value cannot be written under the new name', () => {
  const area = new SmallStorage(1000);
  area.setItem('chatthing:v1:display', 'saved');
  area.setItem = (key: string, value: string) => {
    if (key.startsWith('chatty-cat:')) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    SmallStorage.prototype.setItem.call(area, key, value);
  };
  expect(() => renameStoredKeys(area)).not.toThrow();
  expect(keys(area)).toEqual(['chatthing:v1:display']);
  expect(area.getItem('chatthing:v1:display')).toBe('saved');
});

it('never throws when storage is unavailable', () => {
  const blocked = {
    get length(): number {
      throw new DOMException('Access denied', 'SecurityError');
    },
  } as unknown as Storage;
  expect(() => renameStoredKeys(blocked)).not.toThrow();
  expect(() => renameStoredKeys(undefined as unknown as Storage)).not.toThrow();
});
