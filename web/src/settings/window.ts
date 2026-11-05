import { settingHelp } from './help';
import './settings.css';
import { PAGES, type CustomSection, type PageId, type SettingDef, type SettingsRegistry } from './registry';

interface Group {
  page?: PageId | undefined;
  section: string;
  entries: ReturnType<SettingsRegistry['page']>[number]['entries'];
}

interface Mounted {
  host: HTMLElement;
  dispose?: (() => void) | undefined;
  stopped: boolean;
}

let nextId = 0;

export class SettingsWindow {
  readonly root: HTMLDialogElement;
  private readonly registry: SettingsRegistry;
  private readonly nav: HTMLElement;
  private readonly search: HTMLInputElement;
  private readonly content: HTMLElement;
  private readonly navButtons = new Map<PageId, HTMLButtonElement>();
  private readonly controls = new Map<string, { def: SettingDef; el: HTMLElement; error: HTMLElement }>();
  private readonly mounted = new Map<string, Mounted>();
  // Mounted sections put back on screen by the current render.
  private reattached: CustomSection[] = [];
  private readonly storageAvailable: boolean;
  private page: PageId = 'general';
  private signature = '';
  private openedSections = new Map<string, boolean>();
  private sectionNav: HTMLElement | undefined;
  private readonly onChange = () => this.onRegistryChange();

  constructor(registry: SettingsRegistry, options: { storageAvailable: boolean }) {
    this.registry = registry;
    this.storageAvailable = options.storageAvailable;
    const root = document.createElement('dialog');
    root.id = 'settings-window';
    root.className = 'settings-window';
    root.setAttribute('aria-label', 'Settings');
    // Chrome does not always deliver Escape to this dialog's close watcher while
    // embedded panels are open inside it, so close explicitly. Embedded controls
    // that handle Escape themselves call preventDefault and keep the window open.
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      this.close();
    });

    this.nav = document.createElement('nav');
    this.nav.className = 'settings-nav';
    this.nav.setAttribute('aria-label', 'Settings pages');
    this.search = document.createElement('input');
    this.search.type = 'search';
    this.search.placeholder = 'Search settings';
    this.search.setAttribute('aria-label', 'Search settings');
    this.search.addEventListener('input', () => this.render());
    this.nav.append(this.search);
    for (const p of PAGES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.page = p.id;
      b.textContent = p.title;
      b.addEventListener('click', () => {
        this.search.value = '';
        this.page = p.id;
        this.render();
      });
      this.navButtons.set(p.id, b);
      this.nav.append(b);
    }

    const main = document.createElement('div');
    main.className = 'settings-main';
    // Not a <header>: the shell hides every header element.
    const head = document.createElement('div');
    head.className = 'settings-head';
    const title = document.createElement('span');
    title.textContent = 'Settings';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'settings-close';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.close());
    head.append(title, close);
    this.content = document.createElement('section');
    this.content.className = 'settings-page';
    main.append(head, this.content);

    root.append(this.nav, main);
    document.body.append(root);
    this.root = root;
    registry.addEventListener('change', this.onChange);
  }

  open(target: { page?: PageId; setting?: string; section?: string } = {}): void {
    let page = target.page;
    if (target.setting) {
      const entry = this.registry.get(target.setting);
      if (entry) page = entry.def.page;
    }
    if (page) {
      this.page = page;
      this.search.value = '';
    }
    if (!this.root.open) {
      document.dispatchEvent(new Event('settings-opened'));
      this.root.showModal();
    }
    this.render();
    if (target.setting) {
      const c = this.controls.get(target.setting);
      const row = c?.el.closest<HTMLElement>('.settings-row');
      if (row) this.reveal(row, 'center');
      c?.el.focus({ preventScroll: true });
    } else if (target.section) {
      const sec = [...this.content.querySelectorAll<HTMLElement>('.settings-section')].find(
        (s) => s.dataset.section === target.section,
      );
      if (sec) this.reveal(sec, 'start');
    }
  }

  /** Scrolls only the page pane; scrollIntoView would also move the dialog and the document behind it. */
  private reveal(el: HTMLElement, block: 'center' | 'start'): void {
    const details = el.closest<HTMLDetailsElement>('details.settings-section');
    if (details) details.open = true;
    const box = this.content;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTop = Math.max(
      0,
      block === 'start' ? top : top - (box.clientHeight - el.getBoundingClientRect().height) / 2,
    );
  }

  close(): void {
    if (this.root.open) this.root.close();
  }

  stop(): void {
    this.registry.removeEventListener('change', this.onChange);
    for (const m of this.mounted.values()) this.disposeMount(m);
    this.mounted.clear();
    this.close();
    this.root.remove();
  }

  private groups(): Group[] {
    const text = this.search.value;
    if (text.trim()) return this.registry.search(text);
    return this.registry.page(this.page).map((g) => ({ ...g, page: undefined }));
  }

  private sig(groups: Group[]): string {
    return (
      this.search.value.trim() +
      '|' +
      this.page +
      '|' +
      groups.map((g) => `${g.page ?? ''}/${g.section}:${g.entries.map((e) => e.def.id).join(',')}`).join(';')
    );
  }

  private onRegistryChange(): void {
    const groups = this.groups();
    if (this.sig(groups) !== this.signature) this.render();
    else this.refreshValues();
  }

  private render(): void {
    const searching = this.search.value.trim() !== '';
    for (const [id, b] of this.navButtons) {
      if (!searching && id === this.page) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    const groups = this.groups();
    this.sectionNav?.remove();
    this.sectionNav = document.createElement('div');
    this.sectionNav.className = 'settings-subnav';
    this.sectionNav.setAttribute('aria-label', 'Settings subsections');
    if (!searching) {
      for (const group of groups) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = group.section;
        button.addEventListener('click', () => {
          const section = [...this.content.querySelectorAll<HTMLElement>('.settings-section')].find(
            (el) => el.dataset.section === group.section,
          );
          if (section) this.reveal(section, 'start');
        });
        this.sectionNav.append(button);
      }
      this.navButtons.get(this.page)?.after(this.sectionNav);
    }
    this.signature = this.sig(groups);
    this.controls.clear();
    for (const m of this.mounted.values()) m.host.remove();
    this.content.replaceChildren();

    if (!this.storageAvailable) {
      const n = document.createElement('p');
      n.className = 'settings-notice';
      n.textContent = "Changes won't be saved in this browser";
      this.content.append(n);
    }
    if (groups.length === 0) {
      const p = document.createElement('p');
      p.className = 'settings-empty';
      p.textContent = searching ? 'No settings match' : 'Nothing to show on this page';
      this.content.append(p);
      return;
    }
    let lastPage: PageId | undefined;
    this.reattached = [];
    for (const g of groups) {
      if (searching && g.page !== lastPage) {
        lastPage = g.page;
        const h = document.createElement('h2');
        h.textContent = PAGES.find((p) => p.id === g.page)?.title ?? '';
        this.content.append(h);
      }
      this.content.append(this.renderSection(g, searching));
    }
    if (!this.root.open) return;
    for (const def of this.reattached.splice(0)) {
      try {
        def.attached?.();
      } catch {
        // One section's failure must not block the others.
      }
    }
  }

  private renderSection(g: Group, searching = false): HTMLElement {
    const sec = document.createElement('details');
    sec.className = 'settings-section';
    const sectionKey = this.page + ':' + g.section;
    sec.open = searching || (this.openedSections.get(sectionKey) ?? g.section === this.groups()[0]?.section);
    sec.addEventListener('toggle', () => {
      this.openedSections.set(sectionKey, sec.open);
    });
    sec.dataset.section = g.section;
    const h = document.createElement('h3');
    h.textContent = g.section;
    const summary = document.createElement('summary');
    summary.append(h);
    sec.append(summary);
    const defs: SettingDef[] = [];
    for (const e of g.entries) {
      if (e.type === 'setting') {
        defs.push(e.def);
        sec.append(this.renderRow(e.def));
      } else {
        sec.append(this.customHost(e.def));
      }
    }
    if (defs.length) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'settings-reset';
      // Search shows only the matching rows, and only those are reset.
      reset.textContent = searching ? 'Reset shown' : 'Reset section';
      reset.addEventListener('click', () => {
        for (const d of defs) this.commit(d, d.defaultValue());
        this.refreshValues(true);
      });
      sec.append(reset);
    }
    return sec;
  }

  private renderRow(def: SettingDef): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.dataset.setting = def.id;
    const id = `settings-c-${nextId++}`;
    const text = document.createElement('div');
    text.className = 'settings-text';
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = def.label;
    const explanation = settingHelp(def);
    const help = document.createElement('button');
    help.type = 'button';
    help.className = 'settings-help';
    help.textContent = '?';
    help.setAttribute('aria-label', 'About ' + def.label);
    help.dataset.tooltip = explanation;
    help.title = explanation;
    text.append(label, help);
    if (def.hint) {
      const hint = document.createElement('p');
      hint.className = 'settings-hint';
      hint.textContent = def.hint;
      text.append(hint);
    }
    const error = document.createElement('p');
    error.className = 'settings-error';
    text.append(error);

    const c = def.control;
    let el: HTMLElement;
    if (c.kind === 'choice') {
      const s = document.createElement('select');
      if (c.placeholder) {
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = c.placeholder;
        s.append(empty);
      }
      for (const o of c.options) {
        const opt = document.createElement('option');
        opt.value = String(o.value);
        opt.textContent = o.label;
        s.append(opt);
      }
      s.addEventListener('change', () => {
        if (c.placeholder && s.value === '') return;
        const hit = c.options.find((o) => String(o.value) === s.value);
        this.commit(def, hit ? hit.value : s.value);
      });
      el = s;
    } else if (c.kind === 'text' && c.multiline) {
      const t = document.createElement('textarea');
      if (c.placeholder) t.placeholder = c.placeholder;
      if (c.maxLength) t.maxLength = c.maxLength;
      t.addEventListener('change', () => this.commit(def, t.value));
      el = t;
    } else {
      const i = document.createElement('input');
      if (c.kind === 'toggle') {
        i.type = 'checkbox';
        i.addEventListener('change', () => this.commit(def, i.checked));
      } else if (c.kind === 'number') {
        i.type = 'number';
        i.min = String(c.min);
        i.max = String(c.max);
        i.step = String(c.step);
        i.addEventListener('change', () => this.commit(def, i.value.trim() === '' ? NaN : Number(i.value)));
      } else if (c.kind === 'color') {
        i.type = 'color';
        i.addEventListener('change', () => this.commit(def, i.value));
      } else {
        i.type = 'text';
        if (c.placeholder) i.placeholder = c.placeholder;
        if (c.maxLength) i.maxLength = c.maxLength;
        i.addEventListener('change', () => this.commit(def, i.value));
      }
      el = i;
    }
    el.id = id;
    el.dataset.tooltip = explanation;
    const field = document.createElement('div');
    field.className = 'settings-field';
    field.append(el);
    if (c.kind === 'number' && c.unit) {
      const u = document.createElement('span');
      u.className = 'settings-unit';
      u.textContent = c.unit;
      field.append(u);
    }
    row.append(text, field);
    this.controls.set(def.id, { def, el, error });
    this.setValue(def, el, def.read());
    return row;
  }

  private setValue(def: SettingDef, el: HTMLElement, value: unknown): void {
    const k = def.control.kind;
    if (k === 'toggle') (el as HTMLInputElement).checked = Boolean(value);
    else (el as HTMLInputElement).value = value == null ? '' : String(value);
  }

  private same(def: SettingDef, entered: unknown, stored: unknown): boolean {
    const k = def.control.kind;
    if (k === 'number') return Number(entered) === Number(stored);
    if (k === 'toggle') return Boolean(entered) === Boolean(stored);
    if (k === 'color') return String(entered).toLowerCase() === String(stored).toLowerCase();
    return String(entered) === String(stored ?? '');
  }

  private commit(def: SettingDef, value: unknown): void {
    const c = this.controls.get(def.id);
    try {
      if (typeof value === 'number' && Number.isNaN(value)) throw new Error('Enter a number');
      def.write(value);
    } catch (err) {
      if (c) {
        this.setValue(def, c.el, def.read());
        c.error.textContent = err instanceof Error ? err.message : String(err);
      }
      return;
    }
    if (!c) return;
    const stored = def.read();
    this.setValue(def, c.el, stored);
    c.error.textContent = this.same(def, value, stored) ? '' : 'Adjusted to the allowed value';
  }

  private refreshValues(keepErrors = false): void {
    for (const { def, el, error } of this.controls.values()) {
      if (document.activeElement === el && !keepErrors) continue;
      this.setValue(def, el, def.read());
      if (!keepErrors) error.textContent = '';
    }
  }

  private customHost(def: CustomSection): HTMLElement {
    let m = this.mounted.get(def.id);
    if (!m) {
      const host = document.createElement('div');
      host.className = 'settings-custom';
      host.dataset.custom = def.id;
      m = { host, stopped: false };
      this.mounted.set(def.id, m);
      this.startMount(def, m);
    } else if (m.dispose) this.reattached.push(def);
    return m.host;
  }

  private startMount(def: CustomSection, m: Mounted): void {
    m.host.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'settings-loading';
    loading.textContent = 'Loading…';
    m.host.append(loading);
    // Mount into a scratch element so a failure leaves no partial content behind.
    const target = document.createElement('div');
    target.className = 'settings-custom-body';
    def.mount(target).then(
      (dispose) => {
        if (m.stopped) {
          dispose();
          return;
        }
        m.dispose = dispose;
        m.host.replaceChildren(target);
      },
      () => {
        if (m.stopped) return;
        const p = document.createElement('p');
        p.className = 'settings-error';
        p.textContent = "Couldn't load";
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'Retry';
        retry.addEventListener('click', () => this.startMount(def, m));
        m.host.replaceChildren(p, retry);
      },
    );
  }

  private disposeMount(m: Mounted): void {
    m.stopped = true;
    try {
      m.dispose?.();
    } catch {
      // A failing disposer must not block the others.
    }
    m.dispose = undefined;
  }
}
