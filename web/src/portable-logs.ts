import { PUBLIC_ARCHIVE_COMMANDS } from './archive';
export { PUBLIC_ARCHIVE_COMMANDS as PUBLIC_LOG_COMMANDS } from './archive';
import type { ChatMessage } from './protocol';
import type { StreamHistory } from './stream-history';
import { parseVodRange } from './vod-context';
export const LOG_ROWS = 1000,
  LOG_BYTES = 8 * 1024 * 1024;
const TAGS = [
  'system-msg',
  'msg-id',
  'target-msg-id',
  'ban-duration',
  'reply-parent-msg-id',
  'reply-thread-parent-msg-id',
  'reply-parent-user-login',
  'deleted',
  'emotes',
  'bookmark-excerpt',
  'imported-history',
];
export function portableMessage(message: ChatMessage): ChatMessage | undefined {
  if (
    !PUBLIC_ARCHIVE_COMMANDS.includes(message.command) ||
    !/^[a-z0-9_]{1,25}$/.test(message.channel) ||
    (message.login && !/^[a-z0-9_]{1,25}$/i.test(message.login)) ||
    !Number.isSafeInteger(message.timestamp) ||
    message.timestamp < 0 ||
    message.timestamp > 8640000000000000
  )
    return;
  const tags: Record<string, string> = {};
  let clipped = message.text.length > 10000 || message.id.length > 200;
  for (const key of TAGS)
    if (message.tags[key]) {
      tags[key] = message.tags[key]!.slice(0, 2000);
      if (message.tags[key]!.length > 2000) clipped = true;
    }
  if (clipped) tags['log-truncated'] = '1';
  const removed = message.command === 'CLEARMSG' || tags.deleted === '1' || tags.deleted === 'true';
  if (removed) {
    tags.deleted = '1';
    delete tags.emotes;
  }
  return {
    id: message.id.slice(0, 200),
    command: message.command,
    channel: message.channel,
    login: message.login,
    text: removed ? '[removed message]' : message.text.slice(0, 10000),
    timestamp: message.timestamp,
    tags,
  };
}
export class LogModeration {
  private ids = new Set<string>();
  private users = new Set<string>();
  private deleted = new Set<string>();
  private clears = new Map<string, number>();
  constructor(messages: readonly ChatMessage[]) {
    for (const m of messages) {
      this.ids.add(m.channel + ':' + m.id);
      this.users.add(m.channel + ':' + m.login.toLowerCase());
      this.users.add(m.channel + ':');
    }
  }
  observe(message: ChatMessage): void {
    if (message.command === 'CLEARMSG') {
      const key = message.channel + ':' + message.tags['target-msg-id'];
      if (this.ids.has(key)) this.deleted.add(key);
    }
    if (message.command === 'CLEARCHAT') {
      const key = message.channel + ':' + message.text.toLowerCase();
      if (this.users.has(key)) this.clears.set(key, Math.max(this.clears.get(key) ?? -1, message.timestamp));
    }
  }
  redact(message: ChatMessage): ChatMessage {
    return message.command === 'PRIVMSG' &&
      (this.deleted.has(message.channel + ':' + message.id) ||
        message.timestamp <=
          Math.max(
            this.clears.get(message.channel + ':' + message.login.toLowerCase()) ?? -1,
            this.clears.get(message.channel + ':') ?? -1,
          ))
      ? { ...message, text: '[removed message]', tags: { ...message.tags, deleted: '1', emotes: '' } }
      : message;
  }
}
export interface LogGroup {
  channel: string;
  session: string;
  kind: 'known archive range' | 'observed live polls' | 'unassigned';
  start: number | null;
  end: number | null;
  records: number[];
}
export interface LogCoverage {
  requested: { from: number; to: number; channels: string[] | null };
  retained: { rows: number; oldest: number | null; newest: number | null };
  part: number;
  more: boolean;
  truncated: number;
  groups: LogGroup[];
  notice: string;
}
export function logGroups(
  messages: readonly ChatMessage[],
  streams: Pick<StreamHistory, 'archives' | 'samples'>,
): LogGroup[] {
  const ranges = new Map<string, { from: number; to: number }[]>();
  for (const channel of new Set(messages.map((m) => m.channel))) {
    const spans: { from: number; to: number }[] = [];
    let active: { from: number; to: number } | undefined;
    for (const sample of streams.samples(channel, 0).sort((a, b) => a.at - b.at)) {
      if (!sample.live) {
        active = undefined;
        continue;
      }
      if (!active || sample.at - active.to > 90000) {
        active = { from: sample.at, to: sample.at };
        spans.push(active);
      } else active.to = sample.at;
    }
    ranges.set(channel, spans);
  }
  const groups = new Map<string, LogGroup>();
  for (const [index, message] of messages.entries()) {
    const vod = streams
      .archives(message.channel)
      .flatMap((v) => {
        const safe = parseVodRange(v);
        return safe ? [safe] : [];
      })
      .find((v) => message.timestamp >= Date.parse(v.start) && message.timestamp < Date.parse(v.end));
    let group: Omit<LogGroup, 'records'> = {
      channel: message.channel,
      session: 'unassigned',
      kind: 'unassigned',
      start: null,
      end: null,
    };
    if (vod)
      group = {
        channel: message.channel,
        session: vod.url,
        kind: 'known archive range',
        start: Date.parse(vod.start),
        end: Date.parse(vod.end),
      };
    else {
      const span = ranges.get(message.channel)?.find((s) => message.timestamp >= s.from && message.timestamp <= s.to);
      if (span)
        group = {
          channel: message.channel,
          session: 'polls:' + span.from,
          kind: 'observed live polls',
          start: span.from,
          end: span.to,
        };
    }
    const key = message.channel + ':' + group.session,
      old = groups.get(key);
    if (old) {
      old.records.push(index);
      if (group.end !== null) old.end = Math.max(old.end ?? 0, group.end);
    } else groups.set(key, { ...group, records: [index] });
  }
  return [...groups.values()].sort((a, b) => a.channel.localeCompare(b.channel) || (a.start ?? 0) - (b.start ?? 0));
}
export type LogTimestamp = 'utc' | 'local' | 'epoch';
function timestamp(at: number, mode: LogTimestamp): string {
  const date = new Date(at);
  if (mode === 'utc') return date.toISOString();
  if (mode === 'epoch') return String(at);
  const offset = -date.getTimezoneOffset(),
    sign = offset < 0 ? '-' : '+';
  return (
    date.toLocaleString() +
    ' ' +
    Intl.DateTimeFormat().resolvedOptions().timeZone +
    ' UTC' +
    sign +
    String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0') +
    ':' +
    String(Math.abs(offset) % 60).padStart(2, '0')
  );
}
function text(message: ChatMessage): string {
  switch (message.command) {
    case 'CLEARCHAT':
      return message.text
        ? message.tags['ban-duration']
          ? 'Timeout ' + message.text + ' for ' + message.tags['ban-duration'] + ' seconds'
          : 'Ban/clear user ' + message.text
        : 'Channel chat cleared';
    case 'CLEARMSG':
      return 'Deleted message ' + (message.tags['target-msg-id'] || '(target unavailable)');
    case 'USERNOTICE':
    case 'NOTICE':
      return (
        [message.tags['system-msg'], message.text].filter(Boolean).join(' · ') ||
        message.tags['msg-id'] ||
        message.command
      );
    default:
      return message.login + ': ' + message.text;
  }
}
export function logOutput(
  messages: readonly ChatMessage[],
  coverage: LogCoverage,
  format: 'json' | 'text',
  mode: LogTimestamp,
): string {
  if (messages.length > LOG_ROWS) throw new Error('Export at most 1,000 rows per part');
  if (format === 'json')
    return JSON.stringify(
      { format: 'chatty-cat-history', version: 1, messages, coverage, timestampMode: mode },
      null,
      2,
    );
  const lines = [
    'Chatty Cat retained public log · part ' + coverage.part,
    coverage.notice,
    'Retained rows: ' +
      coverage.retained.rows +
      ' · ' +
      coverage.truncated +
      ' clipped records · ' +
      (coverage.more ? 'more parts available' : 'end of selected records'),
  ];
  for (const group of coverage.groups) {
    lines.push(
      '\n#' +
        group.channel +
        ' · ' +
        group.kind +
        ' · ' +
        group.session +
        (group.start === null ? '' : ' · ' + timestamp(group.start, mode) + ' → ' + timestamp(group.end!, mode)),
    );
    for (const index of group.records) {
      const m = messages[index]!;
      lines.push('[' + timestamp(m.timestamp, mode) + '] [' + m.command + '] ' + text(m).replace(/[\r\n]/g, ' '));
    }
  }
  return lines.join('\n') + '\n';
}
