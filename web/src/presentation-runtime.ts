import { profileKey } from './account-profiles';
import { overlayAppearance, overlayAppearanceStyles } from './overlay-appearance';
import { parsePresentation, setPresentation, presentationDefaults, type PresentationOptions } from './presentation';
import { registerSettings } from './settings-bundle';
export class PresentationRuntime extends EventTarget {
  options = { ...presentationDefaults };
  saved = { ...presentationDefaults };
  error = '';
  private raw: string | null = null;
  private stopped = false;
  private stopSettings: () => void;
  constructor(private changed: () => void) {
    super();
    try {
      this.raw = localStorage.getItem(profileKey('chatthing:v1:presentation'));
      if (this.raw) this.saved = parsePresentation(JSON.parse(this.raw));
    } catch {
      this.error = 'Saved presentation could not be read; defaults are active';
    }
    this.options = { ...this.saved };
    this.apply();
    this.focus();
    window.addEventListener('storage', this.storage);
    window.addEventListener('focus', this.focus);
    window.addEventListener('blur', this.focus);
    this.stopSettings = registerSettings(
      'presentation',
      () => this.saved,
      (value) => this.persist(parsePresentation(value)),
    );
  }
  persist(value: PresentationOptions): void {
    if (localStorage.getItem(profileKey('chatthing:v1:presentation')) !== this.raw)
      throw new Error('Presentation changed in another tab; reload before saving');
    const raw = JSON.stringify(value);
    localStorage.setItem(profileKey('chatthing:v1:presentation'), raw);
    this.raw = raw;
    this.saved = { ...value };
    this.options = { ...value };
    this.apply();
    this.changed();
    this.dispatchEvent(new Event('change'));
  }
  apply(): void {
    if (this.stopped) return;
    document.dispatchEvent(new Event('presentation-before-change'));
    setPresentation(this.options);
    const root = document.documentElement;
    for (const [key, v] of Object.entries(this.options))
      root.dataset['presentation' + key[0]!.toUpperCase() + key.slice(1)] = String(v);
    root.style.setProperty('--bold-scale', String(this.options.boldScale));
    root.style.setProperty('--presentation-scale', String(this.options.uiScale));
    root.style.setProperty('--last-message-color', this.options.lastColor);
    root.style.setProperty('--last-message-pattern', this.options.lastPattern);
    root.style.setProperty('--collapse-lines', String(this.options.collapseLines));
    for (const [key, value] of Object.entries(overlayAppearanceStyles(overlayAppearance(this.options))))
      root.style.setProperty(key, value);
    document.dispatchEvent(new CustomEvent('presentationchange', { detail: this.options }));
  }
  private focus = (): void => {
    document.documentElement.dataset.windowFocused = String(document.hasFocus());
    if (this.options.animateOnlyFocused) this.changed();
  };
  preview(options: PresentationOptions): void {
    this.options = options;
    this.apply();
    this.changed();
  }
  cancel(): void {
    if (this.stopped) return;
    this.options = { ...this.saved };
    this.apply();
    this.changed();
  }
  private storage = (event: StorageEvent): void => {
    if (event.key !== profileKey('chatthing:v1:presentation')) return;
    try {
      const saved = parsePresentation(JSON.parse(event.newValue ?? 'null'));
      this.raw = event.newValue;
      this.saved = saved;
      this.cancel();
      this.error = '';
    } catch {
      this.error = 'Remote presentation could not be read; existing view retained';
    }
    this.dispatchEvent(new Event('change'));
  };
  stop(): void {
    this.stopped = true;
    this.stopSettings();
    window.removeEventListener('storage', this.storage);
    window.removeEventListener('focus', this.focus);
    window.removeEventListener('blur', this.focus);
  }
}
