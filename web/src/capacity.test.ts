import { expect, it } from 'vitest';
import { parseCapacity } from './capacity';
import { parseWorkspaceChannels, parseChannels } from './protocol';
import { SplitLayout, reconcileSplits } from './splits';
it('replaces every channel without duplicating the fallback channel or losing pane preferences', () => {
  const model = new SplitLayout(['hasanabi']);
  model.activePane.filter = 'saved';
  model.activePane.reader = { key: 'hasanabi:old', offset: 12 };
  const next = reconcileSplits(model.snapshot(), ['patrick__eff', 'other'], ['hasanabi']);
  expect(next).not.toBeNull();
  expect(next?.tabs[0]?.panes[0]?.channels).toEqual(['patrick__eff', 'other']);
  expect(next?.tabs[0]?.panes[0]?.target).toBe('patrick__eff');
  expect(next?.tabs[0]?.panes[0]?.filter).toBe('saved');
  expect(next?.tabs[0]?.panes[0]?.reader).toBeNull();
  const only = reconcileSplits(model.snapshot(), ['patrick__eff'], ['hasanabi']);
  expect(only?.tabs[0]?.panes[0]?.channels).toEqual(['patrick__eff']);
});
it('keeps the pane cap at six and validates separately configured workspace capacity', () => {
  const raw = 'a,b,c,d,e,f,g,h,i,j,k,l';
  expect(parseWorkspaceChannels(raw, 12)).toHaveLength(12);
  expect(() => parseChannels(raw)).toThrow();
  expect(() => parseWorkspaceChannels(raw, 6)).toThrow();
  expect(() => parseWorkspaceChannels(raw, 1000)).toThrow();
  expect(parseCapacity({ paneChannels: 6, workspaceChannels: 12, subscriptions: 96 })).toEqual({
    paneChannels: 6,
    workspaceChannels: 12,
    subscriptions: 96,
  });
  expect(parseCapacity({ paneChannels: 50, workspaceChannels: 1000, subscriptions: 9999 })).toBeNull();
});
it('groups larger workspaces into bounded panes and retains surviving reader preferences across join/leave', () => {
  const joined = parseWorkspaceChannels('a,b,c,d,e,f,g,h,i,j,k,l');
  const model = new SplitLayout(joined);
  expect(model.enabled).toBe(true);
  expect(model.activeTab.panes.map((p) => p.channels.length)).toEqual([6, 6]);
  model.activePane.reader = { key: 'a:saved', offset: 12 };
  const next = reconcileSplits(model.snapshot(), ['a', 'b', 'c', 'd', 'e', 'f', 'h', 'i', 'j', 'k', 'l', 'new']);
  expect(next).not.toBeNull();
  expect(next?.tabs[0]?.panes[0]?.reader).toEqual({ key: 'a:saved', offset: 12 });
  expect(next?.tabs.flatMap((t) => t.panes.flatMap((p) => p.channels))).toContain('new');
  expect(next?.tabs.flatMap((t) => t.panes.flatMap((p) => p.channels))).not.toContain('g');
  expect(next?.tabs.every((t) => t.panes.every((p) => p.channels.length <= 6))).toBe(true);
});
