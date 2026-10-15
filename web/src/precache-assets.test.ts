import { expect, it } from 'vitest';
import { precacheAssets } from './precache-assets';
it('includes unopened lazy chunks and shared styles without executing them', () => {
  expect(
    precacheAssets({
      main: { file: 'assets/main-a.js', css: ['assets/main-b.css'] },
      panel: { file: 'assets/panel-c.js', isDynamicEntry: true, css: ['assets/main-b.css'] },
      worker: { file: 'sw.js' },
    }),
  ).toEqual(['/assets/main-a.js', '/assets/main-b.css', '/assets/panel-c.js']);
});
it('rejects missing manifests and paths outside the immutable build directory', () => {
  for (const manifest of [
    null,
    [],
    {},
    { bad: { file: 'https://other.test/a.js' } },
    { bad: { file: 'assets/../private.json' } },
    { bad: { file: '/api/auth/session' } },
  ])
    expect(() => precacheAssets(manifest)).toThrow();
});
