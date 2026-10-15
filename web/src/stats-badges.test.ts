// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { badgeGroups, renderBadgeReference } from './stats-badges';
const badge = { url: 'https://example.com/badge.png', title: 'Subscriber', description: 'Channel subscriber' };
it('unions versions across channels and orders by version count or name', () => {
  const catalogs = [
    { subscriber: { '1': badge, '12': badge }, moderator: { '1': badge } },
    { subscriber: { '6': badge }, artist: { '1': badge } },
  ];
  const grouped = badgeGroups(catalogs, [{ name: 'subscriber/6', count: 7 }], 'versions');
  expect(grouped[0]?.name).toBe('subscriber');
  expect(grouped[0]?.versions.map((v) => v.version)).toEqual(['1', '6', '12']);
  expect(grouped[0]?.versions[1]?.count).toBe(7);
  expect(badgeGroups(catalogs, [], 'name').map((group) => group.name)).toEqual(['artist', 'moderator', 'subscriber']);
});
it('keeps expanded sets, text labels and lazy images without interpreting upstream HTML', () => {
  const groups = badgeGroups(
    [{ subscriber: { '1': { ...badge, title: '<script>bad</script>' } } }],
    [{ name: 'subscriber/1', count: 4 }],
    'versions',
  );
  const section = renderBadgeReference(groups, new Set(['subscriber']));
  expect(section.querySelector('details')?.open).toBe(true);
  expect(section.textContent).toContain('<script>bad</script> · 4 observed');
  expect(section.querySelector('script')).toBeNull();
  expect(section.querySelector('img')?.loading).toBe('lazy');
  expect(renderBadgeReference([], new Set()).textContent).toContain('unavailable');
});
