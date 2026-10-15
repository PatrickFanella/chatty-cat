export interface ChatMessage {
  id: string;
  command: string;
  channel: string;
  login: string;
  text: string;
  timestamp: number;
  tags: Record<string, string>;
}

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting';
export type ServerEvent =
  | { type: 'status'; state: ConnectionState; detail: string }
  | { type: 'message'; message: ChatMessage; replay: boolean };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Browser boundaries validate runtime data; TypeScript alone cannot validate JSON.
export function parseEvent(raw: string): ServerEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!object(value)) return null;
  if (value.type === 'status') {
    if (!['connecting', 'connected', 'reconnecting'].includes(String(value.state))) return null;
    return {
      type: 'status',
      state: value.state as ConnectionState,
      detail: typeof value.detail === 'string' ? value.detail : '',
    };
  }
  const m = value.message;
  if (value.type !== 'message' || !object(m) || !object(m.tags)) return null;
  if (!['id', 'command', 'channel', 'login', 'text'].every((key) => typeof m[key] === 'string')) return null;
  if (
    typeof m.timestamp !== 'number' ||
    !Number.isSafeInteger(m.timestamp) ||
    m.timestamp < 0 ||
    m.timestamp > 8640000000000000
  )
    return null;
  if (!Object.values(m.tags).every((tag) => typeof tag === 'string')) return null;
  // All fields of this assertion were checked above.
  return { type: 'message', message: m as unknown as ChatMessage, replay: value.replay === true };
}

export function parseChannels(raw: string): string[] {
  return parseWorkspaceChannels(raw, 6);
}
export function parseWorkspaceChannels(raw: string, limit = 24): string[] {
  const parts = raw
    .toLowerCase()
    .split(',')
    .map((part) => part.trim());
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 24 ||
    parts.length > limit ||
    parts.some((part) => !/^[a-z0-9_]{1,25}$/.test(part))
  ) {
    throw new Error('Enter one to ' + limit + ' Twitch channel names, separated by commas.');
  }
  return [...new Set(parts)];
}
