import { profileKey } from './account-profiles';
import { isLocalCommand } from './local-commands';
import { validateMessage } from './composer';
export interface CommandTemplate {
  trigger: string;
  name: string;
  group: string;
  body: string;
}
export interface CommandContext {
  channel: { name: string; id: string; title: string; game: string };
  account: { name: string; id: string };
  message: { name: string; id: string; text: string } | undefined;
  input: string;
}
type Token = { kind: 'text'; text: string } | { kind: 'value'; name: string };
const VARIABLES = [
  'channel.name',
  'channel.id',
  'channel',
  'stream.title',
  'stream.game',
  'my.name',
  'my.id',
  'user.name',
  'user',
  'msg.id',
  'msg-id',
  'msg.text',
  'message',
  'input.text',
];
export function compileTemplate(body: string): Token[] {
  if (!body || body.length > 2000 || /[\x00-\x1f\x7f-\x9f]/.test(body))
    throw new Error('Use a template of 1–2,000 characters without control characters');
  const tokens: Token[] = [];
  let text = '';
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '{') {
      text += body[i];
      continue;
    }
    if (body[i + 1] === '{') {
      text += '{';
      i++;
      continue;
    }
    if (text) {
      tokens.push({ kind: 'text', text });
      text = '';
    }
    const end = body.indexOf('}', i + 1);
    if (end < 0) throw new Error('Unfinished placeholder');
    const name = body.slice(i + 1, end);
    if (!VARIABLES.includes(name) && !/^([1-9][0-9]?)(\+)?$/.test(name))
      throw new Error('Unsupported placeholder: ' + name);
    tokens.push({ kind: 'value', name });
    i = end;
  }
  if (text) tokens.push({ kind: 'text', text });
  return tokens;
}
export function expandTemplate(
  tokens: readonly Token[],
  args: readonly string[],
  context: CommandContext,
  triggers: readonly string[] = [],
): string {
  const values: Record<string, string> = {
    'channel.name': context.channel.name,
    'channel.id': context.channel.id,
    channel: context.channel.name,
    'stream.title': context.channel.title,
    'stream.game': context.channel.game,
    'my.name': context.account.name,
    'my.id': context.account.id,
    'input.text': context.input,
  };
  if (context.message)
    Object.assign(values, {
      'user.name': context.message.name,
      user: context.message.name,
      'msg.id': context.message.id,
      'msg-id': context.message.id,
      'msg.text': context.message.text,
      message: context.message.text,
    });
  let count = 0;
  const result = tokens
    .map((token) => {
      const resolved = (() => {
        if (token.kind === 'text') return token.text;
        if (/^[1-9][0-9]?\+?$/.test(token.name)) {
          const start = parseInt(token.name) - 1;
          return token.name.endsWith('+') ? args.slice(start).join(' ') : (args[start] ?? '');
        }
        const value = values[token.name];
        if (value === undefined) throw new Error('Select a public message to use message placeholders');
        if (!value) throw new Error('Unavailable context: ' + token.name);
        return value;
      })();
      count += [...resolved].length;
      if (count > 500) throw new Error('Expanded command exceeds 500 characters');
      return resolved;
    })
    .join('');
  if (triggers.some((trigger) => trigger.toLowerCase() === (result.trim().split(/\s/)[0] ?? '').toLowerCase()))
    throw new Error('Nested or recursive custom commands are not supported');
  const error = validateMessage(result);
  if (error)
    throw new Error(error.includes('500') ? 'Expanded command exceeds 500 characters or contains invalid text' : error);
  return result;
}
export function parseCommandList(value: unknown): CommandTemplate[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error('Save at most 50 commands');
  const result: CommandTemplate[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') throw new Error('Invalid command');
    const data: Record<string, unknown> = item;
    if (typeof data.trigger !== 'string' || !/^\/?[a-zA-Z][a-zA-Z0-9_-]{0,30}$/.test(data.trigger))
      throw new Error('Use a one-word trigger, optionally starting with /');
    if (isLocalCommand(data.trigger) || (data.trigger.startsWith('/') && !validateMessage(data.trigger)))
      throw new Error('Cannot replace a built-in command');
    if (
      typeof data.name !== 'string' ||
      !data.name.trim() ||
      data.name.length > 60 ||
      typeof data.group !== 'string' ||
      data.group.length > 60 ||
      typeof data.body !== 'string'
    )
      throw new Error('Invalid command name, group or body');
    compileTemplate(data.body);
    result.push({ trigger: data.trigger, name: data.name.trim(), group: data.group.trim(), body: data.body });
  }
  if (new Set(result.map((item) => item.trigger.toLowerCase())).size !== result.length)
    throw new Error('Duplicate command triggers');
  if (JSON.stringify(result).length > 65536) throw new Error('Command definitions exceed 64 KB');
  return result;
}
export class CommandStore {
  private items: CommandTemplate[] = [];
  private raw: string | null = null;
  error = '';
  constructor() {
    try {
      this.raw = localStorage.getItem(profileKey('chatthing:v1:commands'));
      if (this.raw) {
        if (this.raw.length > 65536) throw new Error();
        this.items = parseCommandList(JSON.parse(this.raw));
      }
    } catch {
      this.error = 'Saved commands could not be read; existing data was retained';
    }
  }
  all(): CommandTemplate[] {
    return this.items
      .map((item) => ({ ...item }))
      .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  }
  save(items: CommandTemplate[]): void {
    if (this.error) throw new Error(this.error);
    const safe = parseCommandList(items);
    if (localStorage.getItem(profileKey('chatthing:v1:commands')) !== this.raw)
      throw new Error('Commands changed in another tab; reload before saving');
    const raw = JSON.stringify(safe);
    try {
      localStorage.setItem(profileKey('chatthing:v1:commands'), raw);
    } catch {
      throw new Error('Could not save commands; free browser storage and retry');
    }
    this.items = safe;
    this.raw = raw;
  }
  match(text: string): CommandTemplate | undefined {
    return this.items.find((item) => item.trigger.toLowerCase() === (text.trim().split(/\s/)[0] ?? '').toLowerCase());
  }
}
