import type { ChannelMetadata } from './metadata';
import { getPresentation, type PresentationOptions } from './presentation';

export function streamHeader(
  stream: ChannelMetadata['stream'],
  options: PresentationOptions = getPresentation(),
): string {
  return [
    options.headerUptime ? stream.uptime : '',
    options.headerViewers && /^\d+$/.test(stream.viewers) ? `${Number(stream.viewers).toLocaleString()} viewers` : '',
    options.headerGame ? (stream.game ?? '') : '',
    options.headerTitle ? stream.title : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
