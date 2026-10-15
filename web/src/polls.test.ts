import { expect, it } from 'vitest';
import { pollDefinition, parsePoll, parsePollSnapshot } from './polls';
const poll = {
  id: 'poll-one',
  broadcaster_id: '42',
  title: 'Question?',
  status: 'ACTIVE',
  duration: 30,
  channel_points_voting_enabled: false,
  channel_points_per_vote: 0,
  started_at: '2026-10-12T12:00:00Z',
  ended_at: null,
  choices: [
    { id: 'choice-one', title: 'One', votes: 2, channel_points_votes: 0 },
    { id: 'choice-two', title: 'Two', votes: 1, channel_points_votes: 0 },
  ],
  access_token: 'never-export',
};
it('bounds poll definitions and disallows misleading point options', () => {
  const value = { title: 'Question?', choices: ['One', 'Two'], duration: 30, pointsEnabled: false, points: 0 };
  expect(pollDefinition(value)).toEqual(value);
  for (const bad of [
    { ...value, title: 'x'.repeat(61) },
    { ...value, choices: ['One', 'one'] },
    { ...value, duration: 14 },
    { ...value, pointsEnabled: true, points: 0 },
    { ...value, points: 100 },
  ])
    expect(() => pollDefinition(bad)).toThrow();
});
it('validates broadcaster identity and explicit counts without keeping provider extras', () => {
  expect(JSON.stringify(parsePoll(poll, '42'))).not.toContain('never-export');
  expect(() => parsePoll(poll, '43')).toThrow();
  expect(() => parsePoll({ ...poll, choices: [{ ...poll.choices[0], votes: -1 }, poll.choices[1]] }, '42')).toThrow();
  expect(() =>
    parsePollSnapshot(
      { account: '42', channel: 'one', broadcasterID: '42', at: Date.now(), polls: [poll, poll] },
      '42',
      'one',
    ),
  ).toThrow();
});
