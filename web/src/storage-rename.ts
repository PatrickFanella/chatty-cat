// Moves localStorage and sessionStorage keys to the current prefix. Each page entry imports this
// module first, so it runs before any other module reads storage. No imports: keep it that way.
const FORMER = 'chatthing:v1:'; // Prefix used by older versions; kept only to move the data they saved.
const CURRENT = 'chatty-cat:v1:';

// A device sync recovery journal lists the keys it changed; they must match the renamed keys.
function renameJournal(raw: string): string {
  try {
    const journal: unknown = JSON.parse(raw);
    if (!journal || typeof journal !== 'object' || !Array.isArray((journal as { entries?: unknown }).entries))
      return raw;
    for (const entry of (journal as { entries: unknown[] }).entries) {
      const key = entry && typeof entry === 'object' ? (entry as { key?: unknown }).key : undefined;
      if (typeof key === 'string' && key.startsWith(FORMER))
        (entry as { key: string }).key = CURRENT + key.slice(FORMER.length);
    }
    return JSON.stringify(journal);
  } catch {
    return raw; // Device sync reports an unreadable journal itself.
  }
}

// Copy, then delete. When both keys exist the current one wins: only a tab still running an older
// version can have written the old key after the move.
export function renameStoredKeys(area: Storage): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < area.length; i++) {
      const key = area.key(i);
      if (key?.startsWith(FORMER)) keys.push(key);
    }
    for (const old of keys) {
      const raw = area.getItem(old);
      if (raw === null) continue;
      const key = CURRENT + old.slice(FORMER.length);
      const value = key.endsWith(':sync-local-recovery') ? renameJournal(raw) : raw;
      if (area.getItem(key) === null) {
        try {
          area.setItem(key, value);
        } catch {
          // No room for two copies (statistics values can be megabytes): free the old key first,
          // and put it back if the copy still does not fit.
          area.removeItem(old);
          try {
            area.setItem(key, value);
          } catch {
            try {
              area.setItem(old, raw);
            } catch {
              /* Another tab took the freed space; nothing more can be kept. */
            }
            continue;
          }
        }
        if (area.getItem(key) !== value) continue;
      }
      area.removeItem(old);
    }
  } catch {
    /* Storage unavailable or blocked; the page starts with defaults. */
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  try {
    renameStoredKeys(globalThis[name]);
  } catch {
    /* Reading the storage object itself can throw when site data is blocked. */
  }
}
