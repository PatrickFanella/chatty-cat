import { profileKey } from './account-profiles';
import {
  ACTIONS,
  defaultBindings,
  parseHotkeys,
  bindingFor,
  canHandle,
  validateBindings,
  type Bindings,
  type ActionID,
} from './hotkeys';
import { registerSettings } from './settings-bundle';
import { privacyEnabled } from './privacy';
export class HotkeyRuntime extends EventTarget {
  bindings: Bindings = defaultBindings();
  raw: string | null = null;
  error = '';
  private stopSettings: () => void;
  constructor(
    private run: (id: ActionID) => void,
    private available: (id: ActionID) => boolean = () => true,
  ) {
    super();
    this.reload();
    document.addEventListener('keydown', this.key, true);
    window.addEventListener('storage', this.storage);
    this.stopSettings = registerSettings(
      'hotkeys',
      () => ({ version: 1, bindings: { ...this.bindings } }),
      (value) => {
        const parsed = parseHotkeys(value);
        if (parsed) {
          this.bindings = parsed.bindings;
          this.dispatchEvent(new Event('change'));
        } else this.error = 'Imported shortcuts are invalid; current bindings were retained';
      },
    );
  }
  private reload(): void {
    try {
      const raw = localStorage.getItem(profileKey('chatthing:v1:hotkeys'));
      const parsed =
        raw && raw.length <= 8192
          ? parseHotkeys(JSON.parse(raw))
          : raw === null
            ? { version: 1, bindings: defaultBindings() }
            : null;
      if (parsed) {
        this.raw = raw;
        this.bindings = parsed.bindings;
        this.error = '';
      } else this.error = 'Saved shortcuts are invalid; defaults are active until you save or reset';
    } catch {
      this.error = 'Shortcut storage is unavailable; defaults are active';
    }
  }
  write(bindings: Bindings, expected: string | null): void {
    const errors = validateBindings(bindings);
    if (errors.length) throw new Error(errors.join('; '));
    if (localStorage.getItem(profileKey('chatthing:v1:hotkeys')) !== expected)
      throw new Error('Shortcuts changed in another tab; close and reopen before saving');
    const raw = JSON.stringify({ version: 1, bindings });
    localStorage.setItem(profileKey('chatthing:v1:hotkeys'), raw);
    this.raw = raw;
    this.bindings = { ...bindings };
    this.dispatchEvent(new Event('change'));
  }
  private key = (event: KeyboardEvent): void => {
    if (privacyEnabled() || !event.code) return;
    const action = ACTIONS.find((action) => this.bindings[action.id] === bindingFor(event));
    if (
      !action ||
      !this.available(action.id) ||
      !canHandle(action, event, event.target, !!document.querySelector('dialog[open]:not([data-rail="true"])'))
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.run(action.id);
  };
  private storage = (event: StorageEvent): void => {
    if (event.key !== profileKey('chatthing:v1:hotkeys') && event.key !== null) return;
    this.reload();
    this.dispatchEvent(new Event('change'));
  };
  stop(): void {
    this.stopSettings();
    document.removeEventListener('keydown', this.key, true);
    window.removeEventListener('storage', this.storage);
  }
}
