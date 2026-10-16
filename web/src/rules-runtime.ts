import { profileKey } from './account-profiles';
import { RuleEngine, parseRules } from './rules';
import { SimilarMessages, parseSimilarity } from './similar';
import { registerSettings } from './settings-bundle';
export interface RulePreferences {
  muted: boolean;
  quietStart: number;
  quietEnd: number;
}
export class RuleRuntime extends EventTarget {
  engine = new RuleEngine([]);
  similarity = new SimilarMessages(parseSimilarity(null));
  preferences: RulePreferences = { muted: false, quietStart: 0, quietEnd: 0 };
  error = '';
  private raw: string | null = null;
  private stopSettings: () => void;
  constructor(private changed: () => void) {
    super();
    try {
      this.raw = localStorage.getItem(profileKey('chatthing:v1:rules'));
      if (this.raw) this.restore(JSON.parse(this.raw), false);
    } catch {
      this.error = 'Saved rules could not be read; chat remains available';
    }
    window.addEventListener('storage', this.storage);
    this.stopSettings = registerSettings(
      'rules',
      () => this.snapshot(),
      (value) => {
        try {
          this.restore(value, true);
        } catch {
          this.error = 'Workspace rules are invalid; existing rules retained';
          this.dispatchEvent(new Event('change'));
        }
      },
    );
  }
  snapshot(): unknown {
    return { version: 1, rules: this.engine.rules, similarity: this.similarity.options, preferences: this.preferences };
  }
  restore(value: unknown, persist: boolean): void {
    if (!value || typeof value !== 'object') throw new Error('Invalid rules');
    const v = value as Record<string, unknown>;
    const rules = parseRules(v),
      similarity = parseSimilarity(v.similarity),
      p = v.preferences && typeof v.preferences === 'object' ? (v.preferences as Record<string, unknown>) : {};
    const hour = (key: string): number =>
      typeof p[key] === 'number' && Number.isInteger(p[key]) && p[key] >= 0 && p[key] <= 23 ? p[key] : 0;
    const preferences = { muted: p.muted === true, quietStart: hour('quietStart'), quietEnd: hour('quietEnd') };
    if (persist) {
      if (localStorage.getItem(profileKey('chatthing:v1:rules')) !== this.raw)
        throw new Error('Rules changed in another tab; reload before saving');
      const raw = JSON.stringify({ version: 1, rules, similarity, preferences });
      localStorage.setItem(profileKey('chatthing:v1:rules'), raw);
      this.raw = raw;
    }
    this.engine = new RuleEngine(rules);
    this.similarity = new SimilarMessages(similarity);
    this.preferences = preferences;
    this.changed();
    this.dispatchEvent(new Event('change'));
  }
  alertsAllowed(now = new Date()): boolean {
    const p = this.preferences,
      h = now.getHours();
    return (
      !p.muted &&
      (p.quietStart === p.quietEnd ||
        (p.quietStart < p.quietEnd ? h < p.quietStart || h >= p.quietEnd : h < p.quietStart && h >= p.quietEnd))
    );
  }
  counts(): void {
    this.dispatchEvent(new Event('counts'));
  }
  private storage = (event: StorageEvent): void => {
    if (event.key !== profileKey('chatthing:v1:rules')) return;
    try {
      this.raw = event.newValue;
      this.restore(JSON.parse(event.newValue ?? '{"rules":[]}'), false);
      this.error = '';
    } catch {
      this.error = 'Rules changed but could not be loaded; existing rules retained';
      this.dispatchEvent(new Event('change'));
    }
  };
  stop(): void {
    this.stopSettings();
    window.removeEventListener('storage', this.storage);
  }
}
