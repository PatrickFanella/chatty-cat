import { StorageWorkerClient } from './storage-worker-client';
import type { StatisticsOperation, StorageOperations } from './storage-worker-protocol';
import { MAX_CHARS, validKey, validateStatisticsMove, type StatisticsMove } from './statistics-records';
export type { StatisticsMove } from './statistics-records';

async function inWorker<K extends StatisticsOperation>(
  operation: K,
  ...args: StorageOperations[K]['args']
): Promise<StorageOperations[K]['result']> {
  const worker = new StorageWorkerClient(
    undefined,
    30000,
    'Statistics worker unavailable; retained originals are unchanged. Reload before another storage operation.',
  );
  try {
    return await worker.request(operation, ...args);
  } finally {
    await worker.stop();
  }
}
export async function readStatistics(key: string): Promise<string | undefined> {
  if (!validKey(key)) throw new Error('Invalid statistics scope');
  return inWorker('statistics.read', key);
}
export async function writeStatistics(key: string, raw: string): Promise<void> {
  if (!validKey(key)) throw new Error('Invalid statistics scope');
  if (raw.length > MAX_CHARS) throw new Error('Statistics capacity reached');
  await inWorker('statistics.write', key, raw);
}
export async function writeStatisticsSnapshot(key: string, snapshot: unknown): Promise<void> {
  if (!validKey(key)) throw new Error('Invalid statistics scope');
  await inWorker('statistics.snapshot', key, snapshot);
}
export function previewStatisticsMove(): StatisticsMove {
  const entries: { key: string; raw: string }[] = [];
  let characters = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !validKey(key)) continue;
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    if (raw.length > MAX_CHARS || entries.length >= 64)
      throw new Error('Statistics scope exceeds the reviewed migration capacity');
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      (value as { version?: unknown }).version !== 1 ||
      !Object.keys(value).every((key) => ['version', 'since', 'limited', 'seen', 'pending', 'rows'].includes(key)) ||
      !Array.isArray((value as { rows?: unknown }).rows)
    )
      throw new Error('Unreadable statistics retained; export/review them before moving');
    entries.push({ key, raw });
    characters += key.length + raw.length;
    if (characters > MAX_CHARS) throw new Error('Statistics move exceeds the reviewed total capacity');
  }
  return { entries, characters };
}
export async function moveStatistics(plan: StatisticsMove): Promise<{ moved: number; changed: number }> {
  // Capture the reviewed values before yielding to the worker or caller again.
  const reviewed = { entries: plan.entries.map((entry) => ({ ...entry })), characters: plan.characters };
  validateStatisticsMove(reviewed);
  if (reviewed.entries.some((entry) => localStorage.getItem(entry.key) !== entry.raw))
    throw new Error('Statistics changed; review the move again');
  await inWorker('statistics.copy', reviewed);
  let moved = 0,
    changed = 0;
  for (const entry of reviewed.entries) {
    if (localStorage.getItem(entry.key) !== entry.raw) {
      changed++;
      continue;
    }
    localStorage.removeItem(entry.key);
    moved++;
  }
  return { moved, changed };
}
