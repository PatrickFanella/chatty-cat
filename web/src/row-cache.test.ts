// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { RowCache } from './row-cache';
it('bounds cached DOM independently of retained messages, preserves handlers and separates duplicate pane rows', () => {
  const cache = new RowCache(2),
    message = {},
    build = vi.fn(() => document.createElement('article'));
  const first = cache.get(message, 'one', 0, build),
    second = cache.get(message, 'two', 0, build);
  expect(first).not.toBe(second);
  expect(cache.get(message, 'one', 0, build)).toBe(first);
  const click = vi.fn();
  first.addEventListener('click', click);
  first.click();
  expect(click).toHaveBeenCalledOnce();
  const parent = document.createElement('main');
  parent.append(second);
  cache.get({}, 'one', 0, build);
  expect(cache.size).toBe(2);
  expect(second.parentElement).toBe(parent);
  expect(cache.get(message, 'two', 0, build)).not.toBe(second);
  expect(cache.get(message, 'one', 1, build)).not.toBe(first);
  cache.clear();
  expect(cache.size).toBe(0);
});
