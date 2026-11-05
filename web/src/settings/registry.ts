export type PageId =
  | 'general'
  | 'accounts'
  | 'commands'
  | 'highlights'
  | 'ignores'
  | 'hotkeys'
  | 'moderation'
  | 'notifications'
  | 'integrations'
  | 'privacy'
  | 'about';

export interface PageDef {
  id: PageId;
  title: string;
  sections: readonly string[];
}

export const PAGES: readonly PageDef[] = [
  {
    id: 'general',
    title: 'General',
    sections: [
      'Appearance',
      'Custom themes',
      'Font',
      'Messages',
      'Emotes',
      'Links and cards',
      'Scrolling',
      'Composer',
      'Layout',
      'Motion',
      'Saved settings',
      'Overlay',
    ],
  },
  { id: 'accounts', title: 'Accounts', sections: ['Accounts', 'Own message feedback'] },
  { id: 'commands', title: 'Commands', sections: ['Custom commands', 'Completion'] },
  { id: 'highlights', title: 'Highlights', sections: ['Highlights', 'Message rules'] },
  { id: 'ignores', title: 'Ignores', sections: ['Ignores'] },
  { id: 'hotkeys', title: 'Hotkeys', sections: ['Shortcuts', 'Mouse'] },
  { id: 'moderation', title: 'Moderation', sections: ['Moderation'] },
  { id: 'notifications', title: 'Notifications', sections: ['Desktop alerts', 'Muted channels'] },
  {
    id: 'integrations',
    title: 'Integrations',
    sections: [
      'Providers and badges',
      'Web extensions',
      'Browser companion',
      'Desktop playback',
      'Device sync',
      'Chatterino import',
    ],
  },
  { id: 'privacy', title: 'Privacy', sections: ['Visible workspaces'] },
  { id: 'about', title: 'About', sections: ['About', 'Local command help', 'Resource readout'] },
];

export type Control =
  | { kind: 'toggle' }
  | {
      kind: 'choice';
      options: readonly { value: string | number; label: string }[];
      /** First option, value '', shown while the stored value is empty; choosing it saves nothing. */
      placeholder?: string;
    }
  | { kind: 'number'; min: number; max: number; step: number; unit?: string }
  | { kind: 'text'; placeholder?: string; maxLength?: number; multiline?: boolean }
  | { kind: 'color' };

export interface SettingDef {
  id: string;
  page: PageId;
  section: string;
  label: string;
  hint?: string;
  keywords?: string;
  control: Control;
  read(): unknown;
  write(value: unknown): void;
  defaultValue(): unknown;
  visible?(): boolean;
  /** Hidden while privacy mode is on. */
  private?: boolean;
}

export interface CustomSection {
  id: string;
  page: PageId;
  section: string;
  keywords: string;
  mount(host: HTMLElement): Promise<() => void>;
  /** Called when the window puts an already mounted host back on screen. */
  attached?(): void;
  visible?(): boolean;
  private?: boolean;
}

export type Entry = { type: 'setting'; def: SettingDef } | { type: 'custom'; def: CustomSection };

interface Group {
  page: PageId;
  section: string;
  entries: Entry[];
}

export class SettingsRegistry extends EventTarget {
  private readonly entries = new Map<string, Entry>();
  private readonly privacy: () => boolean;

  constructor(privacy: () => boolean) {
    super();
    this.privacy = privacy;
  }

  add(defs: readonly (SettingDef | CustomSection)[]): void {
    for (const def of defs) {
      if (this.entries.has(def.id)) throw new Error(`Duplicate setting id: ${def.id}`);
      const page = PAGES.find((p) => p.id === def.page);
      if (!page) throw new Error(`Unknown settings page: ${def.page}`);
      if (!page.sections.includes(def.section)) {
        throw new Error(`Unknown section "${def.section}" on page ${def.page}`);
      }
      this.entries.set(def.id, 'control' in def ? { type: 'setting', def } : { type: 'custom', def });
    }
  }

  get(id: string): Entry | undefined {
    return this.entries.get(id);
  }

  notify(): void {
    this.dispatchEvent(new Event('change'));
  }

  page(id: PageId): { section: string; entries: Entry[] }[] {
    return this.collect([id]).map(({ section, entries }) => ({ section, entries }));
  }

  search(text: string): { page: PageId; section: string; entries: Entry[] }[] {
    const needle = text.trim().toLowerCase();
    if (!needle) return [];
    return this.collect(
      PAGES.map((p) => p.id),
      needle,
    );
  }

  private shown(entry: Entry): boolean {
    if (entry.def.private && this.privacy()) return false;
    return entry.def.visible ? entry.def.visible() : true;
  }

  private matches(entry: Entry, needle: string): boolean {
    const d = entry.def;
    const parts =
      entry.type === 'setting'
        ? [entry.def.label, entry.def.hint, entry.def.keywords, d.section]
        : [entry.def.keywords, d.section];
    return parts.filter(Boolean).join(' ').toLowerCase().includes(needle);
  }

  private collect(pages: readonly PageId[], needle?: string): Group[] {
    const out: Group[] = [];
    for (const pageId of pages) {
      const page = PAGES.find((p) => p.id === pageId);
      if (!page) continue;
      for (const section of page.sections) {
        const entries = [...this.entries.values()].filter(
          (e) =>
            e.def.page === pageId &&
            e.def.section === section &&
            this.shown(e) &&
            (needle === undefined || this.matches(e, needle)),
        );
        if (entries.length) out.push({ page: pageId, section, entries });
      }
    }
    return out;
  }
}
