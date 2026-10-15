// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { VirtualLog, type LogItem } from './virtual-log';
function setup() {
  const log = document.createElement('main');
  document.body.append(log);
  Object.defineProperty(log, 'clientHeight', { value: 640 });
  Object.defineProperty(log, 'scrollHeight', {
    get: () =>
      [...log.children].reduce(
        (sum, node) =>
          sum + (node.classList.contains('log-spacer') ? parseFloat((node as HTMLElement).style.height) : 32),
        0,
      ),
  });
  return { log, view: new VirtualLog(log) };
}
function items(count: number, start = 0): LogItem[] {
  return Array.from({ length: count }, (_, i) => ({
    key: String(start + i),
    render: () => {
      const row = document.createElement('article');
      row.className = 'row';
      row.textContent = String(start + i);
      return row;
    },
  }));
}
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
it('unloads retained inline media when its row leaves the viewport or its pane closes', () => {
  const { log, view } = setup();
  const row = document.createElement('article');
  row.className = 'row';
  row.append(document.createElement('iframe'));
  const card = document.createElement('section');
  card.className = 'social-card';
  const video = document.createElement('video');
  video.src = 'https://example.test/video';
  const pause = vi.spyOn(video, 'pause');
  card.append(video);
  row.append(card);
  view.set([{ key: 'media', render: () => row }, ...items(200)], false);
  expect(log.contains(row)).toBe(true);
  view.set(items(200), true);
  expect(row.querySelector('iframe')).toBeNull();
  expect(row.querySelector('video')).toBeNull();
  expect(pause).toHaveBeenCalled();
  row.append(document.createElement('iframe'));
  view.set([{ key: 'media', render: () => row }], true);
  view.stop();
  expect(row.querySelector('iframe')).toBeNull();
});
it('pauses only over message rows and resumes on leaving without losing deliberate scroll', () => {
  const { log, view } = setup();
  view.set(items(100), true, 0, false, true);
  log.scrollTop = log.scrollHeight - log.clientHeight;
  const liveTop = log.scrollTop;
  log.querySelector('.row')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  view.set(items(110), true, 0, false, true);
  expect(log.scrollTop).toBe(liveTop);
  log.dispatchEvent(new MouseEvent('mouseleave'));
  expect(log.scrollTop).toBeGreaterThan(liveTop);
  log.querySelector('.row')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  log.dispatchEvent(new WheelEvent('wheel'));
  log.scrollTop = 100;
  log.dispatchEvent(new Event('scroll'));
  log.dispatchEvent(new MouseEvent('mouseleave'));
  view.set(items(120), true, 0, false, true);
  expect(log.scrollTop).toBe(100);
  view.resume();
  view.set(items(120), true, 0, false, true);
  expect(log.scrollTop).toBeGreaterThan(100);
  view.stop();
});
it('mounts a bounded window for 100,000 records and navigates to distant rows', () => {
  const { log, view } = setup();
  const records = items(100000);
  view.set(records, true);
  expect(log.querySelectorAll('.row').length).toBeLessThan(100);
  expect(log.textContent).toContain('99999');
  expect(view.reveal('200')).toBe(true);
  expect(log.querySelector('[data-virtual-key="200"]')).not.toBeNull();
  expect(log.querySelector('[data-virtual-key="99999"]')).toBeNull();
  expect(view.reveal('missing')).toBe(false);
  view.stop();
});
it('anchors a paused reader when old rows are evicted or new rows arrive', () => {
  const { log, view } = setup();
  view.set(items(1000), false);
  view.reveal('500');
  const oldTop = log.scrollTop;
  view.set(items(1000, 100), false);
  expect(log.scrollTop).toBe(oldTop - 3200);
  expect(log.querySelector('[data-virtual-key="500"]')).not.toBeNull();
  view.set(items(1100, 100), false);
  expect(log.scrollTop).toBe(oldTop - 3200);
  view.stop();
});
it('anchors the visible DOM row when unmeasured heights disagree with estimated offsets', () => {
  const { log, view } = setup();
  view.set(items(1000), false);
  view.reveal('500');
  vi.spyOn(log, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 400, 640));
  for (const row of log.querySelectorAll<HTMLElement>('.row')) {
    const index = Number(row.dataset.virtualKey);
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 90 + (index - 500) * 32, 400, 32));
  }
  view.set(items(1000, 100), false);
  expect(log.scrollTop).toBe(400 * 32 + 10);
  view.stop();
});
it('does not build offscreen DOM nodes or repaint after disposal', () => {
  const { log, view } = setup();
  const render = vi.fn(() => document.createElement('article'));
  view.set(
    Array.from({ length: 10000 }, (_, i) => ({ key: String(i), render })),
    false,
  );
  expect(render.mock.calls.length).toBeLessThan(100);
  view.stop();
  const count = render.mock.calls.length;
  log.dispatchEvent(new Event('scroll'));
  expect(render).toHaveBeenCalledTimes(count);
});
it('lets a reader scroll away from the live edge without snapping back', async () => {
  const { log, view } = setup();
  view.set(items(1000), true);
  log.scrollTop = 5000;
  log.dispatchEvent(new Event('scroll'));
  await vi.waitFor(() => expect(log.querySelector('[data-virtual-key="160"]')).not.toBeNull());
  expect(log.scrollTop).toBe(5000);
  view.stop();
});
it('follows the top edge in reverse flow and preserves paused anchors through prepend', () => {
  const { log, view } = setup();
  view.set(items(1000).reverse(), true, 0, true);
  expect(log.scrollTop).toBe(0);
  expect(log.textContent).toContain('999');
  view.reveal('500');
  const oldTop = log.scrollTop;
  view.set(items(1100).reverse(), false, 0, true);
  expect(log.scrollTop).toBe(oldTop + 3200);
  expect(log.querySelector('[data-virtual-key="500"]')).not.toBeNull();
  view.stop();
});

it('keeps unchanged row subtrees connected as live rows append and the viewport advances', () => {
  const { log, view } = setup();
  const records = Array.from({ length: 100 }, (_, i) => {
    const row = document.createElement('article');
    row.className = 'row';
    return { key: String(i), render: () => row };
  });
  view.set(records, true);
  const keep = log.querySelector('[data-virtual-key="95"]')!;
  const frame = document.createElement('iframe');
  keep.append(frame);
  const insert = vi.spyOn(log, 'insertBefore');
  view.set([...records, { key: '100', render: () => document.createElement('article') }], true);
  expect(log.querySelector('[data-virtual-key="95"]')).toBe(keep);
  expect(keep.querySelector('iframe')).toBe(frame);
  expect(insert.mock.calls.some(([node]) => node === keep)).toBe(false);
  view.stop();
});
it('restores a paused reader by stable key and pixel offset after rebuilding the view', () => {
  const { log, view } = setup();
  view.set(items(100), false);
  expect(view.restoreReader({ key: '20', offset: 7 })).toBe(true);
  expect(log.scrollTop).toBe(647);
  const position = view.readerPosition();
  expect(position).toEqual({ key: '20', offset: 7 });
  view.stop();
  const next = new VirtualLog(log);
  next.set(items(110), true);
  expect(next.restoreReader(position!)).toBe(true);
  expect(log.scrollTop).toBe(647);
  expect(next.isFollowing()).toBe(false);
  expect(next.restoreReader({ key: 'missing', offset: 0 })).toBe(false);
  next.stop();
});
