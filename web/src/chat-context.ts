import type { ChatMessage } from './protocol';
export interface ChatContextRow {
  id: string;
  eventID: string;
  userID: string;
  command: 'PRIVMSG' | 'USERNOTICE';
  at: number;
  tags: Record<string, string>;
}
export interface ChatContextSnapshot {
  format: 'chatty-cat-public-context';
  account: string;
  channel: string;
  broadcasterID: string;
  epoch: string;
  state: 'connecting' | 'live' | 'unavailable';
  active: boolean;
  detail: string;
  rows: ChatContextRow[];
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const numeric = /^[0-9]{1,30}$/;
const token = /^[A-Za-z0-9_-]{1,100}$/;
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
const typeNames = [
  'channel_points_highlighted',
  'channel_points_sub_only',
  'user_intro',
  'power_ups_message_effect',
  'power_ups_gigantified_emote',
];
const validators: Record<string, (v: string) => boolean> = {
  'source-room-id': (v) => numeric.test(v),
  'source-id': (v) => uuid.test(v),
  'source-login': (v) => /^[a-z0-9_]{1,25}$/.test(v),
  'source-only': (v) => v === '0' || v === '1',
  'source-badges': (v) =>
    v.length <= 1024 &&
    (!v ||
      (v.split(',').length <= 32 &&
        v.split(',').every((b) => {
          const p = b.split('/');
          return p.length === 2 && p.every((s) => token.test(s));
        }))),
  'custom-reward-id': (v) => token.test(v),
  'eventsub-message-type': (v) => typeNames.includes(v),
  'eventsub-streak-count': (v) => /^[0-9]{1,7}$/.test(v) && Number(v) > 0 && Number(v) <= 1000000,
  'eventsub-streak-points': (v) => /^[0-9]{1,10}$/.test(v) && Number(v) <= 1000000000,
};
export function parseChatContext(value: unknown, account: string, channel: string): ChatContextSnapshot {
  if (
    !record(value) ||
    Object.keys(value).some(
      (k) =>
        !['format', 'account', 'channel', 'broadcasterID', 'epoch', 'state', 'active', 'detail', 'rows'].includes(k),
    ) ||
    value.format !== 'chatty-cat-public-context' ||
    value.account !== account ||
    value.channel !== channel ||
    typeof value.broadcasterID !== 'string' ||
    !numeric.test(value.broadcasterID) ||
    typeof value.epoch !== 'string' ||
    !/^[A-Za-z0-9_-]{16,64}$/.test(value.epoch) ||
    (value.state !== 'connecting' && value.state !== 'live' && value.state !== 'unavailable') ||
    typeof value.active !== 'boolean' ||
    value.active !== (value.state === 'live') ||
    typeof value.detail !== 'string' ||
    value.detail.length > 300 ||
    !Array.isArray(value.rows) ||
    value.rows.length > 100 ||
    (!value.active && value.rows.length)
  )
    throw new Error('Public context account/state changed');
  const rows: ChatContextRow[] = value.rows.map((row) => {
    if (
      !record(row) ||
      Object.keys(row).some((k) => !['id', 'eventID', 'userID', 'command', 'at', 'tags'].includes(k)) ||
      typeof row.id !== 'string' ||
      !uuid.test(row.id) ||
      typeof row.eventID !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(row.eventID) ||
      typeof row.userID !== 'string' ||
      !numeric.test(row.userID) ||
      (row.command !== 'PRIVMSG' && row.command !== 'USERNOTICE') ||
      typeof row.at !== 'number' ||
      !Number.isSafeInteger(row.at) ||
      row.at < 0 ||
      row.at > Date.now() + 300000 ||
      !record(row.tags) ||
      Object.keys(row.tags).length > 10 ||
      JSON.stringify(row).length > 2048
    )
      throw new Error('Invalid supplemental public context');
    const tags: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [key, v] of Object.entries(row.tags)) {
      if (typeof v !== 'string' || !Object.hasOwn(validators, key) || !validators[key]!(v))
        throw new Error('Unsupported context tag');
      tags[key] = v;
    }
    if (
      !Object.keys(tags).length ||
      (Object.keys(tags).some((k) => k.startsWith('source-')) && (!tags['source-room-id'] || !tags['source-id'])) ||
      (tags['eventsub-streak-points'] !== undefined && !tags['eventsub-streak-count']) ||
      (row.command === 'PRIVMSG' && tags['eventsub-streak-count']) ||
      (row.command === 'USERNOTICE' && (tags['eventsub-message-type'] || tags['custom-reward-id']))
    )
      throw new Error('Incomplete public context');
    return { id: row.id, eventID: row.eventID, userID: row.userID, command: row.command, at: row.at, tags };
  });
  if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error('Duplicate public context rows');
  return {
    format: 'chatty-cat-public-context',
    account,
    channel,
    broadcasterID: value.broadcasterID,
    epoch: value.epoch,
    state: value.state,
    active: value.active,
    detail: value.detail,
    rows,
  };
}
// This function cannot create a public message or replace any message body/identity.
export function applyChatContext(
  message: ChatMessage,
  row: ChatContextRow,
  broadcasterID: string,
  channel: string,
): ChatMessage {
  if (
    message.channel !== channel ||
    message.id !== row.id ||
    message.command !== row.command ||
    message.tags['room-id'] !== broadcasterID ||
    message.tags['user-id'] !== row.userID ||
    message.tags['local-echo'] === '1' ||
    message.tags['imported-history'] ||
    Math.abs(message.timestamp - row.at) > 300000 ||
    row.at < Date.now() - 15 * 60000
  )
    return message;
  for (const key of ['source-room-id', 'source-id', 'custom-reward-id'])
    if (message.tags[key] !== undefined && row.tags[key] !== undefined && message.tags[key] !== row.tags[key])
      return message;
  const added = Object.entries(row.tags).filter(([key]) => message.tags[key] === undefined);
  if (!added.length) return message;
  return { ...message, tags: { ...message.tags, ...Object.fromEntries(added) } };
}
