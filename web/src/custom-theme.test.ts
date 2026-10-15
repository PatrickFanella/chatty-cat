import { expect, it } from 'vitest';
import { parseTheme, importTheme, themeContrast } from './custom-theme';
const colors = {
  background: '#101010',
  panel: '#202020',
  foreground: '#ffffff',
  muted: '#bbbbbb',
  border: '#888888',
  accent: '#99ddff',
};
it('normalizes versioned color-only data and rejects executable or ambiguous values', () => {
  expect(parseTheme({ version: 1, name: 'Night', colors: { ...colors, accent: '#ABC' } }).colors.accent).toBe(
    '#aabbcc',
  );
  for (const bad of ['url(https://evil.test/a)', 'red; background:url(x)', 'var(--x)', '#00000000', 'red'])
    expect(() => parseTheme({ version: 1, name: 'Night', colors: { ...colors, accent: bad } })).toThrow();
  expect(() => parseTheme({ version: 2, name: 'Night', colors })).toThrow();
  expect(() => parseTheme({ version: 1, name: 'Night', colors, css: 'body{}' })).toThrow();
});
it('maps the pinned Chatterino subset and reports every unsupported leaf without exporting it', () => {
  const result = importTheme(
    JSON.stringify({
      colors: {
        accent: '#9df',
        messages: {
          backgrounds: { regular: '#111', alternate: '#222' },
          textColors: { regular: '#fff', system: '#bbb', link: '#9df' },
        },
        splits: { header: { background: '#222', border: '#888' }, messageSeperator: '#888' },
        tabs: { liveIndicator: '#f00' },
      },
    }),
    'chatterino',
  );
  expect(result.theme.colors.background).toBe('#111111');
  expect(result.unsupported).toEqual([
    'colors.messages.backgrounds.alternate',
    'colors.messages.textColors.link',
    'colors.splits.messageSeperator',
    'colors.tabs.liveIndicator',
  ]);
  expect(JSON.stringify(result.theme)).not.toContain('liveIndicator');
  expect(() => importTheme(JSON.stringify({ colors: { accent: 'url(https://evil.test/a)' } }), 'chatterino')).toThrow();
});
it('bounds input and gives measurable foreground and muted contrast on both surfaces', () => {
  expect(() => importTheme(' '.repeat(65537), 'native')).toThrow();
  const pairs = themeContrast(parseTheme({ version: 1, name: 'Night', colors }));
  expect(pairs).toHaveLength(6);
  expect(pairs[0]!.ratio).toBeGreaterThan(18);
  expect(pairs.every((p) => Number.isFinite(p.ratio))).toBe(true);
});
