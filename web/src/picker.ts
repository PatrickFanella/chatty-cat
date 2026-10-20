import { parsePickerGeometry } from './picker-geometry';
import { measureResourceWork } from './resource-timers';
export { parsePickerGeometry } from './picker-geometry';
import { clockTask, stopClockTask } from './shell/clock';
import { EMOJI_GROUPS, EMOJI_VERSION, emojiNode, loadEmojiCatalog, emojiCatalogLoaded } from './emoji';
import { profileKey } from './account-profiles';
import { registerSettings } from './settings-bundle';
import { AGE_SECONDS, ageLabel, crossedAges, missedAge } from './picker-order';
import { FloatingPanel } from './floating';
import { PickerMotion } from './picker-motion';
import {
  configureEmoteAnimation,
  fallbackEmoteAnimation,
  freezeEmoteAnimation,
  pauseEmoteAnimations,
} from './emote-animation';
import {
  PickerModel,
  pickerURL,
  pickerPreset,
  pickerPresetGeometry,
  parseOptions,
  restorePickerOptions,
  SOURCES,
  type PickerItem,
} from './picker-model';

function get<T extends HTMLElement>(root: HTMLElement, id: string, ctor: new () => T): T {
  const node = root.querySelector('#' + id);
  if (!(node instanceof ctor)) throw new Error('Missing picker control: ' + id);
  return node;
}
export class EmotePicker {
  private bundleDispose: () => void;
  private readonly search: HTMLInputElement;
  private readonly grid: HTMLElement;
  private readonly recent: HTMLElement;
  private readonly count: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly more: HTMLButtonElement;
  private readonly settings: HTMLElement;
  private held = false;
  private gridHeld = false;
  private borrowed = false;
  private ageObserver: ResizeObserver;
  private dirty = false;
  private page = 200;
  private readonly motion = new PickerMotion();
  private nextAgeRefresh = Infinity;
  private timer: ReturnType<typeof clockTask> | undefined;
  private readonly floating: FloatingPanel;
  private stopped = false;
  private emojiPending = false;
  private emojiFailed = false;
  private emojiStatus = document.createElement('p');
  private emojiRetry = document.createElement('button');
  private visibility = (): void => pauseEmoteAnimations(this.root, document.hidden || this.root.hidden);
  constructor(
    private readonly root: HTMLElement,
    private readonly trigger: HTMLButtonElement,
    private readonly model: PickerModel,
    private readonly channel: () => string,
    private readonly canInsert: () => boolean,
    private readonly insert: (code: string) => void,
    private readonly temporaryFreeze: (on: boolean) => void = () => {},
    private readonly observationGaps: () => readonly { from: number; to: number }[] = () => [],
  ) {
    this.search = get(root, 'picker-search', HTMLInputElement);
    this.grid = get(root, 'picker-grid', HTMLElement);
    this.ageObserver = new ResizeObserver(() => this.paintAgeRows());
    this.ageObserver.observe(this.grid);
    this.recent = get(root, 'picker-recent', HTMLElement);
    this.count = get(root, 'picker-count', HTMLElement);
    this.tabs = get(root, 'picker-tabs', HTMLElement);
    this.more = get(root, 'picker-more', HTMLButtonElement);
    this.settings = get(root, 'picker-settings', HTMLElement);
    for (const [key, label, values] of [
      [
        'emojiStyle',
        'Emoji style',
        [
          ['native', 'Native font'],
          ['image', 'Local Twemoji images'],
          ['labels', 'Text labels'],
        ],
      ],
      ['emojiCategory', 'Emoji category', [['all', 'All categories'], ...EMOJI_GROUPS.map((group) => [group, group])]],
      [
        'emojiTone',
        'Emoji skin tone',
        [
          ['all', 'All tones'],
          ['none', 'No modifier'],
          ['1f3fb', 'Light'],
          ['1f3fc', 'Medium-light'],
          ['1f3fd', 'Medium'],
          ['1f3fe', 'Medium-dark'],
          ['1f3ff', 'Dark'],
          ['mixed', 'Mixed tones'],
        ],
      ],
    ] as const) {
      const field = document.createElement('label'),
        select = document.createElement('select');
      field.textContent = label;
      select.id = 'picker-' + key;
      select.setAttribute('aria-label', label);
      for (const [value, name] of values) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = name ?? value;
        select.append(option);
      }
      select.value = model.options[key];
      field.append(select);
      this.settings.append(field);
    }
    const emojiNote = document.createElement('p');
    emojiNote.textContent =
      'Unicode Emoji ' +
      EMOJI_VERSION +
      '. Native glyphs depend on your fonts; images and text labels provide alternatives. Choose a category or search to narrow large lists.';
    const credit = document.createElement('a');
    credit.href = '/emoji/twemoji-17.0.3/LICENSE-GRAPHICS.txt';
    credit.target = '_blank';
    credit.rel = 'noopener noreferrer';
    credit.textContent = 'Twemoji graphics by Twitter and contributors · CC BY 4.0';
    emojiNote.append(' ', credit);
    this.settings.append(emojiNote);
    this.emojiStatus.setAttribute('role', 'status');
    this.emojiRetry.type = 'button';
    this.emojiRetry.textContent = 'Retry emoji data';
    this.emojiRetry.hidden = true;
    this.emojiRetry.addEventListener('click', () => {
      this.emojiFailed = false;
      this.refresh(true);
    });
    this.settings.append(this.emojiStatus, this.emojiRetry);

    for (const source of SOURCES) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = source;
      checkbox.checked = model.options.enabled.includes(source);
      label.append(checkbox, source);
      this.tabs.append(label);
    }
    get(root, 'picker-sort', HTMLSelectElement).value = model.options.sort;
    get(root, 'picker-animation', HTMLSelectElement).value = model.options.animation;
    get(root, 'picker-zoom', HTMLSelectElement).value = String(model.options.zoom);
    get(root, 'picker-ageRows', HTMLSelectElement).value = String(model.options.ageRows);
    for (const key of ['mixed', 'names', 'hold', 'holdPlus', 'frozen', 'seenOnly', 'ages'] as const)
      get(root, 'picker-' + key, HTMLInputElement).checked = model.options[key];
    this.grid.addEventListener('pointerenter', this.gridEnter);
    this.grid.addEventListener('pointerleave', this.gridLeave);
    trigger.addEventListener('click', this.toggle);
    root.addEventListener('click', this.click);
    document.addEventListener('displaypreset', this.preset);
    document.addEventListener('keydown', this.key, true);
    document.addEventListener('visibilitychange', this.visibility);
    root.addEventListener('pointerenter', this.enter);
    root.addEventListener('pointerleave', this.leave);
    get(root, 'picker-reset-order', HTMLButtonElement).addEventListener('click', this.resetOrder);
    get(root, 'picker-sort', HTMLSelectElement).addEventListener('auxclick', this.resetMiddle);
    this.tabs.addEventListener('change', this.change);
    this.settings.addEventListener('change', this.change);
    this.search.addEventListener('input', this.searchChange);
    this.search.addEventListener('keydown', this.searchKey);
    this.more.addEventListener('click', this.showMore);
    this.floating = new FloatingPanel(
      root,
      get(root, 'picker-handle', HTMLElement),
      get(root, 'picker-pin', HTMLButtonElement),
      profileKey('chatthing:v1:picker:geometry'),
    );
    const query = new URL(location.href).searchParams;
    const presetGeo = pickerPresetGeometry(query.get('theme') ?? '');
    const rawGeo = query.get('epgeo') ?? presetGeo ?? null;
    const geometry = parsePickerGeometry(rawGeo);
    if (geometry) this.floating.configure(geometry, rawGeo?.includes(',') ?? false);
    if (query.has('epopen')) this.floating.reopen = query.get('epopen') !== '0';
    this.bundleDispose = registerSettings(
      'picker',
      () => ({ options: this.model.options, floating: this.floating.state() }),
      this.restoreSettings,
    );
    if (this.floating.reopen) this.open();
  }
  private syncTimer(): void {
    if (this.root.hidden) {
      stopClockTask(this.timer);
      this.timer = undefined;
      return;
    }
    this.timer ??= clockTask(
      'picker.refresh',
      () => {
        if (!this.root.hidden) this.paintAgeCoverage();
        if ((this.dirty || Date.now() >= this.nextAgeRefresh) && (!this.held || !this.model.options.hold))
          this.refresh(true);
      },
      1000,
      { active: () => !this.root.hidden && !this.stopped },
    );
  }
  private ensureEmoji(): void {
    if (emojiCatalogLoaded()) {
      this.emojiStatus.textContent = '';
      this.emojiRetry.hidden = true;
      return;
    }
    if (!this.model.options.enabled.includes('Emoji') || this.emojiPending || this.emojiFailed) return;
    this.emojiPending = true;
    this.emojiStatus.textContent = 'Loading emoji names and search…';
    this.emojiRetry.hidden = true;
    void loadEmojiCatalog()
      .then(() => {
        if (this.stopped) return;
        this.emojiPending = false;
        this.emojiStatus.textContent = '';
        if (!this.root.hidden) this.refresh(true);
      })
      .catch(() => {
        if (this.stopped) return;
        this.emojiPending = false;
        this.emojiFailed = true;
        this.emojiStatus.textContent = 'Emoji names and search could not load. Native emoji remain available.';
        this.emojiRetry.hidden = false;
      });
  }
  refresh(force = false): void {
    if (!force) {
      this.dirty = true;
      return;
    }
    if (this.root.hidden || (!force && this.held && this.model.options.hold)) {
      this.dirty = true;
      return;
    }
    this.ensureEmoji();
    this.dirty = false;
    const items = measureResourceWork('picker.query', () => this.model.query(this.channel(), this.search.value));
    const displayed = items.slice(0, this.page);
    const oldTop = this.grid.scrollTop;
    const regions = [this.grid, this.recent];
    const animateAges = this.model.options.ageRows === 0;
    const before = this.motion.capture(regions, animateAges);
    this.grid.replaceChildren();
    let source = '';
    const channel = this.channel(),
      nowAge = Date.now(),
      crossed = this.model.crossedAges(channel, nowAge);
    const oldestAge = Math.max(
      0,
      ...displayed
        .map((item) => this.model.lastUse(channel, item.code))
        .filter(Boolean)
        .map((last) => Math.max(0, nowAge - last)),
    );
    const freshness = new Map<string, number>();
    for (const item of items)
      freshness.set(item.source, Math.max(freshness.get(item.source) ?? 0, this.model.lastUse(channel, item.code)));

    let previousAge = 0;
    const now = Date.now();
    this.nextAgeRefresh = Infinity;
    for (const item of this.model.options.mixed
      ? displayed
      : displayed.sort(
          (a, b) =>
            (this.model.options.sort === 'use' ? (freshness.get(b.source) ?? 0) - (freshness.get(a.source) ?? 0) : 0) ||
            SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source),
        )) {
      if (!this.model.options.mixed && item.source !== source) {
        previousAge = 0;
        source = item.source;
        const heading = document.createElement('h3');
        heading.textContent = source;
        this.grid.append(heading);
      }
      const last = this.model.lastUse(this.channel(), item.code);
      const age = last ? Math.max(0, now - last) : Infinity;
      if (last && this.model.options.ages && this.model.options.sort === 'use') {
        const next = AGE_SECONDS.find((seconds) => last + seconds * 1000 > now);
        if (next !== undefined) this.nextAgeRefresh = Math.min(this.nextAgeRefresh, last + next * 1000);
      }
      if (this.model.options.ages && this.model.options.sort === 'use') {
        for (const seconds of crossedAges(previousAge, age)) {
          if (!this.model.options.mixed && seconds * 1000 > oldestAge) continue;
          const marker = document.createElement('span');
          marker.className = 'picker-age';
          marker.dataset.age = String(seconds);
          marker.classList.toggle('soon', seconds * 1000 > oldestAge);
          marker.classList.toggle('crossed', crossed.has(seconds));
          marker.title =
            seconds * 1000 > oldestAge
              ? 'No used emote has reached this age yet'
              : crossed.has(seconds)
                ? 'An emote crossed this age while this page was open'
                : 'Emotes below were last used over ' + ageLabel(seconds) + ' ago';
          marker.textContent = ageLabel(seconds);
          this.grid.append(marker);
        }
        previousAge = age;
      }
      this.grid.append(this.cell(item));
    }
    if (this.model.options.ages && this.model.options.sort === 'use' && displayed.length) {
      const printed = new Set(
        [...this.grid.querySelectorAll<HTMLElement>('.picker-age')].map((marker) => Number(marker.dataset.age)),
      );
      for (const seconds of AGE_SECONDS)
        if (seconds * 1000 > oldestAge && !printed.has(seconds)) {
          const marker = document.createElement('span');
          marker.className = 'picker-age soon';
          marker.dataset.age = String(seconds);
          marker.textContent = ageLabel(seconds);
          marker.title = 'No used emote has reached this age yet';
          this.grid.append(marker);
        }
    }
    this.root.dataset.ageRows = String(this.model.options.sort === 'use' ? this.model.options.ageRows : 0);
    this.paintAgeRows();
    this.paintAgeCoverage();
    this.grid.scrollTop = oldTop;
    this.recent.replaceChildren();
    if (!this.search.value.trim())
      for (const item of this.model.recent(this.channel())) this.recent.append(this.cell(item));
    this.recent.hidden = this.recent.childElementCount === 0;
    this.count.textContent = `${Math.min(items.length, this.page)} of ${items.length} · #${this.channel()}${this.canInsert() ? '' : ' · Sign in to insert'}`;
    this.more.hidden = items.length <= this.page || this.page >= 600;
    if (items.length > this.page && this.page >= 600)
      this.count.textContent += ' · 600-row limit; narrow category, tone or search';
    this.root.classList.toggle('show-names', this.model.options.names);
    this.root.style.setProperty('--picker-cell', 64 * this.model.options.zoom + 'px');
    this.motion.play(regions, before, animateAges);
  }
  private restoreSettings = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const data = value as Record<string, unknown>;
    if (!data.options || typeof data.options !== 'object' || !this.floating.restore(data.floating)) return;
    this.model.options = restorePickerOptions(this.model.options, data.options);
    for (const key of ['sort', 'animation', 'zoom', 'ageRows', 'emojiStyle', 'emojiCategory', 'emojiTone'] as const)
      get(this.root, 'picker-' + key, HTMLSelectElement).value = String(this.model.options[key]);
    for (const key of ['mixed', 'names', 'hold', 'holdPlus', 'frozen', 'seenOnly', 'ages'] as const)
      get(this.root, 'picker-' + key, HTMLInputElement).checked = this.model.options[key];
    for (const input of this.tabs.querySelectorAll<HTMLInputElement>('input'))
      input.checked = this.model.options.enabled.some((source) => source === input.value);
    this.reconcileFreeze();
    this.model.save(this.channel());
    if (this.root.dataset.rail !== 'true') {
      if (this.floating.reopen) this.open();
      else this.close();
    }
    this.refresh(true);
  };
  private preset = (event: Event): void => {
    if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
    this.model.options = pickerPreset(this.model.options, event.detail);
    const raw = pickerPresetGeometry(event.detail),
      geometry = parsePickerGeometry(raw ?? null);
    if (geometry) this.floating.configure(geometry, raw?.includes(',') ?? false);
    get(this.root, 'picker-zoom', HTMLSelectElement).value = String(this.model.options.zoom);
    get(this.root, 'picker-sort', HTMLSelectElement).value = this.model.options.sort;
    get(this.root, 'picker-ageRows', HTMLSelectElement).value = String(this.model.options.ageRows);
    for (const key of ['mixed', 'names', 'hold', 'holdPlus', 'frozen', 'seenOnly', 'ages'] as const)
      get(this.root, 'picker-' + key, HTMLInputElement).checked = this.model.options[key];
    this.reconcileFreeze();
    this.model.save(this.channel());
    this.refresh(true);
  };
  private paintAgeRows(): void {
    if (this.model.options.ageRows !== 2 || this.model.options.sort !== 'use') return;
    const markers = [...this.grid.querySelectorAll<HTMLElement>('.picker-age')];
    for (let pass = 0; pass < 5; pass++) {
      const ends = new Set<HTMLElement>();
      let previous: HTMLElement | undefined;
      for (const marker of markers) {
        if (previous && previous.offsetTop !== marker.offsetTop) ends.add(previous);
        previous = marker;
      }
      if (previous) ends.add(previous);
      let changed = false;
      for (const marker of markers) {
        const end = ends.has(marker);
        if (marker.classList.contains('row-end') !== end) {
          marker.classList.toggle('row-end', end);
          changed = true;
        }
      }
      if (!changed) break;
    }
  }
  private cell(item: PickerItem): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.insert = item.code;
    button.disabled = !this.canInsert();
    button.title = `${item.code} · ${item.source}${item.emote?.zeroWidth ? ' · overlay' : ''}`;
    button.setAttribute('aria-label', item.source === 'Emoji' ? item.keywords : item.code);
    if (item.emote) {
      const emote = item.emote;
      const tone = (value: string): string =>
        emote.source === 'Twitch'
          ? value.replace(/\/(dark|light)\//, document.documentElement.dataset.theme === 'light' ? '/light/' : '/dark/')
          : value;
      const image = document.createElement('img');
      image.dataset.emoteCode = item.code;
      image.dataset.emoteSource = item.source;
      image.alt = item.code;
      configureEmoteAnimation(
        image,
        { ...emote, url: tone(emote.url), staticUrl: tone(emote.staticUrl) },
        this.model.options.frozen || this.borrowed,
      );
      image.loading = 'lazy';
      image.decoding = 'async';
      image.dataset.playUrl = tone(emote.url);
      if (emote.staticUrl) image.dataset.stillUrl = tone(emote.staticUrl);
      let usedStatic = (this.model.options.frozen || this.borrowed) && !!emote.staticUrl;
      image.addEventListener('error', () => {
        if (fallbackEmoteAnimation(image)) {
          usedStatic = true;
          return;
        }
        if (emote.staticUrl && !usedStatic) {
          usedStatic = true;
          image.src = tone(emote.staticUrl);
        } else image.replaceWith(document.createTextNode(item.code));
      });
      button.append(image);
    } else {
      const emoji = document.createElement('span');
      emoji.className = 'picker-emoji';
      emoji.append(emojiNode(item.code, this.model.options.emojiStyle));
      button.append(emoji);
    }
    const name = document.createElement('span');
    name.className = 'picker-name';
    name.textContent = item.code;
    button.append(name);
    return button;
  }
  private paintAgeCoverage(): void {
    const channel = this.channel(),
      coverage = this.model.coverage(channel),
      now = Date.now();
    const crossed = this.model.crossedAges(channel, now);
    for (const marker of this.grid.querySelectorAll<HTMLElement>('.picker-age')) {
      const seconds = Number(marker.dataset.age),
        missed = coverage.missed(seconds, now) || missedAge(seconds, now, this.observationGaps());
      marker.classList.toggle('missed', missed);
      marker.classList.toggle('crossed', crossed.has(seconds));
      let title = marker.classList.contains('soon')
        ? 'No used emote has reached this age yet'
        : 'Emotes below were last used over ' + ageLabel(seconds) + ' ago';
      if (marker.classList.contains('crossed') && !marker.classList.contains('soon'))
        title += ' · An emote crossed this age while this page was open';
      if (missed) title += ' · Chat was not being logged for part of this window; usage may be incomplete';
      marker.title = title;
      marker.setAttribute('role', 'separator');
      marker.setAttribute('aria-label', ageLabel(seconds) + ' · ' + title);
    }
  }
  share(url: URL): void {
    pickerURL(this.model.options, url);
    url.searchParams.set('epopen', this.root.hidden ? '0' : '1');
    const box = this.floating.geometry();
    if (box)
      url.searchParams.set(
        'epgeo',
        Math.round(box.width) +
          'x' +
          Math.round(box.height) +
          (this.floating.pinned ? ',' + Math.round(box.left) + ',' + Math.round(box.top) : ''),
      );
    else url.searchParams.delete('epgeo');
  }
  showRail(open: boolean): void {
    this.root.hidden = !open;
    this.visibility();
    this.syncTimer();
    this.trigger.setAttribute('aria-expanded', String(open));
    if (open) this.refresh(true);
    else {
      this.motion.stop();
      this.gridLeave();
      this.model.save(this.channel());
    }
  }
  open(): void {
    this.root.hidden = false;
    this.syncTimer();
    this.floating.opened();
    this.trigger.setAttribute('aria-expanded', 'true');
    this.page = 200;
    this.refresh(true);
    this.search.focus();
  }
  private toggle = (): void => {
    if (!this.root.hidden) this.close();
    else this.open();
  };
  close(): void {
    this.motion.stop();
    this.root.hidden = true;
    this.visibility();
    this.syncTimer();
    this.floating.closed();
    this.trigger.setAttribute('aria-expanded', 'false');
    this.held = false;
    this.gridLeave();
    this.model.save(this.channel());
    this.trigger.focus();
  }
  private key = (event: KeyboardEvent): void => {
    const wrapper = this.root.closest<HTMLElement>('.wb-panel');
    if (!this.root.hidden && !wrapper?.hidden && !event.isComposing && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  };
  private click = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('#picker-close')) {
      this.close();
      return;
    }
    const code = event.target.closest<HTMLButtonElement>('button[data-insert]')?.dataset.insert;
    if (code && this.canInsert()) {
      this.insert(code);
      this.model.select(this.channel(), code);
      this.dirty = true;
    }
  };
  private resetOrder = (): void => {
    const channel = this.channel();
    this.model.resetOrder(channel);
    this.refresh(true);
  };
  private resetMiddle = (event: MouseEvent): void => {
    if (event.button === 1) {
      event.preventDefault();
      this.resetOrder();
    }
  };
  private change = (): void => {
    const options = this.model.options;
    const emojiOptions = parseOptions({
      ...options,
      emojiStyle: get(this.root, 'picker-emojiStyle', HTMLSelectElement).value,
      emojiCategory: get(this.root, 'picker-emojiCategory', HTMLSelectElement).value,
      emojiTone: get(this.root, 'picker-emojiTone', HTMLSelectElement).value,
    });
    options.emojiStyle = emojiOptions.emojiStyle;
    options.emojiCategory = emojiOptions.emojiCategory;
    options.emojiTone = emojiOptions.emojiTone;
    options.ageRows = Number(get(this.root, 'picker-ageRows', HTMLSelectElement).value) || 0;
    options.enabled = [...this.tabs.querySelectorAll<HTMLInputElement>('input:checked')].flatMap((input) =>
      SOURCES.includes(input.value as (typeof SOURCES)[number]) ? [input.value as (typeof SOURCES)[number]] : [],
    );
    const sort = get(this.root, 'picker-sort', HTMLSelectElement).value;
    options.sort = sort === 'az' ? 'az' : 'use';
    const animation = get(this.root, 'picker-animation', HTMLSelectElement).value;
    options.animation = animation === 'animated' || animation === 'still' ? animation : 'all';
    const zoom = Number(get(this.root, 'picker-zoom', HTMLSelectElement).value);
    options.zoom = [0.5, 0.75, 1, 4 / 3, 1.5, 5 / 3, 2].includes(zoom) ? zoom : 1;
    for (const key of ['mixed', 'names', 'hold', 'holdPlus', 'frozen', 'seenOnly', 'ages'] as const)
      options[key] = get(this.root, 'picker-' + key, HTMLInputElement).checked;
    this.reconcileFreeze();
    this.page = 200;
    this.model.save(this.channel());
    this.refresh(true);
  };
  private reconcileFreeze(): void {
    const on =
      this.gridHeld &&
      this.model.options.hold &&
      this.model.options.holdPlus &&
      this.model.options.animation !== 'still';
    if (on === this.borrowed) return;
    this.borrowed = on;
    this.root.dataset.holdFreeze = String(on);
    for (const image of this.root.querySelectorAll<HTMLImageElement>('img[data-play-url]')) {
      if (image.hasAttribute('data-emote-animation')) freezeEmoteAnimation(image, this.model.options.frozen || on);
      else image.src = (this.model.options.frozen || on ? image.dataset.stillUrl : undefined) || image.dataset.playUrl!;
    }
    this.temporaryFreeze(on);
  }
  private gridEnter = (): void => {
    this.gridHeld = true;
    this.reconcileFreeze();
  };
  private gridLeave = (): void => {
    this.gridHeld = false;
    this.reconcileFreeze();
  };
  private enter = (): void => {
    this.held = this.model.options.hold;
  };
  private leave = (): void => {
    this.held = false;
    if (this.dirty) this.refresh(true);
  };
  private searchKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      this.grid.querySelector<HTMLButtonElement>('button[data-insert]:not(:disabled)')?.click();
    }
  };
  private searchChange = (): void => {
    this.page = 200;
    this.grid.scrollTop = 0;
    this.refresh(true);
  };
  private showMore = (): void => {
    this.page = Math.min(600, this.page + 200);
    this.refresh(true);
  };
  stop(): void {
    this.stopped = true;
    this.bundleDispose();
    this.motion.stop();
    get(this.root, 'picker-reset-order', HTMLButtonElement).removeEventListener('click', this.resetOrder);
    get(this.root, 'picker-sort', HTMLSelectElement).removeEventListener('auxclick', this.resetMiddle);
    document.removeEventListener('displaypreset', this.preset);
    this.ageObserver.disconnect();
    this.gridLeave();
    this.grid.removeEventListener('pointerenter', this.gridEnter);
    this.grid.removeEventListener('pointerleave', this.gridLeave);
    stopClockTask(this.timer);
    this.floating.stop();
    this.model.saveAll();
    this.trigger.removeEventListener('click', this.toggle);
    this.root.removeEventListener('click', this.click);
    document.removeEventListener('keydown', this.key, true);
    document.removeEventListener('visibilitychange', this.visibility);
    pauseEmoteAnimations(this.root, true);
    this.root.removeEventListener('pointerenter', this.enter);
    this.root.removeEventListener('pointerleave', this.leave);
    this.tabs.removeEventListener('change', this.change);
    this.settings.removeEventListener('change', this.change);
    this.search.removeEventListener('input', this.searchChange);
    this.search.removeEventListener('keydown', this.searchKey);
    this.more.removeEventListener('click', this.showMore);
  }
}
