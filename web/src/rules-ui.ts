import { profileKey } from './account-profiles';
import { RuleEngine, parseRules, type MessageRule } from './rules';
import { SimilarMessages, parseSimilarity } from './similar';
import { privacyEnabled } from './privacy';
import { registerSettings } from './settings-bundle';
export interface RulePreferences {
  muted: boolean;
  quietStart: number;
  quietEnd: number;
}
export class RulePanel {
  readonly root = document.createElement('dialog');
  readonly trigger = document.createElement('button');
  engine = new RuleEngine([]);
  similarity = new SimilarMessages(parseSimilarity(null));
  preferences: RulePreferences = { muted: false, quietStart: 0, quietEnd: 0 };
  private raw: string | null = null;
  private preview = '';
  private stopSettings: () => void;
  constructor(private changed: () => void) {
    this.root.id = 'rules-panel';
    this.root.setAttribute('aria-label', 'Message rules');
    this.root.innerHTML =
      '<h2>Message rules</h2><button type="button" data-action="close">Close</button><label>Saved rule<select id="rule-selected"><option value="">New rule</option></select></label><label>Name<input id="rule-name" maxlength="60"></label><label>Match field<select id="rule-field"><option value="phrase">Phrase</option><option value="author">Author</option><option value="badge">Badge</option><option value="source">Origin room ID</option><option value="sourcebadge">Origin badge</option><option value="reward">Reward ID/type</option><option value="streak">Watch streak</option><option value="effect">Message effect</option><option value="type">Message type</option></select></label><label>Pattern<input id="rule-pattern" maxlength="128"></label><label><input type="checkbox" id="rule-regex">Regular expression</label><label><input type="checkbox" id="rule-caseSensitive">Case sensitive</label><label>Action<select id="rule-action"><option value="highlight">Highlight</option><option value="ignore">Hide from view</option></select></label><label>Scope<select id="rule-scope"><option value="global">All panes</option><option value="pane">Selected panes</option></select></label><label>Highlight color<input type="color" id="rule-color" value="#b392f0"></label><label><input type="checkbox" id="rule-enabled" checked>Enabled</label><label><input type="checkbox" id="rule-sound">Sound</label><label><input type="checkbox" id="rule-notify">Notification</label><label><input type="checkbox" id="rule-inbox">Include in mentions inbox</label><p>Sound and notifications also require their main settings to be enabled. Privacy mode suppresses alerts. Pane rules are selected in pane settings. Rules run in order; a hide action stops matching.</p><label>Preview text<input id="rule-sample" maxlength="2000" value="Hello chat"></label><label>Preview author<input id="rule-author" maxlength="25" value="alice"></label><label>Preview badges<input id="rule-badges" maxlength="200" value="moderator/1"></label><label>Preview message type<input id="rule-type" maxlength="30" value="PRIVMSG"></label><button type="button" data-action="preview">Preview rule</button><button type="button" data-action="save">Save previewed rule</button><button type="button" data-action="delete">Delete</button><button type="button" data-action="up">Move earlier</button><button type="button" data-action="down">Move later</button><pre id="rule-result"></pre><p id="rule-counts"></p><details><summary>Similarity and quiet hours</summary><label><input id="similar-enabled" type="checkbox">Filter similar messages</label><label>Similarity threshold<input id="similar-threshold" type="number" min="0.5" max="1" step="0.05" value="0.85"></label><label>Window in seconds<input id="similar-windowSeconds" type="number" min="1" max="120" value="30"></label><label>Maximum prior comparisons<input id="similar-maxComparisons" type="number" min="1" max="50" value="20"></label><label><input id="similar-sameAuthorExempt" type="checkbox" checked>Exempt same author</label><label><input id="similar-selfExempt" type="checkbox" checked>Exempt own messages</label><label>Similar message behavior<select id="similar-behavior"><option value="dim">Dim</option><option value="hide">Hide</option></select></label><label><input id="similar-highlightSimilar" type="checkbox">Visible similar messages trigger highlights and alerts</label><label><input id="rule-muted" type="checkbox">Mute rule alerts</label><label>Quiet hours start (0–23)<input id="rule-quietStart" type="number" min="0" max="23" value="0"></label><label>Quiet hours end (0–23)<input id="rule-quietEnd" type="number" min="0" max="23" value="0"></label><p>Equal hours disable quiet hours. Similarity is off by default. Distinct messages remain in history and statistics.</p><button type="button" data-action="preferences">Apply preferences</button></details><p>Regex supports literals, character classes, anchors, alternatives and at most one .* or .+ wildcard. Groups, backreferences and other repetitions are rejected. Patterns are limited to 128 characters; matching examines the first 2,000 characters.</p><p id="rule-status" role="status"></p>';
    this.trigger.type = 'button';
    this.trigger.textContent = 'Rules';
    document.getElementById('commands-open')?.after(this.trigger);
    document.body.append(this.root);
    this.root.addEventListener('click', this.click);
    this.root.addEventListener('change', this.select);
    this.root.addEventListener('input', this.invalidate);
    this.trigger.addEventListener('click', this.open);
    window.addEventListener('storage', this.storage);
    try {
      this.raw = localStorage.getItem(profileKey('chatthing:v1:rules'));
      if (this.raw) this.restore(JSON.parse(this.raw), false);
    } catch {
      this.status('Saved rules could not be read; chat remains available');
    }
    this.paint();
    this.syncPreferences();
    this.stopSettings = registerSettings(
      'rules',
      () => this.snapshot(),
      (value) => {
        try {
          this.restore(value, true);
        } catch {
          this.status('Workspace rules are invalid; existing rules retained');
        }
      },
    );
  }
  private input(name: string): HTMLInputElement {
    return this.root.querySelector<HTMLInputElement>('#rule-' + name)!;
  }
  private selectValue(name: string): string {
    return this.root.querySelector<HTMLSelectElement>('#rule-' + name)!.value;
  }
  private status(text: string): void {
    this.root.querySelector('#rule-status')!.textContent = text;
  }
  private candidate(): MessageRule {
    return parseRules({
      rules: [
        {
          id: this.selectValue('selected') || crypto.randomUUID(),
          name: this.input('name').value,
          pattern: this.input('pattern').value,
          field: this.selectValue('field'),
          action: this.selectValue('action'),
          scope: this.selectValue('scope'),
          color: this.input('color').value,
          ...Object.fromEntries(
            ['enabled', 'regex', 'caseSensitive', 'sound', 'notify', 'inbox'].map((key) => [
              key,
              this.input(key).checked,
            ]),
          ),
        },
      ],
    })[0]!;
  }
  private snapshot(): unknown {
    return { version: 1, rules: this.engine.rules, similarity: this.similarity.options, preferences: this.preferences };
  }
  private restore(value: unknown, persist: boolean): void {
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
    this.preview = '';
    this.paint();
    this.syncPreferences();
    this.changed();
  }
  private paint(): void {
    const select = this.root.querySelector<HTMLSelectElement>('#rule-selected')!,
      selected = select.value;
    const option = (name: string, value: string): HTMLOptionElement => {
      const o = document.createElement('option');
      o.textContent = name;
      o.value = value;
      return o;
    };
    select.replaceChildren(option('New rule', ''));
    for (const rule of this.engine.rules)
      select.append(option(rule.name + (rule.enabled ? '' : ' (disabled)'), rule.id));
    select.value = selected;
    this.counts();
  }
  counts(): void {
    this.root.querySelector('#rule-counts')!.textContent =
      this.engine.rules
        .map((r) => r.name + ': ' + (this.engine.counts()[r.id] ?? 0) + ' observed matches')
        .join(' · ') || 'No rules enabled';
  }
  private syncPreferences(): void {
    for (const [key, value] of Object.entries(this.similarity.options)) {
      const el = this.root.querySelector<HTMLInputElement | HTMLSelectElement>('#similar-' + key)!;
      if (typeof value === 'boolean' && el instanceof HTMLInputElement) el.checked = value;
      else el.value = String(value);
    }
    this.input('muted').checked = this.preferences.muted;
    this.input('quietStart').value = String(this.preferences.quietStart);
    this.input('quietEnd').value = String(this.preferences.quietEnd);
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
  private invalidate = (): void => {
    this.preview = '';
  };
  private select = (event: Event): void => {
    if (!(event.target instanceof HTMLSelectElement) || event.target.id !== 'rule-selected') return;
    const id = event.target.value,
      r = this.engine.rules.find((rule) => rule.id === id);
    if (!r) return;
    for (const [key, value] of Object.entries(r)) {
      const el = this.root.querySelector<HTMLInputElement | HTMLSelectElement>('#rule-' + key);
      if (!el) continue;
      if (typeof value === 'boolean' && el instanceof HTMLInputElement) el.checked = value;
      else el.value = String(value);
    }
    this.preview = '';
  };
  private open = (): void => {
    if (privacyEnabled()) return;
    this.counts();
    this.root.showModal();
  };
  private storage = (e: StorageEvent): void => {
    if (e.key !== profileKey('chatthing:v1:rules')) return;
    try {
      this.raw = e.newValue;
      this.restore(JSON.parse(e.newValue ?? '{"rules":[]}'), false);
    } catch {
      this.status('Rules changed but could not be loaded; existing rules retained');
    }
  };
  private click = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const action = event.target.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (!action) return;
    try {
      if (action === 'close') {
        this.root.close();
        return;
      }
      if (action === 'preview') {
        const r = this.candidate(),
          id = this.selectValue('selected');
        r.id = id || 'preview';
        const decision = new RuleEngine([r]).evaluate(
          {
            id: 'preview',
            login: this.input('author').value,
            text: this.input('sample').value,
            channel: 'preview',
            command: this.input('type').value,
            timestamp: 0,
            tags: { badges: this.input('badges').value },
          },
          [r.id],
        );
        this.preview = JSON.stringify({ ...r, id });
        this.root.querySelector('#rule-result')!.textContent = decision.hidden
          ? 'Hidden from this view'
          : decision.highlight
            ? 'Highlighted ' + decision.color
            : 'No match';
        this.status('Preview only; save to apply');
        return;
      }
      if (action === 'preferences') {
        const values: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(this.similarity.options)) {
          const el = this.root.querySelector<HTMLInputElement | HTMLSelectElement>('#similar-' + key)!;
          values[key] =
            typeof value === 'boolean' && el instanceof HTMLInputElement
              ? el.checked
              : typeof value === 'number'
                ? Number(el.value)
                : el.value;
        }
        this.restore(
          {
            rules: this.engine.rules,
            similarity: values,
            preferences: {
              muted: this.input('muted').checked,
              quietStart: Number(this.input('quietStart').value),
              quietEnd: Number(this.input('quietEnd').value),
            },
          },
          true,
        );
        this.status('Preferences applied');
        return;
      }
      const rules = [...this.engine.rules],
        id = this.selectValue('selected'),
        index = rules.findIndex((r) => r.id === id);
      if (action === 'save') {
        const r = this.candidate();
        if (this.preview !== JSON.stringify({ ...r, id })) throw new Error('Preview this rule before saving');
        if (index >= 0) rules[index] = r;
        else rules.push(r);
      } else if (action === 'delete') {
        if (index < 0) throw new Error('Choose a rule');
        rules.splice(index, 1);
      } else if (action === 'up' || action === 'down') {
        const next = index + (action === 'up' ? -1 : 1);
        if (index < 0 || next < 0 || next >= rules.length) return;
        [rules[index], rules[next]] = [rules[next]!, rules[index]!];
      }
      this.restore({ ...(this.snapshot() as object), rules }, true);
      this.status('Rules saved');
    } catch (e) {
      this.status(e instanceof Error ? e.message : 'Rules could not be saved');
    }
  };
  stop(): void {
    this.stopSettings();
    window.removeEventListener('storage', this.storage);
    this.trigger.removeEventListener('click', this.open);
    this.root.removeEventListener('click', this.click);
    this.root.removeEventListener('change', this.select);
    this.root.removeEventListener('input', this.invalidate);
    this.root.remove();
    this.trigger.remove();
  }
}
