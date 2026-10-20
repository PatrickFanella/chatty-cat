// Family stems and age thresholds match the original picker.
const familyCollator = new Intl.Collator('en', { sensitivity: 'base' });
export function familyCompare(a: string, b: string): number {
  const stem = (s: string): string =>
    (s.match(/^[a-z]+|^[A-Z](?![a-z])[A-Z]*|^[A-Z][a-z]+|^[0-9]+/)?.[0] ?? s).toLowerCase();
  const compare = familyCollator.compare;
  return compare(stem(a), stem(b)) || compare(a, b);
}
export const AGE_SECONDS = [
  10,
  20,
  30,
  45,
  60,
  90,
  120,
  180,
  240,
  300,
  360,
  420,
  480,
  540,
  600,
  1200,
  1800,
  2400,
  3000,
  3600,
  ...Array.from({ length: 11 }, (_, i) => (i + 2) * 3600),
];
export function ageLabel(seconds: number): string {
  return seconds < 120 && seconds % 60 !== 0
    ? `${seconds}s`
    : seconds < 3600
      ? `${seconds / 60}m`
      : `${seconds / 3600}h`;
}
export function crossedAges(previous: number, age: number): number[] {
  return AGE_SECONDS.filter((s) => s * 1000 > previous && s * 1000 <= age);
}

export function missedAge(seconds: number, now: number, gaps: readonly { from: number; to: number }[]): boolean {
  const duration = seconds * 1000;
  return gaps.some((gap) => Math.min(gap.to, now) - Math.max(gap.from, now - duration) > Math.max(30000, duration / 8));
}
