import { expect, it } from 'vitest';
import { WorkerEvents } from './worker-events';
it('keeps barriers between bounded batches and accepts a new barrier after drain completion', async () => {
  const order: string[] = [];
  const events = new WorkerEvents<number>(
    Promise.resolve(),
    async (batch) => {
      order.push(batch.join(','));
    },
    () => {},
  );
  events.push(1);
  const first = events.barrier(async () => {
    order.push('save1');
    return 1;
  });
  events.push(2);
  const second = events.barrier(async () => {
    order.push('save2');
    return 2;
  });
  events.push(3);
  expect(await first).toBe(1);
  expect(await second).toBe(2);
  await events.flush();
  expect(order).toEqual(['1', 'save1', '2', 'save2', '3']);
  expect(await events.barrier(async () => 4)).toBe(4);
  await events.close();
});
it('fails closed at observation capacity and rejects pending query barriers', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let failed = 0;
  const events = new WorkerEvents<number>(
    gate,
    async () => {},
    () => {
      failed++;
    },
  );
  events.push(1);
  const query = events.barrier(async () => 1);
  events.push(2, 100001);
  release();
  await expect(query).rejects.toThrow('capacity');
  expect(failed).toBeGreaterThan(0);
  await expect(events.barrier(async () => 2)).rejects.toThrow('capacity');
});
it('does not poison observations after a definite query/write refusal', async () => {
  const values: number[] = [];
  const events = new WorkerEvents<number>(
    Promise.resolve(),
    async (batch) => {
      values.push(...batch);
    },
    () => {
      throw new Error('Unexpected transport failure');
    },
  );
  await expect(
    events.barrier(async () => {
      throw new Error('quota');
    }),
  ).rejects.toThrow('quota');
  events.push(7);
  await events.flush();
  expect(values).toEqual([7]);
});
