import type { ChatMessage } from './protocol';
const room = (value: string | undefined): value is string => !!value && /^[0-9]{1,32}$/.test(value);
const id = (value: string | undefined): value is string => !!value && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const uuid = (value: string | undefined): value is string =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export interface SharedContext {
  roomID: string;
  messageID?: string;
  kind: 'origin' | 'copy' | 'unknown';
  badges: readonly { set: string; version: string }[] | undefined;
  sourceOnly: boolean | undefined;
}
export function sharedContext(m: ChatMessage): SharedContext | undefined {
  if (!['PRIVMSG', 'USERNOTICE'].includes(m.command) || !room(m.tags['source-room-id'])) return;
  const raw = m.tags['source-badges'];
  let badges: SharedContext['badges'];
  if (raw !== undefined && raw.length <= 4096) {
    const entries = raw ? raw.split(',') : [];
    if (entries.length <= 32) {
      const parsed = entries.map((entry) => entry.split('/'));
      if (parsed.every((parts) => parts.length === 2 && parts.every((v) => /^[a-zA-Z0-9_-]{1,100}$/.test(v))))
        badges = parsed.map((parts) => ({ set: parts[0]!, version: parts[1]! }));
    }
  }
  const received = m.tags['room-id'],
    sourceOnly = m.tags['source-only'];
  return {
    roomID: m.tags['source-room-id'],
    ...(uuid(m.tags['source-id']) ? { messageID: m.tags['source-id'] } : {}),
    kind: !room(received) ? 'unknown' : received === m.tags['source-room-id'] ? 'origin' : 'copy',
    badges,
    sourceOnly: sourceOnly === '1' ? true : sourceOnly === '0' ? false : undefined,
  };
}
export function effectiveNotice(m: ChatMessage): string {
  const value = m.tags['msg-id'] === 'sharedchatnotice' ? m.tags['source-msg-id'] : m.tags['msg-id'];
  if (value && /^[a-z0-9_-]{1,100}$/.test(value)) return value;
  const type = m.tags['eventsub-message-type'];
  return type === 'channel_points_highlighted'
    ? 'highlighted-message'
    : type === 'channel_points_sub_only'
      ? 'skip-subs-mode-message'
      : type === 'power_ups_message_effect'
        ? 'animated-message'
        : type === 'power_ups_gigantified_emote'
          ? 'gigantified-emote-message'
          : '';
}
export function messageReward(m: ChatMessage): string | undefined {
  if (m.command !== 'PRIVMSG' && m.command !== 'USERNOTICE') return;
  const custom = m.tags['custom-reward-id'];
  if (id(custom)) return custom;
  const kind = effectiveNotice(m);
  if (['highlighted-message', 'skip-subs-mode-message'].includes(kind)) return kind;
}
export function messageEffect(m: ChatMessage): string | undefined {
  if (m.command !== 'PRIVMSG' && m.command !== 'USERNOTICE') return;
  const kind = effectiveNotice(m);
  if (['animated-message', 'gigantified-emote-message'].includes(kind)) return kind;
}
export function watchStreak(m: ChatMessage): { count: number; points?: number } | undefined {
  if (m.command === 'USERNOTICE' && /^[0-9]{1,7}$/.test(m.tags['eventsub-streak-count'] ?? '')) {
    const count = Number(m.tags['eventsub-streak-count']),
      raw = m.tags['eventsub-streak-points'];
    if (count > 0 && count <= 1000000)
      return {
        count,
        ...(raw !== undefined && /^[0-9]{1,10}$/.test(raw) && Number(raw) <= 1000000000 ? { points: Number(raw) } : {}),
      };
  }
  if (
    m.command !== 'USERNOTICE' ||
    effectiveNotice(m) !== 'viewermilestone' ||
    m.tags['msg-param-category'] !== 'watch-streak'
  )
    return;
  const value = m.tags['msg-param-value'];
  if (!value || !/^\d{1,7}$/.test(value) || Number(value) < 1 || Number(value) > 1000000) return;
  const raw = m.tags['msg-param-copoReward'];
  return {
    count: Number(value),
    ...(raw && /^\d{1,10}$/.test(raw) && Number(raw) <= 1000000000 ? { points: Number(raw) } : {}),
  };
}
export function messageContextLabels(m: ChatMessage, originName?: string): string[] {
  const labels: string[] = [],
    shared = sharedContext(m),
    reward = messageReward(m),
    streak = watchStreak(m),
    effect = messageEffect(m);
  if (shared) {
    const name = originName ?? m.tags['source-login'];
    const origin = name && /^[a-z0-9_]{1,25}$/.test(name) ? '#' + name : 'room ' + shared.roomID;
    labels.push('Shared origin ' + origin + ' · received in #' + m.channel);
    if (shared.sourceOnly === true) labels.push('Source-only message');
  }
  if (reward) labels.push('Channel-points reward: ' + reward + ' (title/cost not supplied)');
  if (streak)
    labels.push(
      'Watch streak: ' +
        streak.count +
        ' streams' +
        (streak.points === undefined ? '' : ' · ' + streak.points + ' points reported'),
    );
  if (m.tags['eventsub-message-type'] === 'user_intro') labels.push('Message type: user_intro');
  if (effect) labels.push('Effect: ' + effect + ' (text fallback)');
  return labels;
}
// One logical source message for alerts/counters; receiving-room keys remain separate.
export function publicMessageKey(m: ChatMessage): string {
  const shared = sharedContext(m);
  return shared?.messageID ? 'source:' + shared.roomID + ':' + shared.messageID : m.channel + ':' + m.id;
}
export function receivedMessageID(m: ChatMessage): string {
  return sharedContext(m)?.messageID ?? m.id;
}
export function replyContext(m: ChatMessage): string {
  return sharedContext(m)
    ? 'Reply in #' + m.channel + ' to this received copy; Twitch may relay replies within Shared Chat. '
    : '';
}
