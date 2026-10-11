export interface Candidate { value: string; kind: 'nickname' | 'emote' }
export interface Completion { start: number; end: number; items: Candidate[] }

// Caret offsets are UTF-16, matching textarea selectionStart/selectionEnd.
export function completions(text: string, start: number, end: number, names: readonly string[], emotes: readonly string[], bare = false): Completion | undefined {
  if (start !== end || start < 0 || start > text.length) return undefined;
  const word = text.slice(0, start).match(/\S*$/)?.[0] ?? '';
  if (!word) return undefined;
  const nickname = word.startsWith('@');
  const colon = word.startsWith(':');
  if (!nickname && !colon && (!bare || word.length < 3)) return undefined;
  const prefix = (nickname || colon ? word.slice(1) : word).toLowerCase();
  if (!prefix) return undefined;
  const values = nickname ? names : emotes;
  const items = [...new Set(values)].filter((value) => value.toLowerCase().startsWith(prefix))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).slice(0, 30)
    .map((value): Candidate => ({ value: nickname ? '@' + value : value, kind: nickname ? 'nickname' : 'emote' }));
  return items.length ? { start: start - word.length, end: start, items } : undefined;
}

export function insertCompletion(text: string, completion: Completion, index: number): { text: string; caret: number } {
  const value = completion.items[index]?.value;
  if (!value) return { text, caret: completion.end };
  const suffix = text.slice(completion.end);
  const insert = value + (suffix.startsWith(' ') ? '' : ' ');
  return { text: text.slice(0, completion.start) + insert + suffix, caret: completion.start + insert.length };
}

// Twitch sends a single chat line. Preserve the draft's layout until submission.
export function wireMessage(text: string): string { return text.replace(/[\r\n]+/g, ' ').trim(); }
