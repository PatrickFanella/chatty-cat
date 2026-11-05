import type { ChannelMetadata } from './metadata';
import { getPresentation, type PresentationOptions } from './presentation';

export function formatStreamUptime(value: string): string {
  if (!value || /offline|not live|not streaming/i.test(value)) return value;
  let seconds = 0;
  const units: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 };
  const matches = [...value.matchAll(/(\d+)\s*(days?|hours?|minutes?|seconds?|[dhms])(?=\s|\d|,|$)/gi)];
  if (!matches.length) return value;
  for (const match of matches) seconds += Number(match[1]) * units[match[2]![0]!.toLowerCase()]!;
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function streamHeader(
  stream: ChannelMetadata['stream'],
  options: PresentationOptions = getPresentation(),
): string {
  return [
    options.headerUptime ? formatStreamUptime(stream.uptime) : '',
    options.headerViewers && /^\d+$/.test(stream.viewers) ? `${Number(stream.viewers).toLocaleString()} viewers` : '',
    options.headerGame ? (stream.game ?? '') : '',
    options.headerTitle ? stream.title : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
