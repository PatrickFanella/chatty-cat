import { describe, expect, it } from 'vitest';
import { SettingsRegistry, type CustomSection, type SettingDef } from './registry';

function def(id: string, over: Partial<SettingDef> = {}): SettingDef {
  return {
    id,
    page: 'general',
    section: 'Appearance',
    label: id,
    control: { kind: 'toggle' },
    read: () => false,
    write: () => {},
    defaultValue: () => false,
    ...over,
  };
}

describe('settings registry', () => {
  it('rejects duplicate ids', () => {
    const r = new SettingsRegistry(() => false);
    expect(() => r.add([def('a.x'), def('a.x')])).toThrow(/duplicate/i);
  });

  it('rejects unknown sections', () => {
    const r = new SettingsRegistry(() => false);
    expect(() => r.add([def('a.y', { section: 'Nope' })])).toThrow(/section/i);
  });

  it('orders sections by PAGES and drops empty ones', () => {
    const r = new SettingsRegistry(() => false);
    r.add([def('f', { section: 'Font' }), def('a', { section: 'Appearance' })]);
    expect(r.page('general').map((s) => s.section)).toEqual(['Appearance', 'Font']);
  });

  it('filters hidden and private entries', () => {
    const r = new SettingsRegistry(() => true);
    r.add([def('shown'), def('hidden', { visible: () => false }), def('secret', { private: true })]);
    const ids = r.page('general').flatMap((s) => s.entries.map((e) => e.def.id));
    expect(ids).toEqual(['shown']);
    expect(r.search('secret')).toEqual([]);
  });

  it('search matches label, hint, keywords and section case-insensitively as plain text', () => {
    const r = new SettingsRegistry(() => false);
    r.add([
      def('ts', { label: 'Timestamps' }),
      def('h', { label: 'Other', hint: 'Shows a hint' }),
      def('k', { label: 'Else', keywords: 'zebra' }),
      def('s1', { section: 'Scrolling', label: 'One' }),
      def('s2', { section: 'Scrolling', label: 'Two' }),
    ]);
    const ids = (q: string) => r.search(q).flatMap((g) => g.entries.map((e) => e.def.id));
    expect(ids('TIME')).toEqual(['ts']);
    expect(ids('hint')).toEqual(['h']);
    expect(ids('ZEBRA')).toEqual(['k']);
    expect(r.search('([')).toEqual([]);
    expect(ids('Scrolling')).toEqual(['s1', 's2']);
    expect(r.search('  ')).toEqual([]);
  });

  it('search matches custom section keywords', () => {
    const r = new SettingsRegistry(() => false);
    const custom: CustomSection = {
      id: 'c',
      page: 'accounts',
      section: 'Accounts',
      keywords: 'oauth login',
      mount: async () => () => {},
    };
    r.add([custom]);
    const found = r.search('login');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ page: 'accounts', section: 'Accounts' });
    expect(r.get('c')?.type).toBe('custom');
  });

  it('notify dispatches change', () => {
    const r = new SettingsRegistry(() => false);
    let n = 0;
    r.addEventListener('change', () => n++);
    r.notify();
    expect(n).toBe(1);
  });
});
