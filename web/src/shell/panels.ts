import type { CommandGroup, CommandRegistry } from './registry';

export interface Panel {
  readonly id: string;
  readonly title: string;
  readonly group: CommandGroup;
  readonly root: HTMLElement;
  open(): void;
  close(): void;
  stop(): void;
}
interface PanelDefinition {
  id: string;
  title: string;
  group: CommandGroup;
  keywords?: string;
  // Import first; construct only after checking the current view/account again.
  load: () => Promise<() => Panel>;
}
export interface PanelWorkbench {
  adopt(root: HTMLElement): void;
  wantsPanel(id: string): boolean;
  onLayoutChange(listener: () => void): () => void;
}
interface Entry {
  definition: PanelDefinition;
  dispose: () => void;
  panel?: Panel;
  loading?: Promise<void> | undefined;
  loadingVersion?: number;
  manualRequested: boolean;
  version: number;
}

// The legacy header/observer path remains for unmigrated panels. Explicit panels
// register commands without constructing DOM or importing their feature module.
export class LazyPanels {
  private entries = new Map<string, Entry>();
  private stopped = false;
  private unwatch: () => void;
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
    const entry: Entry = {
      definition,
      version: 0,
      manualRequested: false,
      dispose: this.registry.register({
        id: 'panel:' + definition.id,
        label: definition.title,
        group: definition.group,
        keywords: definition.keywords,
        panel: definition.id,
        available: () => !this.stopped && this.available(),
        run: () => {
          void this.open(definition.id);
        },
      }),
    };
    this.entries.set(definition.id, entry);
    this.restore();
  }
  open(id: string, restoring = false): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || this.stopped || !this.available()) return Promise.resolve();
    if (entry.panel) {
      entry.panel.open();
      return Promise.resolve();
    }
    if (entry.loading) {
      if (entry.loadingVersion !== entry.version) return entry.loading.then(() => this.open(id, restoring));
      if (!restoring) entry.manualRequested = true;
      return entry.loading;
    }
    const context = this.context(),
      version = entry.version;
    entry.loadingVersion = version;
    entry.manualRequested = !restoring;
    entry.loading = Promise.resolve()
      .then(() => entry.definition.load())
      .then((create) => {
        if (
          this.stopped ||
          !this.available() ||
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
        this.workbench.adopt(panel.root);
        panel.open();
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
  close(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.version++;
    entry.panel?.close();
  }
  private restore = (): void => {
    for (const [id, entry] of this.entries)
      if (!entry.panel && !entry.loading && this.workbench.wantsPanel(id)) void this.open(id, true);
  };
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.unwatch();
    for (const entry of this.entries.values()) {
      entry.dispose();
      entry.panel?.stop();
    }
    this.entries.clear();
  }
}
