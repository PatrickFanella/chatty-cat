// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DisplayRuntime } from '../display';
import { PresentationRuntime } from '../presentation-runtime';
import type { SettingsHost } from './host';
import type { CustomSection } from './registry';
import { Workbench } from '../shell/workbench';
import { dock, emptyLayout, float, setClosed } from '../shell/layout';
import { RETIRED_PANELS, forgetRetiredPanels, retiredTarget, startSettings } from './index';

let display: DisplayRuntime;
let presentation: PresentationRuntime;
let stops: (() => void)[] = [];

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }));
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  localStorage.clear();
  display = new DisplayRuntime(() => {});
  presentation = new PresentationRuntime(() => {});
});

afterEach(() => {
  stops.forEach((stop) => stop());
  stops = [];
  display.stop();
  presentation.stop();
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function host(privacy = false): SettingsHost {
  return {
    display,
    presentation,
    rerender: vi.fn(),
    providersChanged: vi.fn(),
    reloadProviders: () => true,
    providerStatus: () => '',
    reconnectProviders: vi.fn(),
    readChatters: async () => '',
    attention: { permission: vi.fn(async () => 'granted'), test: vi.fn(async () => '') },
    openPanel: vi.fn(),
    overlay: false,
    readonlyView: false,
    privacy: () => privacy,
  };
}

const accounts: CustomSection = {
  id: 'panel:account-profiles',
  page: 'accounts',
  section: 'Accounts',
  keywords: 'accounts profiles sign in',
  mount: async (el) => {
    el.textContent = 'Account profiles';
    return () => {};
  },
};

function start(privacy = false) {
  const settings = startSettings(host(privacy), [accounts]);
  stops.push(() => settings.stop());
  return settings;
}

const ids = (groups: { entries: { def: { id: string } }[] }[]) => groups.flatMap((g) => g.entries.map((e) => e.def.id));

it('startSettings registers every source and the embedded sections', () => {
  const { registry } = start();
  expect(ids(registry.page('general'))).toContain('display.size');
  expect(ids(registry.page('general'))).toContain('presentation.boldScale');
  expect(ids(registry.page('accounts'))).toContain('panel:account-profiles');
  expect(ids(registry.page('notifications'))).toContain('builtin.alerts');
  expect(ids(registry.page('about'))).toContain('builtin.about');
});

it('palette entries open the window at the setting', async () => {
  const settings = start();
  const entries = settings.entries();
  expect(entries.map((e) => e.label)).toContain('Settings: Hotkeys');
  const size = entries.find((e) => e.label === 'Size — General › Font');
  expect(size).toBeDefined();
  size!.run();
  await vi.waitFor(() => expect(document.querySelector<HTMLDialogElement>('#settings-window')?.open).toBe(true));
  const row = document.querySelector('.settings-row[data-setting="display.size"]');
  expect(row).not.toBeNull();
  expect(document.activeElement).toBe(row!.querySelector('select'));
  entries.find((e) => e.label === 'Settings: Hotkeys')!.run();
  await vi.waitFor(() =>
    expect(document.querySelector('.settings-nav [aria-current="page"]')?.textContent).toBe('Hotkeys'),
  );
});

it('palette entries hide private settings in privacy mode', () => {
  const labels = start(true)
    .entries()
    .map((e) => e.label);
  expect(labels).toContain('Settings: General');
  expect(labels.some((label) => label.startsWith('Size — '))).toBe(false);
});

it('the About section shows the version and links the source', async () => {
  const meta = document.createElement('meta');
  meta.name = 'version';
  meta.content = '1.2.3';
  document.head.append(meta);
  const about = start().registry.get('builtin.about');
  expect(about?.type).toBe('custom');
  const el = document.createElement('div');
  if (about?.type === 'custom') await about.def.mount(el);
  meta.remove();
  expect(el.textContent).toContain('1.2.3');
  const links = [...el.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.textContent]);
  expect(links).toContainEqual(['/source.tar.gz', 'Source code (AGPL-3.0)']);
  expect(links).toEqual([['/source.tar.gz', 'Source code (AGPL-3.0)']]);
});

it('the About section omits the version line without a version meta tag', async () => {
  const about = start().registry.get('builtin.about');
  const el = document.createElement('div');
  if (about?.type === 'custom') await about.def.mount(el);
  expect(el.textContent).not.toContain('Version');
});

it('retired panel ids redirect to their settings page', async () => {
  const settings = start();
  const pages: Record<string, string> = {
    'display-panel': 'General',
    'presentation-panel': 'General',
    'link-preferences-panel': 'General',
    'completion-preferences-panel': 'Commands',
    'provider-preferences-panel': 'Integrations',
  };
  expect(Object.keys(RETIRED_PANELS).sort()).toEqual(Object.keys(pages).sort());
  for (const [id, title] of Object.entries(pages)) {
    settings.open(retiredTarget(id));
    await vi.waitFor(() =>
      expect(document.querySelector('.settings-nav [aria-current="page"]')?.textContent).toBe(title),
    );
  }
  // The help tab's display action and htab=config open the former display panel's page.
  expect(retiredTarget('display-open')).toEqual(RETIRED_PANELS['display-panel']);
  expect(retiredTarget('stats-open')).toBeUndefined();
  expect(retiredTarget('stats-panel')).toBeUndefined();
});

it('startup releases retired ids from a saved layout', () => {
  let layout = dock(emptyLayout(), 'presentation-panel', 'right');
  layout = dock(layout, 'stats-panel', 'right');
  layout = dock(layout, 'display-panel', 'bottom');
  layout = float(
    layout,
    'link-preferences-panel',
    { left: 10, top: 10, width: 300, height: 200 },
    { width: 1280, height: 800 },
  );
  layout = setClosed(dock(layout, 'provider-preferences-panel', 'left'), 'provider-preferences-panel', true);
  localStorage.setItem('chatthing:v1:workbench', JSON.stringify(layout));
  const workbench = new Workbench({ titleFor: (root) => root.id, exclude: () => false, centre: 'main#log' });
  stops.push(() => workbench.stop());
  expect(workbench.wantsPanel('presentation-panel')).toBe(true);
  forgetRetiredPanels(workbench);
  const saved = localStorage.getItem('chatthing:v1:workbench')!;
  for (const id of Object.keys(RETIRED_PANELS)) {
    expect(saved).not.toContain(id);
    expect(workbench.wantsPanel(id)).toBe(false);
  }
  expect(workbench.wantsPanel('stats-panel')).toBe(true);
});

it('opens Settings with the embedded custom theme editor in its own subsection', async () => {
  const settings = startSettings(host(), [
    {
      id: 'panel:custom-theme',
      page: 'general',
      section: 'Custom themes',
      keywords: 'themes colors',
      mount: async (el) => {
        el.textContent = 'Theme editor';
        return () => {};
      },
    },
  ]);
  stops.push(() => settings.stop());
  settings.open({ page: 'general', section: 'Custom themes' });
  const section = document.querySelector<HTMLDetailsElement>('[data-section="Custom themes"]')!;
  expect(document.querySelector<HTMLDialogElement>('#settings-window')?.open).toBe(true);
  expect(section.open).toBe(true);
  await vi.waitFor(() => expect(section.textContent).toContain('Theme editor'));
});
