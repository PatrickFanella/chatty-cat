import { expect, it } from 'vitest';
import { PersonalState } from './personal';
import type { ChatMessage } from './protocol';
const message: ChatMessage = {
  id: '',
  channel: 'hasanabi',
  login: '',
  command: 'USERSTATE',
  text: '',
  timestamp: 1000,
  tags: {},
};
it('merges global and channel roles and honors moderator/VIP slow-mode exceptions', () => {
  const state = new PersonalState();
  state.reset('alice');
  state.observe({ ...message, command: 'GLOBALUSERSTATE', tags: { 'display-name': 'Alice' } });
  state.observe({ ...message, tags: { mod: '1', subscriber: '1' } });
  state.accepted('hasanabi', 1000);
  expect(state.labels('hasanabi', 1000)).toEqual(['Moderator', 'Subscriber']);
  expect(state.block('hasanabi', 30, 2000)).toBe('');
  state.observe({ ...message, tags: { mod: '0', badges: 'vip/1' } });
  expect(state.block('hasanabi', 30, 2000)).toBe('');
  state.observe({ ...message, tags: { badges: '' } });
  expect(state.block('hasanabi', 30, 2000)).toContain('29s');
  expect(state.block('other', 30, 2000)).toBe('');
});
it('tracks only own timeout/ban notices, expires countdowns and clears on success/logout', () => {
  const state = new PersonalState();
  state.reset('alice');
  state.observe({ ...message, command: 'CLEARCHAT', text: 'bob', tags: { 'ban-duration': '60' } });
  expect(state.block('hasanabi', 0, 2000)).toBe('');
  state.observe({ ...message, command: 'CLEARCHAT', text: 'Alice', tags: { 'ban-duration': '60' } });
  expect(state.block('hasanabi', 0, 2000)).toContain('59s');
  expect(state.labels('hasanabi', 2000)).toContain('Your timeout: 59s');
  expect(state.block('hasanabi', 0, 62000)).toBe('');
  state.observe({ ...message, command: 'CLEARCHAT', text: 'alice' });
  expect(state.labels('hasanabi', 62000).join()).toContain('ban was reported');
  state.accepted('hasanabi', 62000);
  expect(state.labels('hasanabi', 62000)).toEqual([]);
  state.reset();
  state.observe({ ...message, command: 'CLEARCHAT' });
  expect(state.labels('hasanabi')).toEqual([]);
});
