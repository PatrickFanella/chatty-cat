import {
  ModerationPresetStore,
  parseModerationPresets,
  expandModerationPreset,
  type ModerationPreset,
  type PresetScope,
} from './moderation-presets';
import { privacyEnabled } from './privacy';
export class ModerationPresetPanel {
  readonly root = document.createElement('fieldset');
  private list = document.createElement('div');
  private definitions = document.createElement('textarea');
  private transfer = document.createElement('textarea');
  private preview = document.createElement('pre');
  private status = document.createElement('p');
  private apply: HTMLButtonElement;
  private download: HTMLButtonElement;
  private store: ModerationPresetStore | undefined;
  private scope = '';
  private reviewed: ModerationPreset[] | undefined;
  private output = '';
  private presets: ModerationPreset[] = [];
  constructor(
    private stage: (preset: ModerationPreset) => void,
    private guarded: () => boolean,
  ) {
    const legend = document.createElement('legend');
    legend.textContent = 'Channel moderation presets';
    const help = document.createElement('p');
    help.textContent =
      'Edit the JSON list to set timeout durations, templates and action order. Use {user}, {userID} or {messageID}. Quick actions and Alt+Shift+1–9 stage a review only; Confirm remains separate. Shortcuts work while this workspace is open and focus is outside editable fields.';
    this.definitions.maxLength = 32768;
    this.transfer.maxLength = 32768;
    this.definitions.setAttribute('aria-label', 'Ordered moderation preset definitions');
    this.transfer.setAttribute('aria-label', 'Moderation preset import JSON');
    this.definitions.addEventListener('input', this.invalidate);
    this.transfer.addEventListener('input', this.invalidate);
    this.apply = this.button('Save reviewed moderation presets', () => {
      if (!this.reviewed || !this.store) throw new Error('Preview the definitions first');
      this.store.save(this.reviewed);
      this.invalidate();
      this.paint();
      this.status.textContent = 'Presets saved for this account/workspace/channel';
    });
    this.apply.disabled = true;
    this.download = this.button('Download reviewed moderation presets', () => {
      if (!this.output) throw new Error('Preview the export first');
      const url = URL.createObjectURL(new Blob([this.output], { type: 'application/json' })),
        a = document.createElement('a');
      a.href = url;
      a.download = 'chatty-cat-moderation-presets.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    this.download.disabled = true;
    const definitions = document.createElement('label');
    definitions.append('Ordered JSON definitions ', this.definitions);
    const transfer = document.createElement('label');
    transfer.append('Paste preset backup JSON ', this.transfer);
    this.status.setAttribute('role', 'status');
    this.root.append(
      legend,
      help,
      this.list,
      definitions,
      this.button('Preview moderation preset definitions', () =>
        this.review(parseModerationPresets(JSON.parse(this.definitions.value))),
      ),
      transfer,
      this.button('Preview moderation preset import', () => {
        if (!this.store) throw new Error('Log in first');
        this.review(this.store.import(this.transfer.value));
      }),
      this.preview,
      this.apply,
      this.button('Preview moderation preset export', () => {
        if (!this.store) throw new Error('Log in first');
        this.output = this.store.export();
        this.preview.textContent = this.output;
        this.download.disabled = false;
        this.apply.disabled = true;
        this.reviewed = undefined;
      }),
      this.download,
      this.status,
    );
  }
  private button(text: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', () => {
      try {
        if (privacyEnabled() || !this.guarded()) throw new Error('Wait for the current action or exit privacy mode');
        action();
      } catch (e) {
        this.status.textContent = e instanceof Error ? e.message : 'Preset action unavailable';
      }
    });
    return button;
  }
  private review(items: ModerationPreset[]): void {
    this.invalidate();
    this.reviewed = items;
    this.preview.textContent =
      'Review replacement in #' +
      this.store?.scope.channel +
      ' / workspace ' +
      this.store?.scope.workspace +
      ' / account ' +
      this.store?.scope.account +
      '\n' +
      items
        .map((x, i) => `${i + 1}. ${x.name}: ${expandModerationPreset(x, 'fixture', 'fixture-message', '456').command}`)
        .join('\n') +
      '\nSample identities only; real actions use the refreshed selected target. Saving changes definitions and sends nothing.';
    this.apply.disabled = !this.store;
  }
  setScope(value: PresetScope | undefined): void {
    const key = JSON.stringify(value);
    if (key === this.scope) return;
    this.clear();
    this.scope = key;
    if (!value) return;
    try {
      this.store = new ModerationPresetStore(value);
      this.paint();
    } catch (e) {
      this.status.textContent = e instanceof Error ? e.message : 'Preset storage unavailable';
    }
  }
  private paint(): void {
    if (!this.store) return;
    this.presets = this.store.all();
    this.definitions.value = JSON.stringify(this.presets, null, 2);
    this.list.replaceChildren();
    this.presets.forEach((preset, index) =>
      this.list.append(this.button(index + 1 + '. ' + preset.name, () => this.stage(preset))),
    );
  }
  shortcut(event: KeyboardEvent): void {
    if (
      !event.altKey ||
      !event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.repeat ||
      event.isComposing ||
      privacyEnabled() ||
      !this.guarded() ||
      (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]'))
    )
      return;
    const index = Number(event.code.replace('Digit', '')) - 1;
    if (!event.code.startsWith('Digit') || index < 0 || index > 8) return;
    const preset = this.presets[index];
    if (!preset) return;
    event.preventDefault();
    try {
      this.stage(preset);
    } catch (e) {
      this.status.textContent = e instanceof Error ? e.message : 'Preset unavailable';
    }
  }
  private invalidate = (): void => {
    this.reviewed = undefined;
    this.output = '';
    this.preview.textContent = '';
    this.apply.disabled = true;
    this.download.disabled = true;
  };
  clear(): void {
    this.scope = '';
    this.store = undefined;
    this.presets = [];
    this.list.replaceChildren();
    this.definitions.value = '';
    this.transfer.value = '';
    this.status.textContent = '';
    this.invalidate();
  }
}
