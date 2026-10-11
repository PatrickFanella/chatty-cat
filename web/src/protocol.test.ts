import { describe, expect, it } from 'vitest';
import { parseChannels, parseEvent } from './protocol';

describe('channel validation', () => {
  it('normalizes and deduplicates', () => expect(parseChannels('HasanAbi, room,hasanabi')).toEqual(['hasanabi', 'room']));
  it.each(['', 'a,,b', 'a\r\nJOIN #b', 'a,b,c,d,e,f,g', 'x'.repeat(26)])('rejects %j', (raw) => expect(() => parseChannels(raw)).toThrow());
});

describe('wire boundary', () => {
  const message = { id: 'one', command: 'PRIVMSG', channel: 'room', login: 'alice', text: 'hello', timestamp: 123, tags: { 'reply-parent-msg-id': 'parent' } };
  it('preserves chat fields and replay state', () => expect(parseEvent(JSON.stringify({ type: 'message', message, replay: true }))).toEqual({ type: 'message', message, replay: true }));
  it('accepts connection states', () => expect(parseEvent('{"type":"status","state":"connected"}')).toEqual({ type: 'status', state: 'connected', detail: '' }));
  it.each(['null', '[]', 'oops', '{}', '{"type":"status","state":"surprise"}'])('rejects malformed event %s', (raw) => expect(parseEvent(raw)).toBeNull());
  it('rejects non-string tags', () => expect(parseEvent(JSON.stringify({ type: 'message', message: { ...message, tags: { id: 123 } } }))).toBeNull());
  it('rejects missing fields', () => expect(parseEvent(JSON.stringify({ type: 'message', message: { text: 'hello' } }))).toBeNull());
  it.each([-1, 1.5, 1e20])('rejects an invalid timestamp %s', (timestamp) => expect(parseEvent(JSON.stringify({ type: 'message', message: { ...message, timestamp } }))).toBeNull());
});
