import { parseEvent, type ChatMessage } from './protocol';
import { parseArchiveQuery } from './archive-query';
export interface Archived {
  key: string;
  channel: string;
  timestamp: number;
  message: ChatMessage;
}
export interface ArchiveQuery {
  text: string;
  channel?: string;
  channels?: readonly string[];
  login?: string;
  before?: number;
  after?: number;
  limit?: number;
  order?: 'oldest' | 'newest';
  expression?: string;
  commands?: readonly string[];
  moderationTarget?: { id: string; login?: string };
}
export interface ArchiveCursor {
  timestamp: number;
  key: string;
}
export interface ArchiveBounds {
  rows: number;
  oldest: number | undefined;
  newest: number | undefined;
}
export interface ArchivePage {
  messages: ChatMessage[];
  next: ArchiveCursor | undefined;
  scanned: number;
  bounds: ArchiveBounds;
}
export const MAX_ROWS = 100000;
export const PUBLIC_ARCHIVE_COMMANDS = ['PRIVMSG', 'USERNOTICE', 'NOTICE', 'CLEARCHAT', 'CLEARMSG'];
export function archiveKey(message: ChatMessage): string {
  return (
    message.channel +
    ':' +
    (message.id ||
      [message.command, message.timestamp, message.login, message.text, message.tags['system-msg'] ?? ''].join(':'))
  );
}
export function validMessage(value: unknown): ChatMessage | undefined {
  const event = parseEvent(JSON.stringify({ type: 'message', message: value, replay: true }));
  return event?.type === 'message' && PUBLIC_ARCHIVE_COMMANDS.includes(event.message.command)
    ? event.message
    : undefined;
}
export function compileArchiveFilter(query: ArchiveQuery): (message: ChatMessage) => boolean {
  const expression = query.expression === undefined ? undefined : parseArchiveQuery(query.expression).matches;
  return (message) => matchesArchive(message, query) && (!expression || expression(message));
}
export function matchesArchive(message: ChatMessage, query: ArchiveQuery): boolean {
  return (
    (!query.channel || message.channel === query.channel) &&
    (!query.channels || query.channels.includes(message.channel)) &&
    (!query.login || message.login.toLowerCase() === query.login.toLowerCase()) &&
    (query.before === undefined || message.timestamp <= query.before) &&
    (query.after === undefined || message.timestamp >= query.after) &&
    (!query.text.trim() ||
      (message.text + ' ' + (message.tags['system-msg'] ?? ''))
        .toLowerCase()
        .includes(query.text.trim().toLowerCase())) &&
    (!query.commands || query.commands.includes(message.command)) &&
    (!query.moderationTarget ||
      (message.command === 'PRIVMSG' &&
        ((message.tags['user-id'] === query.moderationTarget.id && !message.tags['imported-history']) ||
          (query.moderationTarget.login !== undefined &&
            message.login.toLowerCase() === query.moderationTarget.login &&
            (!message.tags['user-id'] || !!message.tags['imported-history'])))))
  );
}

export interface ArchiveScanPage {
  messages: ChatMessage[];
  next: ArchiveCursor | undefined;
  until: ArchiveCursor | undefined;
}
