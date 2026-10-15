import { getProfileScope, profileKey } from './account-profiles';
import { privacyEnabled } from './privacy';
import {
  importTheme,
  parseTheme,
  themeContrast,
  themeVariables,
  type CustomTheme,
  type ThemeFormat,
} from './custom-theme';
export class CustomThemePanel {
  readonly root = document.createElement('dialog');
  private trigger = document.createElement('button');
  private source = document.createElement('textarea');
  private format = document.createElement('select');
  private status = document.createElement('p');
  private report = document.createElement('pre');
  private motion = document.createElement('input');
  private saved: CustomTheme | null = null;
  private candidate: CustomTheme | undefined;
  private raw: string | null = null;
  private account = getProfileScope();
  private key = profileKey('chatthing:v1:custom-theme');
  private baseline = new Map<string, string>();
  private saveBlocked = false;
  constructor() {
    this.root.id = 'custom-theme-panel';
    this.root.setAttribute('aria-label', 'Custom color themes');
    this.trigger.type = 'button';
    this.trigger.textContent = 'Custom themes';
    document.getElementById('display-open')?.after(this.trigger);
    const title = document.createElement('h2');
    title.textContent = 'Custom color themes';
    const help = document.createElement('p');
    help.textContent =
      'Import color data up to 64 KiB. Chatty Cat version 1 needs six opaque hex colors: background, panel, foreground, muted, border and accent. Chatterino 2.5.6 imports map a supported subset; unused fields are listed. No CSS, assets or schema URLs are loaded. Preview changes the current workspace temporarily. Built-in palette controls remain underneath the custom colors.';
    for (const [value, label] of [
      ['native', 'Chatty Cat version 1'],
      ['chatterino', 'Chatterino 2.5.6 color subset'],
    ]) {
      const option = document.createElement('option');
      option.value = value!;
      option.textContent = label!;
      this.format.append(option);
    }
    this.format.setAttribute('aria-label', 'Theme import format');
    this.source.setAttribute('aria-label', 'Theme JSON');
    this.source.maxLength = 65536;
    const label = document.createElement('label');
    this.motion.type = 'checkbox';
    label.append(this.motion, ' Preview with CSS animations and transitions stopped');
    this.motion.addEventListener('change', () => {
      document.documentElement.toggleAttribute('data-theme-reduced-motion', this.motion.checked);
    });
    this.status.setAttribute('role', 'status');
    this.report.setAttribute('aria-label', 'Theme review');
    const samples = document.createElement('section');
    samples.setAttribute('aria-label', 'Theme surface samples');
    for (const [name, text] of [
      ['Chat', 'viewer: Example message; user colors and highlights can differ'],
      ['Picker', 'Example emote picker control'],
      ['Resources', 'Example help link'],
      ['Moderation', 'Example review control — no action is sent'],
    ]) {
      const surface = document.createElement('section');
      surface.className = 'theme-sample';
      const heading = document.createElement('strong');
      heading.textContent = name!;
      const content = document.createElement('p');
      content.textContent = text!;
      surface.append(heading, content);
      samples.append(surface);
    }
    this.root.append(
      title,
      help,
      this.format,
      this.source,
      label,
      this.button('Review theme', () => this.review()),
      this.button('Preview across workspace', () => {
        this.requireCandidate();
        this.paint(this.candidate!);
        this.status.textContent =
          'Temporary preview across chat, picker, resources and moderation. Apply to save or Revert to restore.';
      }),
      this.button('Apply and save theme', () => {
        this.requireCandidate();
        this.persist(this.candidate!);
      }),
      this.button('Revert preview', () => this.revert()),
      this.button('Use built-in palette', () => this.persist(null)),
      this.button('Export reviewed theme', () => this.export()),
      this.button('Close', () => this.root.close()),
      this.report,
      this.status,
    );
    this.root.insertBefore(samples, this.report);
    for (const variable of Object.values(themeVariables))
      this.baseline.set(variable, document.documentElement.style.getPropertyValue(variable));
    this.source.addEventListener('input', this.invalidate);
    this.format.addEventListener('change', this.invalidate);
    this.trigger.addEventListener('click', this.open);
    this.root.addEventListener('close', this.closed);
    document.addEventListener('privacychange', this.privacy);
    window.addEventListener('storage', this.storage);
    document.body.append(this.root);
    try {
      this.raw = localStorage.getItem(this.key);
      if (this.raw && this.raw !== 'null') this.saved = importTheme(this.raw, 'native').theme;
    } catch {
      this.saveBlocked = true;
      this.status.textContent = 'Saved theme could not be read; existing data retained. Check storage before saving.';
    }
    this.paint(this.saved);
  }
  private button(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      try {
        if (privacyEnabled()) throw new Error('Custom theme editing is hidden in privacy mode');
        this.scope();
        action();
      } catch (e) {
        this.status.textContent = e instanceof Error ? e.message : 'Theme unavailable';
      }
    });
    return button;
  }
  private scope(): void {
    if (getProfileScope() !== this.account) throw new Error('Account changed; reload before editing this theme');
  }
  private requireCandidate(): void {
    if (!this.candidate) throw new Error('Review the current theme data first');
  }
  private review(): void {
    this.candidate = undefined;
    this.report.textContent = '';
    this.paint(this.saved);
    const format: ThemeFormat = this.format.value === 'chatterino' ? 'chatterino' : 'native';
    const result = importTheme(this.source.value, format);
    this.candidate = result.theme;
    this.report.textContent =
      result.theme.name +
      '\n' +
      themeContrast(result.theme)
        .map(
          (p) =>
            p.label +
            ': ' +
            p.ratio.toFixed(2) +
            ':1 ' +
            (p.ratio >= 4.5 ? 'meets 4.5:1 text threshold' : 'below 4.5:1 text threshold'),
        )
        .join('\n') +
      '\nUnsupported entries: ' +
      (result.unsupported.length ? result.unsupported.join(', ') : 'none');
    this.status.textContent =
      'Reviewed color-only data. Contrast checks cover theme text colors, not user names, emotes or every message highlight.';
  }
  private paint(theme: CustomTheme | null, announce = true): void {
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
  private persist(theme: CustomTheme | null): void {
    this.scope();
    if (this.saveBlocked) throw new Error('Saved theme could not be read; existing data retained');
    if (localStorage.getItem(this.key) !== this.raw)
      throw new Error('Theme changed in another tab; reopen Custom themes before saving');
    const safe = theme ? parseTheme(theme) : null,
      raw = JSON.stringify(safe);
    localStorage.setItem(this.key, raw);
    this.raw = raw;
    this.saved = safe;
    this.paint(safe);
    this.status.textContent = safe
      ? 'Custom theme saved for this account'
      : 'Built-in palette restored; saved workspaces and drafts retained';
  }
  private export(): void {
    this.requireCandidate();
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(this.candidate, null, 2) + '\n'], { type: 'application/json' }),
      ),
      link = document.createElement('a');
    link.href = url;
    link.download = 'chatty-cat-theme.json';
    link.click();
    URL.revokeObjectURL(url);
    this.status.textContent = 'Exported validated Chatty Cat version 1 colors only';
  }
  private revert(): void {
    this.paint(this.saved);
    this.motion.checked = false;
    document.documentElement.removeAttribute('data-theme-reduced-motion');
    this.status.textContent = 'Saved colors restored; workspace and drafts retained';
  }
  private invalidate = (): void => {
    this.candidate = undefined;
    this.report.textContent = '';
    this.revert();
  };
  private open = (): void => {
    if (privacyEnabled()) return;
    try {
      this.scope();
      const raw = localStorage.getItem(this.key);
      const saved = raw && raw !== 'null' ? importTheme(raw, 'native').theme : null;
      this.raw = raw;
      this.saved = saved;
      this.saveBlocked = false;
      this.source.value = this.saved ? JSON.stringify(this.saved, null, 2) : '';
      this.format.value = 'native';
      this.invalidate();
    } catch (e) {
      this.saveBlocked = true;
      this.status.textContent = e instanceof Error ? e.message : 'Theme unavailable';
    }
    if (!this.root.open) this.root.showModal();
  };
  private closed = (): void => {
    this.revert();
    this.candidate = undefined;
    this.source.value = '';
    this.report.textContent = '';
    this.trigger.focus();
  };
  private privacy = (): void => {
    if (privacyEnabled()) {
      this.closed();
      if (this.root.open) this.root.close();
    }
  };
  private storage = (e: StorageEvent): void => {
    this.privacy();
    if (e.key !== this.key && e.key !== null) return;
    try {
      this.scope();
      const raw = e.key === null ? localStorage.getItem(this.key) : e.newValue;
      const saved = raw && raw !== 'null' ? importTheme(raw, 'native').theme : null;
      this.raw = raw;
      this.saved = saved;
      this.saveBlocked = false;
      this.invalidate();
      this.status.textContent = 'Theme updated from another tab; review again before applying';
    } catch {
      this.saveBlocked = true;
      this.status.textContent = 'Remote theme invalid; existing colors and saved data retained';
    }
  };
  stop(): void {
    this.paint(null, false);
    document.documentElement.removeAttribute('data-theme-reduced-motion');
    this.root.removeEventListener('close', this.closed);
    document.removeEventListener('privacychange', this.privacy);
    window.removeEventListener('storage', this.storage);
    this.trigger.remove();
    this.root.remove();
  }
}
