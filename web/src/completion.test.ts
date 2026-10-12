import { expect, it } from 'vitest';
import { completions, insertCompletion, wireMessage } from './completion';
it('completes nicknames case-insensitively at the caret', () => {
  expect(completions('hi @vi', 6, 6, ['viewer', 'Violet', 'viewer'], [])?.items.map((item) => item.value)).toEqual(['@viewer', '@Violet']);
  expect(completions('@v', 1, 2, ['viewer'], [])).toBeUndefined();
});
it('offers colon and bare emotes and preserves exact provider spelling', () => {
  expect(completions(':ka', 3, 3, [], ['Kappa'])?.items[0]?.value).toBe('Kappa');
  expect(completions('Kap', 3, 3, [], ['Kappa'])).toBeUndefined();
  expect(completions('Kap', 3, 3, [], ['Kappa'], true)?.items[0]?.value).toBe('Kappa');
  expect(completions('Ka', 2, 2, [], ['Kappa'], true)).toBeUndefined();
});
it('inserts into the active word without losing following text or Unicode', () => {
  const text = '😀 @vi there';
  const result = completions(text, 6, 6, ['viewer'], []);
  expect(result).toBeDefined();
  expect(insertCompletion(text, result!, 0)).toEqual({ text: '😀 @viewer there', caret: 10 });
});
it('bounds suggestions and converts multiline drafts into a single chat line', () => {
  expect(completions('@v', 2, 2, Array.from({ length: 50 }, (_, i) => 'viewer' + i), [])?.items).toHaveLength(30);
  expect(wireMessage('  one\ntwo\r\nthree  ')).toBe('one two three');
});
it('completes custom triggers only at the beginning and keeps caret insertion safe',()=>{
 const result=completions('/gre',4,4,[],[],false,['/greet','/good']);expect(result?.items[0]).toEqual({value:'/greet',kind:'command'});
 expect(insertCompletion('/gre after',result!,0).text).toBe('/greet after');expect(completions('hi /gre',7,7,[],[],false,['/greet'])).toBeUndefined();
});
