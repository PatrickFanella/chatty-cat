import { showPanel } from './shell/open-panel';
import { profileKey } from './account-profiles';
import { privacyEnabled } from './privacy';
import { captureBundle, parseBundle, restoreBundle, type SettingsBundle } from './settings-bundle';
import {
  PRESETS,
  COLOURS,
  VARIANTS,
  FONT_STACKS,
  FONT_SIZES,
  LINE_HEIGHTS,
  WEIGHTS,
  LS_STEPS,
  SHADE_NAMES,
} from './display-data';
import { defaultDisplay, parseDisplay, displayFromURL, type DisplayRuntime } from './display';
export class DisplaySettings {
  get options() {
    return this.runtime.options;
  }
  set options(value) {
    this.runtime.options = value;
  }
  private form: HTMLFormElement;
  private slots: (SettingsBundle | null)[] = [null, null, null];
  private slotFrame = 0;
  constructor(
    private dialog: HTMLDialogElement,
    private trigger: HTMLButtonElement,
    private runtime: DisplayRuntime,
  ) {
    this.form = dialog.querySelector('form')!;
    const choices: Record<string, readonly (string | number)[]> = {
      colour: COLOURS,
      variant: VARIANTS,
      shade: SHADE_NAMES.map((_, i) => i),
      font: Object.keys(FONT_STACKS),
      size: FONT_SIZES,
      lh: LINE_HEIGHTS,
      weight: WEIGHTS,
      spacing: LS_STEPS,
      lines: [0, 1, 2, 3, 4],
      zebra: [0, 1, 2, 3, 4],
      times: [0, 1, 2, 3, 4],
      split: [1, 2, 3, 4, 5, 6],
      min: [0, 1, 2],
      hfs: [0, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20],
      hpfs: [-3, -2, -1, 0, ...FONT_SIZES],
      lw: WEIGHTS,
      peek: [0, 1, 2, 3],
      bauto: [0, 1, 2],
      anim: [0, 1, 2, 3],
      rbw: [0, 1, 2, 3, 4],
      sub: ['right', 'num-right', 'left', 'num-left', 'hidden'],
      shadow: [0, 1, 2, 3, 4, 5],
      eonly: [0, 1, 2],
      scrollback: [250, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000],
      hideMode: ['vanish', 'stub', 'ghost'],
    };
    for (const [name, values] of Object.entries(choices)) {
      const select = this.form.elements.namedItem(name);
      if (!(select instanceof HTMLSelectElement)) continue;
      for (const value of values) {
        const option = document.createElement('option');
        option.value = String(value);
        option.textContent = name === 'shade' ? (SHADE_NAMES[Number(value)] ?? String(value)) : String(value);
        select.append(option);
      }
    }
    const presets = this.form.elements.namedItem('preset');
    if (presets instanceof HTMLSelectElement)
      for (const name of Object.keys(PRESETS)) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        presets.append(option);
      }
    this.readSlots();
    this.paintSlots();
    this.dialog.addEventListener('click', this.slot);
    this.dialog.addEventListener('contextmenu', this.slot);
    this.apply();
    this.sync();
    this.trigger.addEventListener('click', this.open);
    this.form.addEventListener('change', this.change);
    this.form.addEventListener('submit', this.submit);
    dialog.querySelector('#display-close')?.addEventListener('click', this.close);
    dialog.querySelector('#display-reset')?.addEventListener('click', this.reset);
    dialog.querySelector('#display-share')?.addEventListener('click', this.share);
    window.addEventListener('storage', this.storage);
    this.runtime.addEventListener('change', this.syncView);
  }
  private sync(): void {
    for (const [key, value] of Object.entries(this.options)) {
      const input = this.form.elements.namedItem(key);
      if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) {
        input.value = String(value);
        if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = value === true;
      }
    }
  }
  private syncView = (): void => {
    this.sync();
  };
  private apply(): void {
    this.runtime.apply();
  }
  private changed(): void {
    this.runtime.notify();
  }
  private readSlots(): void {
    try {
      const values: unknown = JSON.parse(localStorage.getItem(profileKey('chatthing:v1:display-slots')) ?? 'null');
      if (Array.isArray(values)) this.slots = [0, 1, 2].map((i) => parseBundle(values[i], parseDisplay));
    } catch {
      /* optional storage */
    }
  }
  private paintSlots(): void {
    for (const button of this.dialog.querySelectorAll<HTMLButtonElement>('[data-slot]')) {
      const index = Number(button.dataset.slot),
        value = this.slots[index];
      button.textContent = 'Slot ' + (index + 1) + (value ? ' · saved' : ' · empty');
      button.title = value
        ? `${value.display.colour} · ${value.display.font} ${value.display.size}px. Click to recall; Shift-click or right-click overwrites.`
        : 'Click to save current settings and panel state';
    }
  }
  private slot = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-slot]');
    if (!button) return;
    const index = Number(button.dataset.slot);
    if (!Number.isInteger(index) || index < 0 || index > 2) return;
    event.preventDefault();
    const value = this.slots[index];
    if (value && !event.shiftKey && event.type !== 'contextmenu') {
      this.options = parseDisplay(value.display);
      this.sync();
      this.apply();
      this.save();
      this.changed();
      cancelAnimationFrame(this.slotFrame);
      this.slotFrame = requestAnimationFrame(() => {
        this.slotFrame = 0;
        restoreBundle(value);
        button.focus({ preventScroll: true });
      });
    } else {
      this.slots[index] = captureBundle(this.options);
      try {
        localStorage.setItem(profileKey('chatthing:v1:display-slots'), JSON.stringify(this.slots));
      } catch {
        /* optional storage */
      }
      this.paintSlots();
    }
  };
  private save(): void {
    this.runtime.save();
  }
  open = (): void => {
    if (!privacyEnabled()) showPanel(this.dialog);
  };
  close = (): void => {
    this.dialog.close();
    this.trigger.focus();
  };
  private submit = (event: Event): void => event.preventDefault();
  private change = (event: Event): void => {
    if (event.target instanceof HTMLSelectElement && event.target.name === 'preset' && event.target.value) {
      this.options = displayFromURL(this.options, new URLSearchParams({ theme: event.target.value }));
      this.sync();
      document.dispatchEvent(new CustomEvent('displaypreset', { detail: event.target.value }));
    } else {
      const values: Record<string, unknown> = {};
      for (const [key, current] of Object.entries(this.options)) {
        const input = this.form.elements.namedItem(key);
        if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement)
          values[key] =
            typeof current === 'number'
              ? Number(input.value)
              : typeof current === 'boolean' && input instanceof HTMLInputElement
                ? input.checked
                : input.value;
      }
      if (event.target instanceof HTMLSelectElement && event.target.name === 'shade') values.autoShade = false;
      this.options = parseDisplay(values);
    }
    this.apply();
    this.save();
    this.changed();
  };
  private reset = (): void => {
    this.options = displayFromURL(defaultDisplay(), new URLSearchParams('theme=nightshade'));
    document.dispatchEvent(new CustomEvent('displaypreset', { detail: 'nightshade' }));
    this.apply();
    this.sync();
    this.save();
    this.changed();
  };
  private share = (): void => {
    if (privacyEnabled()) return;
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(this.options))
      url.searchParams.set(
        ({ weight: 'wght', spacing: 'ls' } as Record<string, string>)[key] ?? key,
        key === 'shade' && this.options.autoShade
          ? 'auto'
          : typeof value === 'boolean'
            ? value
              ? '1'
              : '0'
            : String(value),
      );
    document.dispatchEvent(new CustomEvent('share-settings', { detail: url }));
    const output = this.dialog.querySelector<HTMLInputElement>('#display-url')!;
    output.value = url.href;
    output.hidden = false;
    output.select();
  };
  private storage = (event: StorageEvent): void => {
    if (event.key === profileKey('chatthing:v1:display-slots')) {
      this.readSlots();
      this.paintSlots();
      return;
    }
    if (event.key !== profileKey('chatthing:v1:display')) return;
    try {
      this.options = parseDisplay(JSON.parse(event.newValue ?? 'null'));
      this.apply();
      this.sync();
      this.changed();
    } catch {
      /* malformed remote storage */
    }
  };
  stop(): void {
    cancelAnimationFrame(this.slotFrame);
    this.dialog.removeEventListener('click', this.slot);
    this.dialog.removeEventListener('contextmenu', this.slot);
    this.trigger.removeEventListener('click', this.open);
    this.form.removeEventListener('change', this.change);
    this.form.removeEventListener('submit', this.submit);
    this.dialog.querySelector('#display-close')?.removeEventListener('click', this.close);
    this.dialog.querySelector('#display-reset')?.removeEventListener('click', this.reset);
    this.dialog.querySelector('#display-share')?.removeEventListener('click', this.share);
    window.removeEventListener('storage', this.storage);
    this.runtime.removeEventListener('change', this.syncView);
  }
}
