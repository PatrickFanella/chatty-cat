import { getProfileScope, profileKey } from './account-profiles';
import { parseDisplay, type DisplayOptions } from './display';
import { parsePresentation, type PresentationOptions } from './presentation';
import { parseOptions, type PickerOptions } from './picker-model';
import { parseProviderPreferences, type ProviderPreferences } from './provider-preferences';
import { parseLinkPreferences, type LinkPreferences } from './link-preferences';
import { parseWorkspaceFile, workspaceFile, type Workspace } from './workspaces';
import { parseSplits, type SplitPane, type SplitSnapshot } from './splits';
import { parseBookmarks, bookmarkIdentity, type Bookmark } from './bookmarks';
export interface DevicePreferences {
  display: DisplayOptions;
  presentation: PresentationOptions;
  picker: PickerOptions;
  provider: ProviderPreferences;
  links: LinkPreferences;
}
export interface DeviceSelection {
  workspaces: boolean;
  preferences: boolean;
  bookmarks: boolean;
}
type PublicBookmark = Omit<Bookmark, 'note' | 'tags'>;
export interface DeviceDocument {
  format: 'chatty-cat-device-sync';
  version: 1;
  activeWorkspace?: string;
  workspaces?: Workspace[];
  preferences?: DevicePreferences;
  bookmarks?: PublicBookmark[];
}
export interface DeviceData {
  activeWorkspace?: string;
  workspaces: Workspace[];
  preferences: DevicePreferences;
  bookmarks: Bookmark[];
}
const LIMIT = 2 * 1024 * 1024;
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function bytes(raw: string): number {
  return new TextEncoder().encode(raw).length;
}
function publicWorkspace(value: Workspace): Workspace {
  const workspace = parseWorkspaceFile(workspaceFile([value]))[0]!;
  workspace.readers = [];
  const split = parseSplits(workspace.settings.extras.splits, workspace.channels);
  if (split) {
    for (const tab of split.tabs)
      for (const pane of tab.panes) {
        pane.reader = null;
        pane.unread = 0;
      }
    for (const closed of split.closed) {
      if (closed.kind === 'pane') {
        closed.pane.reader = null;
        closed.pane.unread = 0;
      } else
        for (const pane of closed.tab.panes) {
          pane.reader = null;
          pane.unread = 0;
        }
    }
    workspace.settings.extras.splits = split;
  }
  return workspace;
}
function publicBookmark(value: Bookmark): PublicBookmark {
  const { note: _note, tags: _tags, ...publicValue } = value;
  return publicValue;
}
function localReaders(next: Workspace, previous: Workspace | undefined): Workspace {
  if (!previous) return next;
  next.readers = previous.readers.filter((p) => next.channels.includes(p.key.split(':')[0]!));
  const incoming = parseSplits(next.settings.extras.splits, next.channels),
    saved = parseSplits(previous.settings.extras.splits, previous.channels);
  const panes = (s: SplitSnapshot): SplitPane[] => [
    ...s.tabs.flatMap((t) => t.panes),
    ...s.closed.flatMap((c) => (c.kind === 'pane' ? [c.pane] : c.tab.panes)),
  ];
  if (incoming && saved) {
    const before = panes(saved);
    for (const pane of panes(incoming)) {
      const old = before.find(
        (p) =>
          p.id === pane.id &&
          p.channels.join(',') === pane.channels.join(',') &&
          p.filter === pane.filter &&
          p.reverse === pane.reverse &&
          JSON.stringify(p.rules) === JSON.stringify(pane.rules),
      );
      if (old) {
        pane.reader = old.reader;
        pane.unread = old.unread;
      }
    }
    next.settings.extras.splits = incoming;
  }
  return next;
}
function parsePreferences(v: unknown): DevicePreferences {
  if (
    !record(v) ||
    Object.keys(v).length !== 5 ||
    !['display', 'presentation', 'picker', 'provider', 'links'].every((k) => record(v[k]))
  )
    throw new Error('Invalid sync preferences');
  return {
    display: parseDisplay(v.display),
    presentation: parsePresentation(v.presentation),
    picker: parseOptions(v.picker),
    provider: parseProviderPreferences(v.provider),
    links: parseLinkPreferences(v.links),
  };
}
export function parseDeviceDocument(v: unknown): DeviceDocument {
  if (
    !record(v) ||
    v.format !== 'chatty-cat-device-sync' ||
    v.version !== 1 ||
    Object.keys(v).some(
      (k) => !['format', 'version', 'activeWorkspace', 'workspaces', 'preferences', 'bookmarks'].includes(k),
    ) ||
    bytes(JSON.stringify(v)) > LIMIT
  )
    throw new Error('Invalid public device snapshot');
  const result: DeviceDocument = { format: 'chatty-cat-device-sync', version: 1 };
  if (v.workspaces !== undefined) {
    if (!Array.isArray(v.workspaces) || v.workspaces.length < 1) throw new Error('Use 1–20 portable workspaces');
    result.workspaces = parseWorkspaceFile(
      JSON.stringify({ format: 'chatty-cat-workspaces', version: 1, workspaces: v.workspaces }),
    ).map(publicWorkspace);
  }
  if (v.activeWorkspace !== undefined) {
    if (typeof v.activeWorkspace !== 'string' || !result.workspaces?.some((w) => w.id === v.activeWorkspace))
      throw new Error('Active workspace is not selected');
    result.activeWorkspace = v.activeWorkspace;
  }
  if (v.preferences !== undefined) result.preferences = parsePreferences(v.preferences);
  if (v.bookmarks !== undefined) {
    if (!Array.isArray(v.bookmarks) || v.bookmarks.some((b) => !record(b) || 'note' in b || 'tags' in b))
      throw new Error('Sync excludes private bookmark annotations');
    const entries = parseBookmarks(
      JSON.stringify({
        format: 'chatty-cat-bookmarks',
        version: 1,
        bookmarks: v.bookmarks.map((b) => ({ ...b, note: '', tags: [] })),
      }),
    );
    result.bookmarks = entries.map(publicBookmark);
  }
  if (!result.workspaces && !result.preferences && !result.bookmarks)
    throw new Error('Select at least one record category');
  if (bytes(JSON.stringify(result)) > LIMIT) throw new Error('Selected sync records exceed two MiB');
  return result;
}
export function makeDeviceDocument(selection: DeviceSelection, data: DeviceData): DeviceDocument {
  const raw: DeviceDocument = { format: 'chatty-cat-device-sync', version: 1 };
  if (selection.workspaces) {
    raw.workspaces = data.workspaces.map(publicWorkspace);
    if (data.activeWorkspace) raw.activeWorkspace = data.activeWorkspace;
  }
  if (selection.preferences) raw.preferences = parsePreferences(data.preferences);
  if (selection.bookmarks) raw.bookmarks = data.bookmarks.map(publicBookmark);
  return parseDeviceDocument(raw);
}
function account(scope: string): void {
  if (getProfileScope() !== scope || !/^[1-9][0-9]{0,31}$/.test(scope))
    throw new Error('Sync account changed; reopen and review');
}
function bookmarkFile(entries: readonly Bookmark[]): string {
  return JSON.stringify({ format: 'chatty-cat-bookmarks', version: 1, bookmarks: entries });
}
function bookmarkKey(b: Bookmark | PublicBookmark): string {
  return b.kind + ':' + bookmarkIdentity(b.message);
}
interface Entry {
  key: string;
  before: string | null;
  after: string;
}
export interface DeviceApplyPlan {
  account: string;
  entries: Entry[];
  summary: string;
}
function localKeys(scope: string): string[] {
  account(scope);
  return [
    'chatthing:v1:workspaces',
    'chatthing:v1:display',
    'chatthing:v1:presentation',
    'chatthing:v1:picker:options',
    'chatthing:v1:provider-preferences',
    'chatthing:v1:link-preferences',
    'chatthing:v1:sync-annotation-backup',
  ]
    .map(profileKey)
    .concat('chatthing:v1:bookmarks:' + scope);
}
export async function planDeviceApply(value: DeviceDocument, scope: string): Promise<DeviceApplyPlan> {
  account(scope);
  const document = parseDeviceDocument(value),
    entries: Entry[] = [];
  const add = (key: string, after: string): void => {
    entries.push({ key, before: localStorage.getItem(key), after });
  };
  let removed = 0,
    privateBackups = 0,
    older = 0;
  const workspaceKey = profileKey('chatthing:v1:workspaces'),
    oldWorkspaceRaw = localStorage.getItem(workspaceKey);
  let workspaces: Workspace[] = [],
    active = '';
  if (oldWorkspaceRaw) {
    const raw: unknown = JSON.parse(oldWorkspaceRaw);
    if (!record(raw) || raw.version !== 1 || !Array.isArray(raw.workspaces))
      throw new Error('Local workspaces are unreadable; data retained');
    workspaces = parseWorkspaceFile(
      JSON.stringify({ format: 'chatty-cat-workspaces', version: 1, workspaces: raw.workspaces }),
    );
    active = typeof raw.active === 'string' ? raw.active : '';
  }
  if (document.workspaces) {
    removed += workspaces.filter((w) => !document.workspaces?.some((next) => next.id === w.id)).length;
    const previous = workspaces;
    workspaces = document.workspaces.map((w) =>
      localReaders(
        publicWorkspace(w),
        previous.find((old) => old.id === w.id),
      ),
    );
    if (document.activeWorkspace) active = document.activeWorkspace;
    else if (!workspaces.some((w) => w.id === active)) active = workspaces[0]!.id;
  }
  if (document.preferences) {
    const p = document.preferences;
    add(profileKey('chatthing:v1:display'), JSON.stringify(p.display));
    add(profileKey('chatthing:v1:presentation'), JSON.stringify(p.presentation));
    add(profileKey('chatthing:v1:picker:options'), JSON.stringify(p.picker));
    add(profileKey('chatthing:v1:provider-preferences'), JSON.stringify(p.provider));
    add(profileKey('chatthing:v1:link-preferences'), JSON.stringify(p.links));
    workspaces = workspaces.map((w) =>
      w.id === active
        ? {
            ...w,
            settings: {
              ...w.settings,
              display: p.display,
              extras: {
                ...w.settings.extras,
                presentation: p.presentation,
                picker: { ...(record(w.settings.extras.picker) ? w.settings.extras.picker : {}), options: p.picker },
              },
            },
          }
        : w,
    );
  }
  if ((document.workspaces || document.preferences) && workspaces.length)
    add(workspaceKey, JSON.stringify({ version: 1, active, workspaces }));
  if (document.bookmarks) {
    const key = 'chatthing:v1:bookmarks:' + scope,
      raw = localStorage.getItem(key),
      existing = raw ? parseBookmarks(raw) : [],
      byIdentity = new Map(existing.map((b) => [bookmarkKey(b), b]));
    const incoming = document.bookmarks.map((publicValue) => {
      const old = byIdentity.get(bookmarkKey(publicValue));
      if (old && publicValue.updated < old.updated) older++;
      return {
        ...publicValue,
        note: old?.note ?? '',
        tags: old?.tags ?? [],
        updated: Math.max(publicValue.updated, old?.updated ?? 0),
      };
    });
    parseBookmarks(bookmarkFile(incoming));
    const removedEntries = existing.filter(
      (b) => !document.bookmarks?.some((next) => bookmarkKey(next) === bookmarkKey(b)),
    );
    removed += removedEntries.length;
    const backupKey = profileKey('chatthing:v1:sync-annotation-backup'),
      saved = localStorage.getItem(backupKey),
      backups = saved ? parseBookmarks(saved) : [];
    const protectedRows = removedEntries.filter((b) => b.note || b.tags.length);
    for (const row of protectedRows) {
      const previous = backups.find((b) => bookmarkKey(b) === bookmarkKey(row));
      if (previous && (previous.note !== row.note || JSON.stringify(previous.tags) !== JSON.stringify(row.tags)))
        throw new Error(
          'An older private annotation backup differs. Export and review clearing that backup before applying; current bookmarks are retained.',
        );
      if (!previous) backups.push(row);
    }
    if (protectedRows.length) {
      parseBookmarks(bookmarkFile(backups));
      add(backupKey, bookmarkFile(backups));
    }
    privateBackups = protectedRows.length;
    add(key, bookmarkFile(incoming));
  }
  const summary =
    'Apply ' +
    (document.workspaces?.length ?? 0) +
    ' workspaces; ' +
    (document.preferences ? 'common preferences including the active workspace view' : 'preferences unchanged') +
    '; ' +
    (document.bookmarks?.length ?? 0) +
    ' public bookmarks. Remove ' +
    removed +
    ' selected local public records. ' +
    older +
    ' incoming bookmark records have older timestamps. ' +
    privateBackups +
    ' removed bookmarks with private annotations are retained in a local-only backup. Drafts, aliases, whispers, journals, held feedback and other namespaces stay local. Reload applies the selected view. Active workspace: ' +
    active +
    '.';
  if (entries.length > 8 || entries.some((e) => bytes(e.after) > LIMIT))
    throw new Error('Local sync apply exceeds bounds');
  return { account: scope, entries, summary };
}
interface JournalEntry {
  key: string;
  before: string | null;
  afterDigest: string;
}
interface Journal {
  version: 1;
  account: string;
  state: 0 | 1 | 2;
  started: number;
  entries: JournalEntry[];
}
async function digest(raw: string): Promise<string> {
  const value = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(value)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function journalKey(scope: string): string {
  return 'chatthing:v1:profile:' + scope + ':sync-local-recovery';
}
function parseJournal(raw: string, scope: string): Journal {
  if (bytes(raw) > 3 * 1024 * 1024) throw new Error('Local recovery exceeds bounds');
  const v: unknown = JSON.parse(raw);
  if (
    !record(v) ||
    v.version !== 1 ||
    v.account !== scope ||
    (v.state !== 0 && v.state !== 1 && v.state !== 2) ||
    typeof v.started !== 'number' ||
    !Number.isSafeInteger(v.started) ||
    v.started < 0 ||
    v.started > Date.now() + 300000 ||
    !Array.isArray(v.entries) ||
    v.entries.length > 8
  )
    throw new Error('Local recovery unavailable');
  const keys = localKeys(scope),
    entries: JournalEntry[] = v.entries.map((e) => {
      if (
        !record(e) ||
        typeof e.key !== 'string' ||
        !keys.includes(e.key) ||
        (e.before !== null && typeof e.before !== 'string') ||
        typeof e.afterDigest !== 'string' ||
        !/^[a-f0-9]{64}$/.test(e.afterDigest) ||
        (typeof e.before === 'string' && bytes(e.before) > LIMIT)
      )
        throw new Error('Invalid local recovery entry');
      return { key: e.key, before: e.before, afterDigest: e.afterDigest };
    });
  if (new Set(entries.map((e) => e.key)).size !== entries.length) throw new Error('Duplicate local recovery keys');
  return { version: 1, account: scope, state: v.state, started: v.started, entries };
}
async function rollback(journal: Journal): Promise<string> {
  account(journal.account);
  const expected = JSON.stringify(journal);
  if (localStorage.getItem(journalKey(journal.account)) !== expected)
    return 'Another local apply completed or changed; reload and review';
  let conflict = false;
  const restore: { entry: JournalEntry; current: string }[] = [];
  for (const entry of journal.entries) {
    const current = localStorage.getItem(entry.key);
    if (current === entry.before) continue;
    if (current !== null && (await digest(current)) === entry.afterDigest) restore.push({ entry, current });
    else conflict = true;
  }
  account(journal.account);
  if (localStorage.getItem(journalKey(journal.account)) !== expected)
    return 'Another local apply completed or changed; reload and review';
  for (const { entry, current } of restore) {
    if (localStorage.getItem(entry.key) !== current) {
      conflict = true;
      continue;
    }
    localStorage.removeItem(entry.key);
    if (entry.before !== null) localStorage.setItem(entry.key, entry.before);
  }
  journal.state = conflict ? 2 : 1;
  localStorage.setItem(journalKey(journal.account), JSON.stringify(journal));
  return conflict
    ? 'Concurrent local edits interrupted recovery; newer edits were retained. Export the local recovery backup before another apply.'
    : 'Interrupted local sync apply was rolled back; data retained';
}
export async function recoverDeviceApply(scope: string): Promise<string> {
  if (scope === 'anonymous') return '';
  account(scope);
  const raw = localStorage.getItem(journalKey(scope));
  if (!raw) return '';
  try {
    const journal = parseJournal(raw, scope);
    return journal.state === 0
      ? Date.now() - journal.started < 30000
        ? 'A local apply may still be active; wait 30 seconds and reload before recovering'
        : await rollback(journal)
      : journal.state === 2
        ? 'Local recovery conflict requires review before applying another snapshot'
        : '';
  } catch {
    return 'Local recovery could not be read; data retained. Review/export before another sync apply.';
  }
}
export async function commitDeviceApply(plan: DeviceApplyPlan, guard: () => boolean = () => true): Promise<void> {
  account(plan.account);
  if (!guard()) throw new Error('Account or current action changed');
  if (await recoverDeviceApply(plan.account)) throw new Error('Local recovery changed; reload and review');
  for (const e of plan.entries)
    if (localStorage.getItem(e.key) !== e.before)
      throw new Error('Local records changed in another tab; reopen and review');
  const entries: JournalEntry[] = await Promise.all(
    plan.entries.map(async (e) => ({ key: e.key, before: e.before, afterDigest: await digest(e.after) })),
  );
  account(plan.account);
  if (!guard()) throw new Error('Account or current action changed');
  for (const e of plan.entries)
    if (localStorage.getItem(e.key) !== e.before)
      throw new Error('Local records changed in another tab; reopen and review');
  const journal: Journal = { version: 1, account: plan.account, state: 0, started: Date.now(), entries };
  const raw = JSON.stringify(journal);
  parseJournal(raw, plan.account);
  localStorage.setItem(journalKey(plan.account), raw);
  try {
    for (const e of plan.entries) {
      if (localStorage.getItem(e.key) !== e.before) throw new Error('Local records changed during apply');
      localStorage.setItem(e.key, e.after);
    }
    for (const e of plan.entries)
      if (localStorage.getItem(e.key) !== e.after) throw new Error('Local records changed during apply');
    journal.state = 1;
    localStorage.setItem(journalKey(journal.account), JSON.stringify(journal));
  } catch (error) {
    try {
      await rollback(journal);
    } catch {
      throw new Error(
        'Local apply interrupted; the recovery backup is retained. Reload and review before another action',
      );
    }
    throw error;
  }
}
