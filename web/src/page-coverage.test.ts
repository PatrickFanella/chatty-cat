// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { PageCoverage } from './page-coverage';
import { gapBuckets, readChatGaps } from './chat-gaps';
import { rateGraph } from './stats';
import type { ChatMessage } from './protocol';
let coverage: PageCoverage | undefined;
afterEach(() => { coverage?.stop(); coverage = undefined; localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('records a reload interval independently of the age of the last chat message', () => {
  vi.useFakeTimers(); vi.setSystemTime(60000);
  localStorage.setItem('chatthing:v1:observed:one', '10000');
  const messages: ChatMessage[] = [];
  coverage = new PageCoverage(['one'], message => messages.push(message));
  expect(messages).toHaveLength(1);
  expect(readChatGaps(messages, 60000)).toEqual([{ channel: 'one', start: 10000, end: 60000, kind: 'page' }]);
  const gaps = gapBuckets(messages, 60000, 60000), pageGaps = gapBuckets(messages, 60000, 60000, 60, 'page');
  const graph = rateGraph(Array<number>(60).fill(0), 'Activity', gaps, 'messages', pageGaps);
  expect(graph.querySelectorAll('.graph-page-gap')).toHaveLength(50);
  expect(graph.querySelector('.graph-page-gap title')?.textContent).toContain('Page closed or inactive');
  expect(localStorage.getItem('chatthing:v1:observed:one')).toBe('60000');
});
it('starts new channels without inventing old gaps and tolerates bad or future timestamps', () => {
  vi.useFakeTimers(); vi.setSystemTime(60000);
  for (const raw of ['Infinity', 'NaN', '60001', '-1', '0', '']) {
    localStorage.setItem('chatthing:v1:observed:one', raw);
    const add = vi.fn(); coverage = new PageCoverage(['one', 'new'], add);
    expect(add).not.toHaveBeenCalled(); coverage.stop();
  }
});
it('heartbeats through quiet chat and saves pagehide time, then stops its timer', () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const add = vi.fn(); coverage = new PageCoverage(['one', 'two'], add);
  vi.advanceTimersByTime(20000);
  expect(localStorage.getItem('chatthing:v1:observed:two')).toBe('21000');
  vi.setSystemTime(25000); coverage.stop(); expect(localStorage.getItem('chatthing:v1:observed:one')).toBe('25000');
  vi.advanceTimersByTime(20000); expect(localStorage.getItem('chatthing:v1:observed:one')).toBe('25000');
  expect(add).not.toHaveBeenCalled();
});
it('does not emit a closure while another tab has a recent observation timestamp', () => {
  vi.useFakeTimers(); vi.setSystemTime(60000);
  localStorage.setItem('chatthing:v1:observed:one', '40000');
  const add = vi.fn(); coverage = new PageCoverage(['one'], add);
  expect(add).not.toHaveBeenCalled();
});
it('continues when browser storage is unavailable', () => {
  vi.useFakeTimers();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Disabled'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Disabled'); });
  const add = vi.fn(); coverage = new PageCoverage(['one'], add);
  vi.advanceTimersByTime(20000); expect(add).not.toHaveBeenCalled();
});
it('stops heartbeats for closed sources and records their unobserved interval on reopening',()=>{
 vi.useFakeTimers();vi.setSystemTime(1000);const add=vi.fn();coverage=new PageCoverage(['one','two'],add);vi.advanceTimersByTime(10000);coverage.setChannels(['one']);const closed=localStorage.getItem('chatthing:v1:observed:two');vi.advanceTimersByTime(40000);expect(localStorage.getItem('chatthing:v1:observed:two')).toBe(closed);coverage.setChannels(['one','two']);expect(add).toHaveBeenCalledOnce();expect(add.mock.calls[0]?.[0]).toMatchObject({channel:'two',tags:{'gap-start':closed}});
});
