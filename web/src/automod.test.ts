import { expect, it } from 'vitest';
import { parseAutoModSnapshot, autoModJournalCommand } from './automod';
const raw = {
  format: 'chatty-cat-private-automod',
  account: '42',
  channel: 'one',
  broadcasterID: '123',
  epoch: 'epoch-123456789012345',
  active: true,
  state: 'live',
  detail: 'Live private fixture',
  rows: [
    {
      id: 'held-one',
      eventID: 'event-one',
      userID: '456',
      login: 'alice',
      text: '<script>private plaintext</script>',
      reason: 'AutoMod: aggression',
      at: Date.now(),
      status: 'held',
      access_token: 'never-export',
    },
  ],
  access_token: 'never-export',
};
it('isolates private snapshots and drops provider extras without changing plain text', () => {
  const value = parseAutoModSnapshot(raw, '42', 'one');
  expect(value.rows[0]?.text).toBe('<script>private plaintext</script>');
  expect(JSON.stringify(value)).not.toContain('never-export');
  expect(() => parseAutoModSnapshot(raw, '43', 'one')).toThrow();
  expect(() => parseAutoModSnapshot(raw, '42', 'two')).toThrow();
  expect(() => parseAutoModSnapshot({ ...raw, active: false }, '42', 'one')).toThrow();
  expect(() => parseAutoModSnapshot({ ...raw, rows: [...raw.rows, ...raw.rows] }, '42', 'one')).toThrow();
});
it('constructs only bounded allow/deny journal commands', () => {
  expect(autoModJournalCommand('ALLOW', 'held-one')).toBe('/automodallow held-one');
  expect(() => autoModJournalCommand('DENY', 'bad/id')).toThrow();
});
