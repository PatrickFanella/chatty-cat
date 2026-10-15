import { expect, it } from 'vitest';
import { moderationCommand, validModerationCommand, parseModerationContext } from './moderation';
it('normalizes reviewed reasons and rejects unsupported or injected commands', () => {
  const command = moderationCommand('timeout', 'alice', '', 600, ' two  spaces ');
  expect(command).toBe('/timeout alice 600 two spaces');
  expect(validModerationCommand(command)).toBe(true);
  for (const value of [
    '/w alice secret',
    '/clear extra',
    '/unban alice extra',
    '/slow 121',
    '/delete bad/id',
    '/timeout alice 600 reason\n/ban bob',
  ])
    expect(validModerationCommand(value)).toBe(false);
});
it('keeps only typed public room state and verifies identities', () => {
  const raw = {
    account: '42',
    channel: 'one',
    broadcasterID: '123',
    target: 'alice',
    targetID: '456',
    role: 'unknown',
    roleDetail: 'Read unavailable',
    at: Date.now(),
    targetState: 'Unavailable',
    settings: { slow_mode: true, subscriber_mode: 1, slow_mode_wait_time: 30, private_token: 'secret' },
    access_token: 'secret',
  };
  const value = parseModerationContext(raw);
  expect(value.settings).toEqual({ slow_mode: true, slow_mode_wait_time: 30 });
  expect(JSON.stringify(value)).not.toContain('secret');
  expect(() => parseModerationContext({ ...raw, targetID: 'invalid' })).toThrow();
  expect(() => parseModerationContext({ ...raw, role: ['moderator'] })).toThrow();
});
it('requires warning reasons and validates direct IDs/aliases without accepting extra arguments', () => {
  for (const command of ['/warn alice reason', '/shield', '/shieldoff', '/banid 456 reason', '/untimeout alice'])
    expect(validModerationCommand(command)).toBe(true);
  for (const command of [
    '/warn alice',
    '/banid 0',
    '/banid 00042',
    '/banid invalid',
    '/shield extra',
    '/untimeout alice extra',
  ])
    expect(validModerationCommand(command)).toBe(false);
});

it('stages suspicious treatment actions with one subject and no extra arguments', () => {
  for (const command of ['/monitor alice', '/unmonitor alice', '/restrict alice', '/unrestrict alice'])
    expect(validModerationCommand(command)).toBe(true);
  for (const command of ['/monitor', '/restrict alice extra']) expect(validModerationCommand(command)).toBe(false);
});
