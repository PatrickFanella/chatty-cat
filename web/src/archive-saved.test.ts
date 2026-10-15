// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { SavedArchiveQueries, parseSavedArchiveQueries } from './archive-saved';
afterEach(() => localStorage.clear());
it('isolates saved queries, replaces an explicit name and deletes only the current account data', () => {
  const store = new SavedArchiveQueries();
  expect(() => store.save('one', 'sender:alice')).toThrow('Wait');
  store.setAccount('one');
  store.save('one', 'sender:alice');
  store.save('one', 'sender:bob');
  expect(store.list()).toHaveLength(1);
  const id = store.list()[0]!.id;
  store.setAccount('two');
  expect(store.list()).toEqual([]);
  store.save('two', 'is:reply');
  store.clear();
  store.setAccount('one');
  expect(store.list()[0]!.query).toBe('sender:bob');
  store.delete(id);
  expect(store.list()).toEqual([]);
});
it('rejects malformed saved data and unsupported queries without overwriting the original', () => {
  const store = new SavedArchiveQueries();
  store.setAccount('one');
  localStorage.setItem(store.key!, 'malformed');
  expect(() => store.save('name', 'text:hi')).toThrow();
  expect(localStorage.getItem(store.key!)).toBe('malformed');
  expect(() =>
    parseSavedArchiveQueries(
      JSON.stringify({ version: 1, queries: [{ id: 'id', name: 'name', query: 'regex:"(a+)+"' }] }),
    ),
  ).toThrow();
  store.clear();
  for (let i = 0; i < 20; i++) store.save(String(i), 'hello');
  expect(() => store.save('extra', 'hello')).toThrow('20');
});
