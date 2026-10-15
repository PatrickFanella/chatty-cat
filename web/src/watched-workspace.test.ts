import { expect, it } from 'vitest';
import { watchedWorkspace } from './watched-workspace';
import { SplitLayout } from './splits';
import { parseDisplay } from './display';
import type { WorkspaceSnapshot } from './workspaces';
it('keeps reader/layout preferences and existing channels while selecting the reviewed target', () => {
  const original: WorkspaceSnapshot = {
    channels: ['one'],
    target: 'one',
    focus: 'log',
    readers: [{ column: 0, key: 'one:message', offset: 12 }],
    settings: { version: 1, display: parseDisplay({}), extras: { splits: new SplitLayout(['one']).snapshot() } },
  };
  const before = JSON.stringify(original);
  const next = watchedWorkspace(original, 'two', 24);
  expect(next.channels).toEqual(['one', 'two']);
  expect(next.target).toBe('two');
  expect(next.readers).toEqual(original.readers);
  expect(JSON.stringify(original)).toBe(before);
  expect(JSON.stringify(next.settings.extras.splits)).toContain('two');
  expect(() => watchedWorkspace(original, 'two', 1)).toThrow();
  expect(() => watchedWorkspace(original, 'https://evil.test', 24)).toThrow();
});
