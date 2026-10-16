import { registerSettings, type SettingsPart } from './settings-bundle';
import { profileKey } from './account-profiles';
import { fitBox, type FloatingState } from './floating';
import { parseVideo } from './video-preferences';
import { restorePickerOptions, pickerURL, pickerPresetGeometry, type PickerModel } from './picker-model';
import { resourceURL } from './resource-url';
import { parsePickerGeometry } from './picker-geometry';
export function floatingState(value: unknown): FloatingState | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  if (typeof data.pinned !== 'boolean' || typeof data.open !== 'boolean') return;
  let box;
  if (data.box !== undefined) {
    if (!data.box || typeof data.box !== 'object') return;
    const raw = data.box as Record<string, unknown>;
    if (
      !['left', 'top', 'width', 'height'].every((key) => typeof raw[key] === 'number' && Number.isFinite(raw[key])) ||
      Number(raw.width) <= 0 ||
      Number(raw.height) <= 0 ||
      Number(raw.width) > 10000 ||
      Number(raw.height) > 10000
    )
      return;
    box = fitBox(
      { left: Number(raw.left), top: Number(raw.top), width: Number(raw.width), height: Number(raw.height) },
      innerWidth,
      innerHeight,
    );
  }
  return { ...(box ? { box } : {}), pinned: data.pinned, open: data.open };
}
function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(profileKey(key)) ?? 'null');
  } catch {
    return null;
  }
}
function geometry(part: string): FloatingState {
  const raw = read('chatthing:v1:' + part + ':geometry');
  if (!raw || typeof raw !== 'object') return { pinned: false, open: false };
  const value = raw as Record<string, unknown>;
  return (
    floatingState({
      pinned: value.pinned === true,
      open: value.pinned === true && value.open === true,
      ...(typeof value.width === 'number' ? { box: value } : {}),
    }) ?? { pinned: false, open: false }
  );
}
function saveGeometry(part: string, value: FloatingState): void {
  localStorage.setItem(
    profileKey('chatthing:v1:' + part + ':geometry'),
    JSON.stringify({ ...value.box, pinned: value.pinned, open: value.open }),
  );
}
export class PassivePanelSettings {
  private stops = new Map<SettingsPart, () => void>();
  private pending = new Map<SettingsPart, unknown>();
  private wanted = new Set<string>();
  private snapshot = new Map<SettingsPart, () => unknown>();
  private restorers = new Map<SettingsPart, (value: unknown) => unknown>();
  constructor(
    private picker: PickerModel,
    private channels: readonly string[],
    private channel: () => string,
    private open: (id: string) => boolean,
  ) {
    this.add(
      'picker',
      () => ({ options: picker.options, floating: geometry('picker') }),
      (value) => {
        const data = value as Record<string, unknown>,
          floating = floatingState(data?.floating);
        if (!floating || !data.options || typeof data.options !== 'object') throw new Error('Invalid picker settings');
        picker.options = restorePickerOptions(picker.options, data.options);
        picker.save(this.channel());
        saveGeometry('picker', floating);
        if (floating.open) this.wanted.add('emote-picker');
        else this.wanted.delete('emote-picker');
        return { options: picker.options, floating };
      },
    );
    this.add(
      'video',
      () => ({ options: parseVideo(read('chatthing:v1:video'), channels), floating: geometry('video') }),
      (value) => {
        const data = value as Record<string, unknown>,
          floating = floatingState(data?.floating);
        if (!floating || !data.options || typeof data.options !== 'object') throw new Error('Invalid video settings');
        const options = parseVideo(data.options, channels);
        localStorage.setItem(profileKey('chatthing:v1:video'), JSON.stringify(options));
        saveGeometry('video', floating);
        if (floating.open) this.wanted.add('video-panel');
        else this.wanted.delete('video-panel');
        return { options, floating };
      },
    );
    this.add(
      'stats',
      () => this.stats(read('chatthing:v1:stats')),
      (value) => {
        const data = this.stats(value);
        localStorage.setItem(profileKey('chatthing:v1:stats'), JSON.stringify(data));
        if (data.open) this.wanted.add('stats-panel');
        else this.wanted.delete('stats-panel');
        return data;
      },
    );
    this.add(
      'resources',
      () => ({
        tab: localStorage.getItem(profileKey('chatthing:v1:resources:tab')) ?? 'help',
        authors: { info: 0, sort: 'area' },
        floating: geometry('resources'),
      }),
      (value) => {
        const data = value as Record<string, unknown>,
          floating = floatingState(data?.floating);
        if (
          !floating ||
          typeof data.tab !== 'string' ||
          !['help', 'htabRes', 'htabLib', 'htabLbr', 'htabAuth'].includes(data.tab)
        )
          throw new Error('Invalid resource settings');
        const authors =
          data.authors && typeof data.authors === 'object' ? (data.authors as Record<string, unknown>) : {};
        const safe = {
          tab: data.tab,
          authors: {
            info: [0, 1, 2, 3].includes(Number(authors.info)) ? Number(authors.info) : 0,
            sort: ['area', 'birth', 'activity'].includes(String(authors.sort)) ? String(authors.sort) : 'area',
          },
          floating,
        };
        localStorage.setItem(profileKey('chatthing:v1:resources:tab'), safe.tab);
        saveGeometry('resources', floating);
        if (floating.open) this.wanted.add('resources-panel');
        else this.wanted.delete('resources-panel');
        return safe;
      },
    );
    document.addEventListener('share-settings', this.share);
  }
  private stats(value: unknown) {
    const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const raw = data.windows && typeof data.windows === 'object' ? (data.windows as Record<string, unknown>) : {};
    const defaults = { users: '24', emotes: '3', badges: '3', links: '3' };
    return {
      open: data.open === true,
      badgeOrder: data.badgeOrder === 'name' ? 'name' : 'versions',
      scope: ['60000', '300000', '1800000', '3600000', '86400000'].includes(String(data.scope))
        ? String(data.scope)
        : '60000',
      channel: typeof data.channel === 'string' && this.channels.includes(data.channel) ? data.channel : '',
      excluded: typeof data.excluded === 'string' ? data.excluded.slice(0, 500) : '',
      windows: Object.fromEntries(
        Object.entries(defaults).map(([key, fallback]) => [
          key,
          ['0', '24', '12', '6', '3', '1', ...(key === 'emotes' ? ['se'] : [])].includes(String(raw[key]))
            ? String(raw[key])
            : fallback,
        ]),
      ),
    };
  }
  private add(part: SettingsPart, capture: () => unknown, restore: (value: unknown) => unknown): void {
    this.snapshot.set(part, capture);
    this.restorers.set(part, restore);
    this.register(part);
  }
  private register(part: SettingsPart): void {
    this.stops.set(
      part,
      registerSettings(
        part,
        () => this.pending.get(part) ?? this.snapshot.get(part)!(),
        (value) => {
          try {
            this.pending.set(part, this.restorers.get(part)!(value));
            this.restoreOpenPanels();
          } catch {
            /* Invalid optional panel settings leave existing settings in place. */
          }
        },
      ),
    );
  }
  handoff<T>(part: SettingsPart, create: () => T): T {
    this.stops.get(part)?.();
    this.stops.delete(part);
    try {
      const view = create();
      if (this.pending.has(part))
        document.dispatchEvent(new CustomEvent('restore-settings', { detail: { [part]: this.pending.get(part) } }));
      this.pending.delete(part);
      return view;
    } catch (error) {
      this.register(part);
      throw error;
    }
  }
  restoreOpenPanels(): void {
    for (const id of [...this.wanted]) if (this.open(id)) this.wanted.delete(id);
  }
  startup(): void {
    const query = new URL(location.href).searchParams;
    for (const [part, id] of [
      ['picker', 'emote-picker'],
      ['video', 'video-panel'],
      ['resources', 'resources-panel'],
    ] as const)
      if (geometry(part).open) this.wanted.add(id);
    if (query.has('epopen')) {
      if (query.get('epopen') !== '0') this.wanted.add('emote-picker');
      else this.wanted.delete('emote-picker');
    }
    if (query.has('video')) {
      if (!['off', '0'].includes(query.get('video')!)) this.wanted.add('video-panel');
      else this.wanted.delete('video-panel');
    }
    const resources = resourceURL(query);
    if (resources.open === true) this.wanted.add('resources-panel');
    if (resources.open === false) this.wanted.delete('resources-panel');
    const rawGeo = query.get('epgeo') ?? pickerPresetGeometry(query.get('theme') ?? '');
    if (rawGeo) {
      const box = parsePickerGeometry(rawGeo);
      if (box)
        saveGeometry('picker', {
          box,
          pinned: rawGeo.includes(','),
          open: this.wanted.has('emote-picker'),
        });
    }
    this.restoreOpenPanels();
  }
  private share = (event: Event): void => {
    if (!(event instanceof CustomEvent) || !(event.detail instanceof URL)) return;
    // Once constructed, each view adds its live geometry to the same URL.
    if (this.stops.has('picker')) {
      pickerURL(this.picker.options, event.detail);
      const state = geometry('picker');
      event.detail.searchParams.set('epopen', state.open ? '1' : '0');
      if (state.box)
        event.detail.searchParams.set(
          'epgeo',
          Math.round(state.box.width) +
            'x' +
            Math.round(state.box.height) +
            (state.pinned ? ',' + Math.round(state.box.left) + ',' + Math.round(state.box.top) : ''),
        );
    }
    if (this.stops.has('resources')) {
      const state = geometry('resources');
      const tab = localStorage.getItem(profileKey('chatthing:v1:resources:tab')) ?? 'help';
      event.detail.searchParams.set('help', state.open ? 'panel' : 'off');
      event.detail.searchParams.set(
        'htab',
        (
          { help: 'help', htabRes: 'media', htabLib: 'left', htabLbr: 'libre', htabAuth: 'authors' } as Record<
            string,
            string
          >
        )[tab] ?? 'help',
      );
      if (state.box)
        event.detail.searchParams.set('hpw', String(Math.max(480, Math.min(1600, Math.round(state.box.width)))));
    }
  };
  stop(): void {
    for (const stop of this.stops.values()) stop();
    this.stops.clear();
    document.removeEventListener('share-settings', this.share);
  }
}
