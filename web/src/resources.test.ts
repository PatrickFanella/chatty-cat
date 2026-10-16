// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { Resources, resourceURL } from './resources';
import { resourceFixture as RESOURCE_TABS } from '../test-support/reference-data';
afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it('retains all curated tabs while excluding executable markup and unsafe links', () => {
  expect(Object.keys(RESOURCE_TABS)).toEqual(['htabRes', 'htabLib', 'htabLbr', 'htabAuth']);
  let links = 0;
  for (const html of Object.values(RESOURCE_TABS)) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('script,iframe,style,img')).toBeNull();
    for (const node of doc.querySelectorAll('*'))
      for (const attr of node.attributes) expect(attr.name).not.toMatch(/^on/);
    for (const link of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const href = link.getAttribute('href')!;
      expect(href.startsWith('?channel=') || href === '#authors' || /^https?:\/\//.test(href)).toBe(true);
      if (!href.startsWith('?') && !href.startsWith('#')) expect(link.rel).toContain('noopener');
      links++;
    }
  }
  expect(links).toBeGreaterThan(300);
  const authors = new DOMParser().parseFromString(RESOURCE_TABS.htabAuth!, 'text/html');
  expect(authors.querySelectorAll('a[data-b]').length).toBeGreaterThan(50);
  expect(authors.querySelectorAll('.linkcols').length).toBeGreaterThan(5);
});
it('supports tab keyboard navigation, linked help actions and close focus restoration', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false })),
  );
  const root = document.createElement('section');
  root.hidden = true;
  root.innerHTML =
    '<span id="resources-handle"></span><button id="resources-pin"></button><button id="resources-close"></button><nav role="tablist"></nav><div class="resource-content"></div>';
  const trigger = document.createElement('button');
  document.body.append(trigger, root);
  const action = vi.fn();
  const panel = new Resources(root, trigger, action, RESOURCE_TABS);
  trigger.click();
  expect(root.hidden).toBe(false);
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  expect(tabs).toHaveLength(5);
  tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
  expect(tabs[4]?.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(tabs[4]);
  tabs[4]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
  root.querySelector<HTMLButtonElement>('[data-help-action="display-open"]')?.click();
  expect(action).toHaveBeenCalledWith('display-open');
  root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(root.hidden).toBe(true);
  expect(document.activeElement).toBe(trigger);
  panel.stop();
});

it('restores resource URL aliases, visibility precedence and bounded widths', () => {
  expect(resourceURL(new URLSearchParams('htab=resources&hpw=900'))).toEqual({
    tab: 'htabRes',
    open: true,
    width: 900,
    action: undefined,
  });
  expect(resourceURL(new URLSearchParams('htab=authors&help=off&hpw=999999')).open).toBe(false);
  expect(resourceURL(new URLSearchParams('htab=config')).action).toBe('display-open');
  expect(resourceURL(new URLSearchParams('htab=stats')).action).toBe('stats-open');
  expect(resourceURL(new URLSearchParams('htab=liberatory')).tab).toBe('htabLib');
});
