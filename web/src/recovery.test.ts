import { expect, it, vi } from 'vitest';
import { ChatRecovery } from './recovery';
it('marks actual connection gaps once without claiming complete replay', () => {
  const add = vi.fn();
  const recovery = new ChatRecovery('one', add);
  const status = (state: 'connected' | 'reconnecting', now: number) =>
    recovery.status({ type: 'status', state, detail: '' }, now);
  status('reconnecting', 1);
  expect(add).not.toHaveBeenCalled();
  status('connected', 1000);
  status('reconnecting', 2000);
  status('reconnecting', 3000);
  status('connected', 12000);
  expect(add).toHaveBeenCalledTimes(2);
  expect(add.mock.calls[1]?.[0]).toMatchObject({ command: 'NOTICE', text: expect.stringContaining('after 10s') });
  expect(add.mock.calls[1]?.[0].text).toContain('may not cover');
});
it('closes a restored interruption when the reloaded page reconnects', () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(4000),
    add = vi.fn();
  try {
    const recovery = new ChatRecovery('one', add, [
      {
        id: 'gap-before-reload',
        command: 'NOTICE',
        channel: 'one',
        login: '',
        text: 'Interrupted',
        timestamp: 2000,
        tags: { 'client-notice': '1', 'gap-state': 'start', 'gap-start': '2000' },
      },
    ]);
    recovery.status({ type: 'status', state: 'connected', detail: '' }, 5000);
    expect(add).toHaveBeenCalledOnce();
    expect(add.mock.calls[0]?.[0].tags).toMatchObject({ 'gap-state': 'end', 'gap-start': '2000' });
    recovery.status({ type: 'status', state: 'connected', detail: '' }, 6000);
    expect(add).toHaveBeenCalledOnce();
  } finally {
    clock.mockRestore();
  }
});
