// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { CommandRegistry } from './registry';
import { scoreMatch } from './palette';
import { prettyBinding } from './index';
describe('command registry', () => {
  it('uses explicit command metadata and removes only its registered owner', () => {
    const registry = new CommandRegistry();
    let runs = 0;
    const dispose = registry.register({
      id: 'panel:stats-panel',
      label: 'Stats',
      group: 'chat',
      panel: 'stats-panel',
      run: () => runs++,
    });
    expect(registry.get('panel:stats-panel')?.panel).toBe('stats-panel');
    registry.get('panel:stats-panel')!.run();
    expect(runs).toBe(1);
    document.body.append(document.createElement('button'));
    expect(registry.all()).toHaveLength(1);
    const replacement = registry.register({
      id: 'panel:stats-panel',
      label: 'Statistics',
      group: 'chat',
      run: () => {},
    });
    dispose();
    expect(registry.get('panel:stats-panel')?.label).toBe('Statistics');
    replacement();
    expect(registry.all()).toHaveLength(0);
    registry.stop();
    document.body.replaceChildren();
  });
  it('scores palette matches by prefix, substring and subsequence', () => {
    expect(scoreMatch('', 'anything')).toBe(1);
    expect(scoreMatch('prov', 'Provider activity')).toBe(3);
    expect(scoreMatch('activity', 'Provider activity')).toBe(2);
    expect(scoreMatch('prvact', 'Provider activity')).toBe(1);
    expect(scoreMatch('zzz', 'Provider activity')).toBe(0);
  });
  it('prints bindings for humans', () => {
    expect(prettyBinding('Alt+Shift+KeyH')).toBe('Alt+Shift+H');
    expect(prettyBinding('Alt+BracketRight')).toBe('Alt+]');
    expect(prettyBinding('F5')).toBe('F5');
    expect(prettyBinding('')).toBe('');
  });
});
