export const MAX_CHARS = 6000000;
export interface StatisticsMove {
  entries: { key: string; raw: string }[];
  characters: number;
}
export function validKey(key: string): boolean {
  return /^chatthing:v1:stats:counts:[a-z0-9_]{1,25}(?:,[a-z0-9_]{1,25}){0,11}$/.test(key);
}
export function validateStatisticsMove(plan: StatisticsMove): void {
  if (!plan.entries.length) throw new Error('No local statistics need moving');
  if (
    plan.entries.length > 64 ||
    plan.entries.reduce((total, e) => total + e.key.length + e.raw.length, 0) > MAX_CHARS ||
    new Set(plan.entries.map((e) => e.key)).size !== plan.entries.length ||
    plan.entries.some((e) => !validKey(e.key) || e.raw.length > MAX_CHARS)
  )
    throw new Error('Invalid statistics move');
}
