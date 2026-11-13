// Settings entry: registers every source, builds the window on first open and lists palette entries.
import type { SettingsHost } from './host';
import { PAGES, SettingsRegistry, type CustomSection, type PageId } from './registry';
import { SettingsWindow } from './window';
import { displaySettings } from './sources/display';
import { presentationSettings } from './sources/presentation';
import { completionSettings } from './sources/completion';
import { linkSettings } from './sources/links';
import { providerSettings } from './sources/providers';
import { builtinSections } from './sources/builtin';

export { RETIRED_PANELS, forgetRetiredPanels, retiredTarget } from './retired';

export interface SettingsTarget {
  page?: PageId;
  setting?: string;
  section?: string;
}

export interface Settings {
  open(target?: SettingsTarget): void;
  close(): void;
  entries(): { id: string; label: string; run(): void }[];
  registry: SettingsRegistry;
  stop(): void;
}

const PROBE_KEY = 'chatty-cat:v1:settings-probe';

function storageAvailable(): boolean {
  try {
    localStorage.setItem(PROBE_KEY, '1');
    localStorage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

function link(href: string, text: string, external: boolean): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  if (external) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  return a;
}

const about: CustomSection = {
  id: 'builtin.about',
  page: 'about',
  section: 'About',
  keywords: 'about version source code license agpl chatty cat',
  async mount(el) {
    const box = document.createElement('div');
    const version = document.querySelector<HTMLMetaElement>('meta[name=version]')?.content.trim();
    if (version) {
      const line = document.createElement('p');
      line.textContent = 'Version ' + version;
      box.append(line);
    }
    const source = document.createElement('p');
    source.append(link('/source.tar.gz', 'Source code (AGPL-3.0)', false));
    box.append(source);
    el.append(box);
    return () => box.remove();
  },
};

export function startSettings(host: SettingsHost, embedded: readonly CustomSection[]): Settings {
  const registry = new SettingsRegistry(host.privacy);
  registry.add([
    ...displaySettings(host),
    ...presentationSettings(host),
    ...linkSettings(host),
    ...completionSettings(host),
    ...providerSettings(host),
    ...builtinSections(host),
    about,
    ...embedded,
  ]);
  let view: SettingsWindow | undefined;
  let stopped = false;
  const open = (target: SettingsTarget = {}): void => {
    if (stopped) return;
    view ??= new SettingsWindow(registry, { storageAvailable: storageAvailable() });
    view.open(target);
  };
  return {
    registry,
    open,
    close: () => view?.close(),
    entries() {
      const out: { id: string; label: string; run(): void }[] = [];
      for (const page of PAGES)
        out.push({
          id: 'settings:page:' + page.id,
          label: 'Settings: ' + page.title,
          run: () => open({ page: page.id }),
        });
      for (const page of PAGES)
        for (const { section, entries } of registry.page(page.id))
          for (const entry of entries)
            if (entry.type === 'setting')
              out.push({
                id: 'settings:' + entry.def.id,
                label: `${entry.def.label} — ${page.title} › ${section}`,
                run: () => open({ setting: entry.def.id }),
              });
      return out;
    },
    stop() {
      stopped = true;
      view?.stop();
      view = undefined;
    },
  };
}
