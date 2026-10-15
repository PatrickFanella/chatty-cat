import { expect, it } from 'vitest';
import { RoomStates } from './room';
import type { ChatMessage } from './protocol';
const base: ChatMessage = { id: '', channel: 'one', command: 'ROOMSTATE', text: '', login: '', timestamp: 1, tags: {} };
it('merges partial room changes and isolates channels', () => {
  const rooms = new RoomStates();
  rooms.observe({ ...base, tags: { slow: '10', 'subs-only': '1', 'followers-only': '0' } });
  rooms.observe({ ...base, tags: { slow: '0', 'emote-only': '1' } });
  expect(rooms.labels('one')).toEqual(['Followers only', 'Subscribers only', 'Emotes only']);
  expect(rooms.labels('two')).toEqual([]);
  rooms.observe({ ...base, tags: { 'followers-only': '-1', 'subs-only': '0' } });
  expect(rooms.labels('one')).toEqual(['Emotes only']);
});
it('ignores other commands and malformed numeric tags', () => {
  const rooms = new RoomStates();
  expect(rooms.observe({ ...base, command: 'NOTICE', tags: { slow: '10' } })).toBe(false);
  rooms.observe({ ...base, tags: { slow: 'garbage', 'followers-only': 'NaN' } });
  expect(rooms.labels('one')).toEqual([]);
});
