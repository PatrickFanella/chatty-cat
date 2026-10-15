import { getProfileScope, profileKey } from './account-profiles';
import { importTheme, parseTheme, themeVariables, type CustomTheme } from './custom-theme';

// Colors and cross-tab updates remain active even when the editor has never opened.
export class CustomThemeRuntime extends EventTarget {
  saved: CustomTheme | null = null;
  error = '';
  private raw: string | null = null;
  private account = getProfileScope();
  private key = profileKey('chatthing:v1:custom-theme');
  private baseline = new Map<string, string>();
  private saveBlocked = false;
  private stopped = false;
  constructor() {
    super();
    for (const variable of Object.values(themeVariables))
      this.baseline.set(variable, document.documentElement.style.getPropertyValue(variable));
    try {
      this.reload();
    } catch {
      this.error = 'Saved theme could not be read; existing data retained. Check storage before saving.';
    }
    this.paint(this.saved);
    window.addEventListener('storage', this.storage);
  }
  reload(): void {
    try {
      this.assertScope();
      const raw = localStorage.getItem(this.key);
      const saved = raw && raw !== 'null' ? importTheme(raw, 'native').theme : null;
      this.raw = raw;
      this.saved = saved;
      this.saveBlocked = false;
      this.error = '';
    } catch (error) {
      this.saveBlocked = true;
      throw error;
    }
  }
  assertScope(): void {
    if (getProfileScope() !== this.account) throw new Error('Account changed; reload before editing this theme');
  }
  paint(theme: CustomTheme | null, announce = true): void {
    if (this.stopped) return;
    if (announce) document.dispatchEvent(new Event('presentation-before-change'));
    const root = document.documentElement;
    for (const [field, variable] of Object.entries(themeVariables)) {
      const value = theme ? theme.colors[field as keyof CustomTheme['colors']] : this.baseline.get(variable);
      if (value) root.style.setProperty(variable, value);
      else root.style.removeProperty(variable);
    }
    root.toggleAttribute('data-custom-theme', theme !== null);
    if (announce) document.dispatchEvent(new Event('customthemechange'));
  }
  persist(theme: CustomTheme | null): void {
    this.assertScope();
    if (this.saveBlocked) throw new Error('Saved theme could not be read; existing data retained');
    if (localStorage.getItem(this.key) !== this.raw)
      throw new Error('Theme changed in another tab; reopen Custom themes before saving');
    const safe = theme ? parseTheme(theme) : null,
      raw = JSON.stringify(safe);
    localStorage.setItem(this.key, raw);
    this.raw = raw;
    this.saved = safe;
    this.paint(safe);
  }
  private storage = (event: StorageEvent): void => {
    if (event.key !== this.key && event.key !== null) return;
    try {
      this.reload();
      this.paint(this.saved);
      this.error = '';
    } catch {
      this.error = 'Remote theme invalid; existing colors and saved data retained';
    }
    this.dispatchEvent(new Event('change'));
  };
  stop(): void {
    this.paint(null, false);
    this.stopped = true;
    document.documentElement.removeAttribute('data-theme-reduced-motion');
    window.removeEventListener('storage', this.storage);
  }
}
