import type { CommandGroup, CommandRegistry } from './registry';
import type { CustomSection, PageId } from '../settings/registry';

export interface Panel {
  readonly id: string;
  readonly title: string;
  readonly group: CommandGroup;
  readonly root: HTMLElement;
  open(): void;
  close(): void;
  stop(): void;
}
export interface PanelDefinition {
  id: string;
  title: string;
  label?: () => string;
  group: CommandGroup;
  keywords?: string;
  command?: boolean;
  restorable?: boolean;
  available?: () => boolean;
  // Embedded as a custom section of a Settings page instead of the menu/workbench.
  settings?: { page: PageId; section: string; keywords: string };
  // Import first; construct only after checking the current view/account again.
  load: () => Promise<() => Panel>;
}
export interface PanelWorkbench {
  adopt(root: HTMLElement, close?: () => void): void;
  wantsPanel(id: string): boolean;
  releaseAll(ids: readonly string[]): void;
  onLayoutChange(listener: () => void): () => void;
}
interface Entry {
  definition: PanelDefinition;
  dispose: () => void;
  panel?: Panel | undefined;
  loading?: Promise<void> | undefined;
  loadingVersion?: number;
  manualRequested: boolean;
  activateRequested: boolean;
  version: number;
  // Removes the listeners of the current inline embedding.
  detach?: (() => void) | undefined;
}

// Register commands without constructing DOM or importing their feature module.
export class LazyPanels {
  private entries = new Map<string, Entry>();
  private stopped = false;
  private unwatch: () => void;
  private openSettings?: (target: { page: PageId; section: string }) => void;
  constructor(
    private registry: CommandRegistry,
    private workbench: PanelWorkbench,
    private context: () => string,
    private available: () => boolean,
    private failure: (title: string) => void,
  ) {
    this.unwatch = workbench.onLayoutChange(this.restore);
  }
  register(definition: PanelDefinition): void {
    if (this.stopped || this.entries.has(definition.id))
      throw new Error('Panel registration is unavailable or duplicated');
    const manager = this;
    const entry: Entry = {
      definition,
      version: 0,
      manualRequested: false,
      activateRequested: false,
      dispose:
        definition.command === false || definition.settings
          ? () => {}
          : this.registry.register({
              id: 'panel:' + definition.id,
              get label() {
                return definition.label?.() ?? manager.entries.get(definition.id)?.panel?.title ?? definition.title;
              },
              group: definition.group,
              keywords: definition.keywords,
              panel: definition.id,
              available: () => !this.stopped && this.available() && (definition.available?.() ?? true),
              run: () => {
                void this.open(definition.id);
              },
            }),
    };
    this.entries.set(definition.id, entry);
    // A saved layout may still dock a panel that now lives in Settings.
    if (definition.settings) this.workbench.releaseAll([definition.id]);
    this.restore();
  }
  setSettingsOpener(open: (target: { page: PageId; section: string }) => void): void {
    this.openSettings = open;
  }
  settingsSections(): CustomSection[] {
    const sections: CustomSection[] = [];
    for (const [id, { definition }] of this.entries) {
      const settings = definition.settings;
      if (!settings) continue;
      sections.push({
        id: 'panel:' + id,
        page: settings.page,
        section: settings.section,
        keywords: settings.keywords,
        visible: () => !this.stopped && this.available() && (definition.available?.() ?? true),
        mount: (host) => this.embed(id, host),
      });
    }
    return sections;
  }
  open(id: string, restoring = false, activate = true): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || this.stopped || !this.available() || entry.definition.available?.() === false)
      return Promise.resolve();
    const settings = entry.definition.settings;
    if (settings) {
      this.openSettings?.({ page: settings.page, section: settings.section });
      return Promise.resolve();
    }
    if (entry.panel) {
      if (activate) entry.panel.open();
      return Promise.resolve();
    }
    if (entry.loading) {
      if (entry.loadingVersion !== entry.version) return entry.loading.then(() => this.open(id, restoring, activate));
      if (!restoring) entry.manualRequested = true;
      if (activate) entry.activateRequested = true;
      return entry.loading;
    }
    const context = this.context(),
      version = entry.version;
    entry.loadingVersion = version;
    entry.activateRequested = activate;
    entry.manualRequested = !restoring;
    entry.loading = Promise.resolve()
      .then(() => entry.definition.load())
      .then((create) => {
        if (
          this.stopped ||
          !this.available() ||
          entry.definition.available?.() === false ||
          this.context() !== context ||
          entry.version !== version ||
          (restoring && !entry.manualRequested && !this.workbench.wantsPanel(id))
        )
          return;
        const panel = create();
        if (panel.id !== id || panel.root.id !== id) {
          panel.stop();
          throw new Error('Panel identity does not match its registration');
        }
        entry.panel = panel;
        this.workbench.adopt(panel.root, () => panel.close());
        if (entry.activateRequested) panel.open();
      })
      .catch(() => {
        if (!this.stopped && this.available() && this.context() === context && entry.version === version)
          this.failure(entry.definition.title);
      })
      .finally(() => {
        entry.loading = undefined;
      });
    return entry.loading;
  }
  // Mount a settings panel inline: never adopted by the workbench and never modal.
  async embed(id: string, host: HTMLElement): Promise<() => void> {
    const entry = this.entries.get(id);
    const usable = () => !!entry && !this.stopped && this.available() && entry.definition.available?.() !== false;
    if (!entry?.definition.settings || !usable()) return () => {};
    if (!entry.panel) {
      entry.loading ??= this.construct(entry);
      await entry.loading;
    }
    const panel = entry.panel;
    if (!panel || !usable()) return () => {};
    entry.detach?.();
    const root = panel.root;
    host.append(root);
    root.dataset.embedded = 'true';
    const request = (event: Event): void => {
      event.preventDefault();
      if (root instanceof HTMLDialogElement) {
        if (!root.open) root.show();
      } else root.hidden = false;
    };
    let attached = true;
    const closed = (): void => {
      queueMicrotask(() => {
        if (attached && root.isConnected && root instanceof HTMLDialogElement && !root.open) root.show();
      });
    };
    root.addEventListener('panel-open-request', request);
    root.addEventListener('close', closed);
    const detach = (): void => {
      attached = false;
      root.removeEventListener('panel-open-request', request);
      root.removeEventListener('close', closed);
      if (entry.detach === detach) entry.detach = undefined;
    };
    entry.detach = detach;
    panel.open();
    return () => {
      // A later embed moved the root; that embedding owns the panel now.
      if (!attached) return;
      detach();
      if (entry.panel === panel) {
        entry.panel = undefined;
        entry.version++;
      }
      panel.stop();
    };
  }
  private construct(entry: Entry): Promise<void> {
    const context = this.context(),
      version = entry.version;
    entry.loadingVersion = version;
    return Promise.resolve()
      .then(() => entry.definition.load())
      .then((create) => {
        if (
          this.stopped ||
          !this.available() ||
          entry.definition.available?.() === false ||
          this.context() !== context ||
          entry.version !== version
        )
          return;
        const panel = create();
        if (panel.id !== entry.definition.id || panel.root.id !== entry.definition.id) {
          panel.stop();
          throw new Error('Panel identity does not match its registration');
        }
        entry.panel = panel;
      })
      .catch(() => {
        if (!this.stopped && this.available() && this.context() === context && entry.version === version)
          this.failure(entry.definition.title);
      })
      .finally(() => {
        entry.loading = undefined;
      });
  }
  async perform(id: string, action: () => void, activate = true): Promise<void> {
    const context = this.context();
    const version = this.entries.get(id)?.version;
    await this.open(id, false, activate);
    const entry = this.entries.get(id);
    if (
      !this.stopped &&
      this.available() &&
      this.context() === context &&
      entry?.panel &&
      entry.version === version &&
      entry.definition.available?.() !== false
    )
      action();
  }
  close(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.version++;
    entry.panel?.close();
  }
  private restore = (): void => {
    for (const [id, entry] of this.entries)
      if (
        entry.definition.restorable !== false &&
        !entry.definition.settings &&
        !entry.panel &&
        !entry.loading &&
        this.workbench.wantsPanel(id)
      )
        void this.open(id, true);
  };
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.unwatch();
    for (const entry of this.entries.values()) {
      entry.dispose();
      entry.detach?.();
      entry.panel?.stop();
    }
    this.entries.clear();
  }
}
