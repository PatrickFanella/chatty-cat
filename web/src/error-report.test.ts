// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { ErrorReport, errorText } from './error-report';
it('reports repeated runtime errors as text, dismisses, and removes lifecycle listeners', () => {
  const root = document.createElement('div'), report = new ErrorReport(root);
  window.dispatchEvent(new ErrorEvent('error', { message: '<img src=x> failed' }));
  window.dispatchEvent(new ErrorEvent('error', { message: '<img src=x> failed' }));
  expect(root.querySelector('[role=alert]')?.textContent).toContain('2 times');
  expect(root.querySelector('img')).toBeNull(); expect(root.querySelector('pre')?.textContent).toContain('<img src=x>');
  (root.querySelectorAll('button')[1] as HTMLButtonElement).click(); expect(root.querySelector('aside')?.hidden).toBe(true);
  report.stop(); window.dispatchEvent(new ErrorEvent('error', { message: 'late' })); expect(root.children).toHaveLength(0);
});
it('omits URL queries and credential fields from copyable reports', () => {
  expect(errorText(new Error('failed https://example.org/callback?code=private&state=nonce access_token=secret'))).toBe('failed https://example.org/callback [redacted]');
  expect(errorText({ token: 'private' })).toBe('Unknown runtime error');
});
