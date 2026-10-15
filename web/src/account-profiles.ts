export interface AccountProfile {
  id: string;
  login: string;
}
const KEY = 'chatthing:v1:account-profiles';
export const validAccount = (id: string): boolean => /^[0-9]{1,32}$/.test(id);
let scope = 'anonymous';
export function setProfileScope(account: string): void {
  if (account !== 'anonymous' && !validAccount(account)) throw new Error('Invalid account profile');
  scope = account;
}
export function getProfileScope(): string {
  return scope;
}
export function profileKey(key: string): string {
  return scope === 'anonymous' ? key : 'chatthing:v1:profile:' + scope + ':' + key.replace(/^chatthing:v1:/, '');
}
export class AccountProfiles {
  private raw: string | null = null;
  private entries: AccountProfile[] = [];
  private error = '';
  constructor() {
    try {
      this.raw = localStorage.getItem(KEY);
      if (this.raw) {
        if (this.raw.length > 16384) throw new Error();
        const value: unknown = JSON.parse(this.raw);
        if (
          !value ||
          typeof value !== 'object' ||
          !('version' in value) ||
          value.version !== 1 ||
          !('profiles' in value) ||
          !Array.isArray(value.profiles) ||
          value.profiles.length > 8
        )
          throw new Error();
        const seen = new Set<string>();
        for (const row of value.profiles) {
          if (
            !row ||
            typeof row.id !== 'string' ||
            !validAccount(row.id) ||
            typeof row.login !== 'string' ||
            !/^[a-z0-9_]{1,25}$/.test(row.login) ||
            seen.has(row.id)
          )
            throw new Error();
          seen.add(row.id);
          this.entries.push({ id: row.id, login: row.login });
        }
      }
    } catch {
      this.error = 'Saved account profiles could not be read; existing data retained';
    }
  }
  list(): AccountProfile[] {
    if (this.error) throw new Error(this.error);
    return this.entries.map((p) => ({ ...p }));
  }
  private write(entries: AccountProfile[]): void {
    this.list();
    if (localStorage.getItem(KEY) !== this.raw)
      throw new Error('Account profiles changed in another tab; reopen Accounts');
    const raw = JSON.stringify({ version: 1, profiles: entries });
    localStorage.setItem(KEY, raw);
    this.raw = raw;
    this.entries = entries;
  }
  remember(id: string, login: string): void {
    if (!validAccount(id) || !/^[a-z0-9_]{1,25}$/.test(login)) throw new Error('Invalid account profile');
    const entries = this.list(),
      index = entries.findIndex((p) => p.id === id);
    if (index >= 0) entries[index] = { id, login };
    else {
      if (entries.length === 8) throw new Error('Keep at most eight account profiles; forget a saved profile first');
      entries.push({ id, login });
    }
    this.write(entries);
  }
  forget(id: string): void {
    this.write(this.list().filter((p) => p.id !== id));
  }
}
