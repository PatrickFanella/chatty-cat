// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import {
  makeDeviceDocument,
  parseDeviceDocument,
  planDeviceApply,
  commitDeviceApply,
  recoverDeviceApply,
} from './device-sync';
import { defaultDisplay } from './display';
import { presentationDefaults } from './presentation';
import { providerDefaults } from './provider-preferences';
import { linkDefaults } from './link-preferences';
import { parseOptions } from './picker-model';
import { setProfileScope, profileKey } from './account-profiles';
import type { Workspace } from './workspaces';
import type { Bookmark } from './bookmarks';
import { SplitLayout } from './splits';
const workspace: Workspace = {
  id: 'one',
  name: 'One',
  channels: ['room'],
  target: 'room',
  focus: 'log',
  readers: [{ column: 0, key: 'room:message', offset: 1 }],
  settings: { version: 1, display: defaultDisplay(), extras: { oauthToken: 'never-upload', commands: [] } },
};
const bookmark: Bookmark = {
  id: 'mark',
  kind: 'message',
  message: {
    id: 'message',
    command: 'PRIVMSG',
    channel: 'room',
    login: 'alice',
    text: 'public excerpt',
    timestamp: 1,
    parent: '',
    root: '',
    target: '',
    duration: '',
    deleted: false,
  },
  context: [],
  created: 1,
  updated: 2,
  note: 'private-note-canary',
  tags: ['private'],
};
const preferences = () => ({
  display: defaultDisplay(),
  presentation: { ...presentationDefaults },
  picker: parseOptions({}),
  provider: providerDefaults(),
  links: { ...linkDefaults },
});
afterEach(() => {
  localStorage.clear();
  setProfileScope('anonymous');
  vi.restoreAllMocks();
});
function local() {
  setProfileScope('42');
  localStorage.setItem(
    profileKey('chatthing:v1:workspaces'),
    JSON.stringify({ version: 1, active: 'one', workspaces: [workspace] }),
  );
  localStorage.setItem(
    'chatthing:v1:bookmarks:42',
    JSON.stringify({ format: 'chatty-cat-bookmarks', version: 1, bookmarks: [bookmark] }),
  );
}
it('projects only selected public records, omits private fields and reader anchors, and roundtrips', () => {
  const document = makeDeviceDocument(
    { workspaces: true, preferences: true, bookmarks: true },
    { workspaces: [workspace], preferences: preferences(), bookmarks: [bookmark] },
  );
  const raw = JSON.stringify(document);
  expect(raw).not.toContain('private-note-canary');
  expect(raw).not.toContain('never-upload');
  expect(raw).not.toContain('room:message');
  expect(parseDeviceDocument(JSON.parse(raw))).toEqual(document);
  expect(
    makeDeviceDocument(
      { workspaces: false, preferences: true, bookmarks: false },
      { workspaces: [workspace], preferences: preferences(), bookmarks: [bookmark] },
    ).bookmarks,
  ).toBeUndefined();
});
it('rejects private envelopes and nonpublic bookmark commands', () => {
  expect(() => parseDeviceDocument({ format: 'chatty-cat-device-sync', version: 1, whispers: [] })).toThrow();
  const d = makeDeviceDocument(
    { workspaces: false, preferences: false, bookmarks: true },
    { workspaces: [], preferences: preferences(), bookmarks: [bookmark] },
  );
  expect(() =>
    parseDeviceDocument({
      ...d,
      bookmarks: [{ ...d.bookmarks?.[0], message: { ...bookmark.message, command: 'WHISPER' } }],
    }),
  ).toThrow();
});
it('preserves private annotations for removed public bookmarks in a local-only backup', async () => {
  local();
  const d = makeDeviceDocument(
    { workspaces: false, preferences: false, bookmarks: true },
    { workspaces: [], preferences: preferences(), bookmarks: [] },
  );
  const plan = await planDeviceApply(d, '42');
  await commitDeviceApply(plan);
  expect(localStorage.getItem('chatthing:v1:bookmarks:42')).not.toContain('private-note-canary');
  expect(localStorage.getItem(profileKey('chatthing:v1:sync-annotation-backup'))).toContain('private-note-canary');
});
it('rejects stale-tab and account changes before applying', async () => {
  local();
  const d = makeDeviceDocument(
    { workspaces: true, preferences: false, bookmarks: false },
    { workspaces: [workspace], preferences: preferences(), bookmarks: [] },
  );
  const plan = await planDeviceApply(d, '42');
  localStorage.setItem(profileKey('chatthing:v1:workspaces'), 'newer');
  await expect(commitDeviceApply(plan)).rejects.toThrow('changed');
  expect(localStorage.getItem(profileKey('chatthing:v1:workspaces'))).toBe('newer');
  setProfileScope('43');
  await expect(commitDeviceApply(plan)).rejects.toThrow('account');
});
it('rolls back earlier local writes after a quota failure and retains unrelated keys', async () => {
  local();
  localStorage.setItem('unrelated', 'retain');
  const d = makeDeviceDocument(
    { workspaces: true, preferences: true, bookmarks: false },
    { workspaces: [{ ...workspace, name: 'Remote' }], preferences: preferences(), bookmarks: [] },
  );
  const plan = await planDeviceApply(d, '42'),
    old = localStorage.getItem(profileKey('chatthing:v1:workspaces')),
    original = localStorage.setItem.bind(localStorage);
  let failed = false;
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (!failed && key === profileKey('chatthing:v1:presentation')) {
      failed = true;
      throw new DOMException('quota', 'QuotaExceededError');
    }
    original(key, value);
  });
  await expect(commitDeviceApply(plan)).rejects.toThrow();
  expect(localStorage.getItem(profileKey('chatthing:v1:workspaces'))).toBe(old);
  expect(localStorage.getItem('unrelated')).toBe('retain');
  expect(await recoverDeviceApply('42')).not.toContain('conflict');
});
it('retains a fresh apply lease and restores an older interrupted apply without clobbering other edits', async () => {
  local();
  const key = profileKey('chatthing:v1:display'),
    old = JSON.stringify(defaultDisplay()),
    next = JSON.stringify({ ...defaultDisplay(), size: 18 });
  localStorage.setItem(key, next);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(next)),
    hash = [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
  const journal = {
    version: 1,
    account: '42',
    state: 0,
    started: Date.now(),
    entries: [{ key, before: old, afterDigest: hash }],
  };
  localStorage.setItem(profileKey('chatthing:v1:sync-local-recovery'), JSON.stringify(journal));
  expect(await recoverDeviceApply('42')).toContain('active');
  expect(localStorage.getItem(key)).toBe(next);
  journal.started -= 31000;
  localStorage.setItem(profileKey('chatthing:v1:sync-local-recovery'), JSON.stringify(journal));
  expect(await recoverDeviceApply('42')).toContain('rolled back');
  expect(localStorage.getItem(key)).toBe(old);
  localStorage.setItem(key, 'newer edit');
  localStorage.setItem(profileKey('chatthing:v1:sync-local-recovery'), JSON.stringify(journal));
  expect(await recoverDeviceApply('42')).toContain('Concurrent');
  expect(localStorage.getItem(key)).toBe('newer edit');
});
it('carries the explicitly selected active workspace to another device', async () => {
  local();
  const d = makeDeviceDocument(
    { workspaces: true, preferences: false, bookmarks: false },
    {
      activeWorkspace: 'two',
      workspaces: [workspace, { ...workspace, id: 'two', name: 'Two' }],
      preferences: preferences(),
      bookmarks: [],
    },
  );
  const plan = await planDeviceApply(d, '42');
  await commitDeviceApply(plan);
  expect(JSON.parse(localStorage.getItem(profileKey('chatthing:v1:workspaces'))!).active).toBe('two');
});
it('keeps destination reader positions local for retained workspaces', async () => {
  local();
  const d = makeDeviceDocument(
    { workspaces: true, preferences: false, bookmarks: false },
    { workspaces: [workspace], preferences: preferences(), bookmarks: [] },
  );
  expect(d.workspaces?.[0]?.readers).toEqual([]);
  await commitDeviceApply(await planDeviceApply(d, '42'));
  const saved = JSON.parse(localStorage.getItem(profileKey('chatthing:v1:workspaces'))!);
  expect(saved.workspaces[0].readers).toEqual(workspace.readers);
});
it('preserves matching local pane anchors but clears anchors when the remote pane changes channels', async () => {
  local();
  const split = new SplitLayout(['room', 'other']).snapshot();
  split.tabs[0]!.panes[0]!.reader = { key: 'room:local', offset: 3 };
  split.tabs[0]!.panes[0]!.unread = 4;
  const saved = {
    ...workspace,
    channels: ['room', 'other'],
    settings: { ...workspace.settings, extras: { splits: split } },
  };
  localStorage.setItem(
    profileKey('chatthing:v1:workspaces'),
    JSON.stringify({ version: 1, active: 'one', workspaces: [saved] }),
  );
  const d = makeDeviceDocument(
    { workspaces: true, preferences: false, bookmarks: false },
    { workspaces: [saved], preferences: preferences(), bookmarks: [] },
  );
  await commitDeviceApply(await planDeviceApply(d, '42'));
  const read = () =>
    JSON.parse(localStorage.getItem(profileKey('chatthing:v1:workspaces'))!).workspaces[0].settings.extras.splits
      .tabs[0].panes[0];
  expect(read().reader).toEqual({ key: 'room:local', offset: 3 });
  expect(read().unread).toBe(4);
  const pane = (d.workspaces![0]!.settings.extras.splits as ReturnType<SplitLayout['snapshot']>).tabs[0]!.panes[0]!;
  pane.channels = ['other'];
  pane.target = 'other';
  await commitDeviceApply(await planDeviceApply(d, '42'));
  expect(read().reader).toBeNull();
  expect(read().unread).toBe(0);
});

it('retains an existing private backup when the same bookmark has different annotations', async () => {
  local();
  localStorage.setItem(
    profileKey('chatthing:v1:sync-annotation-backup'),
    JSON.stringify({
      format: 'chatty-cat-bookmarks',
      version: 1,
      bookmarks: [{ ...bookmark, note: 'older private note' }],
    }),
  );
  const d = makeDeviceDocument(
    { workspaces: false, preferences: false, bookmarks: true },
    { workspaces: [], preferences: preferences(), bookmarks: [] },
  );
  await expect(planDeviceApply(d, '42')).rejects.toThrow('private annotation backup');
  expect(localStorage.getItem('chatthing:v1:bookmarks:42')).toContain('private-note-canary');
  expect(localStorage.getItem(profileKey('chatthing:v1:sync-annotation-backup'))).toContain('older private note');
});
