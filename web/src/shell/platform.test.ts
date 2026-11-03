import { afterEach, expect, it, vi } from 'vitest';
import { applePlatform } from './platform';

afterEach(() => vi.unstubAllGlobals());

const stub = (value: Partial<Navigator> & { userAgentData?: { platform?: string } }): void => {
  vi.stubGlobal('navigator', value);
};

it('prefers userAgentData.platform', () => {
  stub({ userAgentData: { platform: 'macOS' }, userAgent: 'Windows' });
  expect(applePlatform()).toBe(true);
  stub({ userAgentData: { platform: 'Windows' }, userAgent: 'Macintosh' });
  expect(applePlatform()).toBe(false);
});

it('falls back to the user agent string', () => {
  stub({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' });
  expect(applePlatform()).toBe(true);
  stub({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
  expect(applePlatform()).toBe(false);
});
