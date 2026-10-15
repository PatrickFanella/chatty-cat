import { validBroadcasterJournalCommand } from './broadcaster-actions';
import { validPredictionJournalCommand } from './predictions';
import { validPollJournalCommand } from './polls';
import { validAutoModJournalCommand } from './automod';
import { validAccount } from './account-profiles';
import { validModerationCommand } from './moderation';
export interface JournalEntry {
  id: string;
  at: number;
  channel: string;
  target: string;
  command: string;
  outcome: 'pending' | 'confirmed' | 'rejected' | 'uncertain';
  detail: string;
  broadcasterID?: string;
  targetID?: string;
}
export interface JournalPolicy {
  rows: number;
  days: number;
}
export interface JournalState {
  account: string;
  policy: JournalPolicy;
  entries: JournalEntry[];
}
export interface JournalPlan {
  account: string;
  at: number;
  policy: JournalPolicy;
  remove: number;
  signature: string;
}
export const JOURNAL_BYTES = 1024 * 1024;
function policy(value: JournalPolicy): JournalPolicy {
  if (!Number.isInteger(value.rows) || value.rows < 100 || value.rows > 1000 || ![0, 7, 30, 90].includes(value.days))
    throw new Error('Choose 100–1,000 journal rows and no age limit or 7/30/90 days');
  return { rows: value.rows, days: value.days };
}
function entry(value: unknown): JournalEntry {
  if (!value || typeof value !== 'object') throw new Error('Invalid journal receipt');
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== 'string' ||
    !/^[A-Za-z0-9_-]{16,64}$/.test(v.id) ||
    !Number.isSafeInteger(v.at) ||
    Number(v.at) < 0 ||
    Number(v.at) > 8640000000000000 ||
    typeof v.channel !== 'string' ||
    !/^[a-z0-9_]{1,25}$/.test(v.channel) ||
    typeof v.target !== 'string' ||
    v.target.length > 128 ||
    typeof v.command !== 'string' ||
    (!validModerationCommand(v.command) &&
      !validAutoModJournalCommand(v.command) &&
      !validPollJournalCommand(v.command) &&
      !validPredictionJournalCommand(v.command) &&
      !validBroadcasterJournalCommand(v.command)) ||
    typeof v.outcome !== 'string' ||
    !['pending', 'confirmed', 'rejected', 'uncertain'].includes(v.outcome) ||
    typeof v.detail !== 'string' ||
    v.detail.length > 300
  )
    throw new Error('Invalid journal receipt');
  for (const key of ['broadcasterID', 'targetID'])
    if (v[key] !== undefined && (typeof v[key] !== 'string' || !validAccount(v[key])))
      throw new Error('Invalid journal identity');
  return {
    ...(typeof v.broadcasterID === 'string' ? { broadcasterID: v.broadcasterID } : {}),
    ...(typeof v.targetID === 'string' ? { targetID: v.targetID } : {}),
    id: v.id,
    at: Number(v.at),
    channel: v.channel,
    target: v.target,
    command: v.command,
    outcome: v.outcome as JournalEntry['outcome'],
    detail: v.detail,
  };
}
function state(value: unknown, account: string): JournalState {
  if (value === undefined) return { account, policy: { rows: 1000, days: 30 }, entries: [] };
  if (!value || typeof value !== 'object') throw new Error('Invalid journal');
  const v = value as JournalState;
  if (v.account !== account || !Array.isArray(v.entries) || v.entries.length > 1000)
    throw new Error('Invalid journal account/capacity');
  const entries = v.entries.map(entry);
  if (new Set(entries.map((e) => e.id)).size !== entries.length) throw new Error('Duplicate journal receipt');
  return {
    account,
    policy: policy(v.policy),
    entries: entries.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)),
  };
}
export function journalExport(value: JournalState): string {
  return JSON.stringify(
    {
      format: 'chatty-cat-private-moderation-journal',
      version: 1,
      ...value,
      notice:
        'Private local action outcomes, not Twitch audit history. Pending receipts have no confirmed outcome. No automatic retries.',
    },
    null,
    2,
  );
}
function bounded(value: JournalState): void {
  const reserve = value.entries.filter((e) => e.outcome === 'pending').length * 1000;
  if (new Blob([journalExport(value)]).size + reserve > JOURNAL_BYTES)
    throw new Error('Private journal capacity reached; review/export retained receipts before removing any');
}
function retained(value: JournalState, p: JournalPolicy, at: number, protectPending = false): JournalEntry[] {
  const cutoff = p.days ? at - p.days * 86400000 : 0;
  const rows = value.entries.filter((e) => e.at >= cutoff || (protectPending && e.outcome === 'pending'));
  const remove = Math.max(0, rows.length - p.rows),
    eligible = rows.filter((e) => !protectPending || e.outcome !== 'pending').slice(0, remove),
    ids = new Set(eligible.map((e) => e.id));
  return rows.filter((e) => !ids.has(e.id));
}
export class ModerationJournal {
  private db: Promise<IDBDatabase>;
  private unavailable = '';
  constructor() {
    this.db = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('Private journal storage unavailable'));
        return;
      }
      const q = indexedDB.open('chatthing-moderation-journal', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('profiles', { keyPath: 'account' });
      q.onsuccess = () => {
        q.result.onclose = () => {
          this.unavailable =
            'Private journal storage closed unexpectedly; reload and check retained receipts before another action. Browser cleanup or low disk space may have removed local data.';
        };
        q.result.onversionchange = () => {
          this.unavailable =
            'Private journal storage changed; reload and check retained receipts before another action.';
          q.result.close();
        };
        resolve(q.result);
      };
      q.onerror = () => reject(q.error ?? new Error('Private journal unavailable'));
    });
    void this.db.catch(() => {});
  }
  private async transaction<T>(account: string, write: boolean, operation: (value: JournalState) => T): Promise<T> {
    if (!validAccount(account)) throw new Error('Log in to use the private journal');
    const db = await this.db;
    if (this.unavailable) throw new Error(this.unavailable);
    let tx: IDBTransaction;
    try {
      tx = db.transaction('profiles', write ? 'readwrite' : 'readonly');
    } catch (e) {
      if (e && typeof e === 'object' && 'name' in e && e.name === 'InvalidStateError') {
        this.unavailable =
          'Private journal storage closed unexpectedly; reload and check retained receipts before another action. No journal transaction was started.';
        throw new Error(this.unavailable);
      }
      throw e;
    }
    const store = tx.objectStore('profiles');
    return new Promise((resolve, reject) => {
      let result: T, failure: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Journal transaction aborted'));
      tx.onerror = () => {
        failure = tx.error;
      };
      const q = store.get(account);
      q.onsuccess = () => {
        try {
          const value = state(q.result, account);
          result = operation(value);
          if (write) {
            bounded(value);
            store.put(value);
          }
        } catch (e) {
          failure = e;
          tx.abort();
        }
      };
    });
  }
  list(account: string): Promise<JournalState> {
    return this.transaction(account, false, (value) => value);
  }
  begin(account: string, receipt: JournalEntry): Promise<void> {
    return this.transaction(account, true, (value) => {
      const safe = entry(receipt);
      if (safe.outcome !== 'pending') throw new Error('Begin with an unconfirmed receipt');
      if (value.entries.some((e) => e.id === safe.id))
        throw new Error('Review each action separately; receipt identity already exists');
      value.entries = retained(value, { ...value.policy, rows: Math.max(0, value.policy.rows - 1) }, Date.now(), true);
      if (value.entries.length >= value.policy.rows)
        throw new Error('Journal is full of pending outcomes; export/review them before another action');
      value.entries.push(safe);
    });
  }
  finish(
    account: string,
    id: string,
    outcome: Exclude<JournalEntry['outcome'], 'pending'>,
    detail: string,
  ): Promise<boolean> {
    return this.transaction(account, true, (value) => {
      const saved = value.entries.find((e) => e.id === id);
      if (!saved || saved.outcome !== 'pending') return false;
      saved.outcome = outcome;
      saved.detail = detail.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').slice(0, 300);
      entry(saved);
      return true;
    });
  }
  preview(account: string, p: JournalPolicy): Promise<JournalPlan> {
    return this.transaction(account, false, (value) => {
      const at = Date.now(),
        next = policy(p);
      return {
        account,
        at,
        policy: next,
        remove: value.entries.length - retained(value, next, at).length,
        signature: JSON.stringify(value),
      };
    });
  }
  apply(plan: JournalPlan): Promise<void> {
    return this.transaction(plan.account, true, (value) => {
      if (JSON.stringify(value) !== plan.signature) throw new Error('Journal changed; preview retention again');
      value.policy = policy(plan.policy);
      value.entries = retained(value, value.policy, plan.at);
    });
  }
  async stop(): Promise<void> {
    this.unavailable = 'Private journal stopped; reload before another action.';
    try {
      (await this.db).close();
    } catch {
      /* Storage was unavailable. */
    }
  }
}
