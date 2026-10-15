import { validAccount } from './account-profiles';
export const USER_NOTE_BYTES = 1024 * 1024;
export interface UserNote {
  id: string;
  login: string;
  text: string;
  updated: number;
}
export interface UserNoteBackup {
  format: 'chatty-cat-user-notes';
  version: 1;
  account: string;
  notes: UserNote[];
}
function validNote(row: unknown): row is UserNote {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    validAccount(r.id) &&
    typeof r.login === 'string' &&
    /^[a-z0-9_]{1,25}$/.test(r.login) &&
    typeof r.text === 'string' &&
    r.text.length <= 2000 &&
    typeof r.updated === 'number' &&
    Number.isSafeInteger(r.updated) &&
    r.updated >= 0 &&
    r.updated <= 8640000000000000
  );
}
export function parseUserNotes(raw: string): UserNoteBackup {
  if (new Blob([raw]).size > USER_NOTE_BYTES) throw new Error('User note backup exceeds 1 MB');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('User note backup is not valid JSON');
  }
  if (!value || typeof value !== 'object') throw new Error('Invalid user note backup');
  const v = value as Record<string, unknown>;
  if (
    v.format !== 'chatty-cat-user-notes' ||
    v.version !== 1 ||
    typeof v.account !== 'string' ||
    !validAccount(v.account) ||
    !Array.isArray(v.notes) ||
    v.notes.length > 200 ||
    !v.notes.every(validNote) ||
    new Set(v.notes.map((n) => n.id)).size !== v.notes.length
  )
    throw new Error('Invalid user note backup');
  return {
    format: 'chatty-cat-user-notes',
    version: 1,
    account: v.account,
    notes: v.notes.map((n) => ({ id: n.id, login: n.login, text: n.text, updated: n.updated })),
  };
}
export class UserNotes {
  private account: string | undefined;
  private raw: string | null = null;
  private get key(): string {
    if (!this.account) throw new Error('Log in before editing private user notes');
    return 'chatthing:v1:user-notes:' + this.account;
  }
  setAccount(account: string | undefined): void {
    if (account !== undefined && !validAccount(account)) throw new Error('Invalid user note account');
    this.account = account;
    this.raw = account ? localStorage.getItem(this.key) : null;
  }
  list(): UserNote[] {
    if (!this.account) return [];
    const raw = localStorage.getItem(this.key);
    const notes = raw ? parseUserNotes(raw) : undefined;
    if (notes && notes.account !== this.account) throw new Error('Stored notes belong to another account');
    return notes?.notes ?? [];
  }
  get(id: string): UserNote | undefined {
    return this.list().find((n) => n.id === id);
  }
  private write(notes: UserNote[]): void {
    const account = this.account,
      key = this.key;
    if (localStorage.getItem(key) !== this.raw)
      throw new Error('User notes changed in another tab; reopen before saving');
    const raw = JSON.stringify({ format: 'chatty-cat-user-notes', version: 1, account, notes });
    parseUserNotes(JSON.stringify({ format: 'chatty-cat-user-notes', version: 1, account, notes }, null, 2));
    localStorage.setItem(key, raw);
    this.raw = raw;
  }
  save(id: string, login: string, text: string): void {
    const note = { id, login, text, updated: Date.now() };
    if (!validNote(note)) throw new Error('Use a valid user identity and at most 2,000 note characters');
    const notes = this.list(),
      index = notes.findIndex((n) => n.id === id);
    if (index >= 0) notes[index] = note;
    else {
      if (notes.length >= 200) throw new Error('Keep at most 200 user notes per account');
      notes.push(note);
    }
    this.write(notes);
  }
  delete(id: string): void {
    this.write(this.list().filter((n) => n.id !== id));
  }
  clear(): void {
    this.write([]);
  }
  export(): string {
    return JSON.stringify(
      { format: 'chatty-cat-user-notes', version: 1, account: this.account, notes: this.list() },
      null,
      2,
    );
  }
  import(backup: UserNoteBackup): number {
    const safe = parseUserNotes(JSON.stringify(backup));
    if (safe.account !== this.account)
      throw new Error('This backup belongs to another account; switch accounts before importing');
    const notes = this.list(),
      ids = new Set(notes.map((n) => n.id)),
      added = safe.notes.filter((n) => !ids.has(n.id));
    if (notes.length + added.length > 200) throw new Error('Import would exceed 200 user notes');
    this.write([...notes, ...added]);
    return added.length;
  }
}
