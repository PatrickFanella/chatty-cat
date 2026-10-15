// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { VirtualLog } from './virtual-log';
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
it('captures and restores a padded viewport against one consistent edge across a style revision', () => {
  const log = document.createElement('main');
  log.style.paddingTop = '8px';
  document.body.append(log);
  Object.defineProperty(log, 'clientHeight', { value: 200 });
  Object.defineProperty(log, 'scrollHeight', { value: 3200 });
  vi.spyOn(log, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 400, 200));
  let height = 32;
  const items = Array.from({ length: 100 }, (_, i) => ({
    key: String(i),
    render: () => {
      const row = document.createElement('article');
      row.className = 'row';
      vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => {
        const leading = parseFloat((log.firstElementChild as HTMLElement)?.style.height ?? '0') || 0;
        const children = [...log.children].filter((n) => n instanceof HTMLElement && n.dataset.virtualKey);
        const index = children.indexOf(row);
        return new DOMRect(0, 100 + leading + index * height - log.scrollTop, 400, height);
      });
      return row;
    },
  }));
  const view = new VirtualLog(log);
  view.set(items, false);
  log.scrollTop = 320;
  view.set(items, false);
  const before = view.readerPosition();
  document.dispatchEvent(new Event('presentation-before-change'));
  height = 40;
  view.set(items, false, 1);
  expect(view.readerPosition()).toEqual(before);
  view.stop();
});
