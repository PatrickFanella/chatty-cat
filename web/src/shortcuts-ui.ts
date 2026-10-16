import { showPanel } from './shell/open-panel';
import { ACTIONS, defaultBindings, validateBindings, bindingFor, type Bindings } from './hotkeys';
import type { HotkeyRuntime } from './hotkeys-runtime';
import type { Panel } from './shell/panels';
import { privacyEnabled } from './privacy';
function button(id: string, label: string, run: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.id = id;
  node.type = 'button';
  node.textContent = label;
  node.addEventListener('click', run);
  return node;
}
export class ShortcutPanel implements Panel {
  readonly id = 'shortcut-settings';
  readonly title = 'Shortcuts';
  readonly group = 'help';
  readonly root = document.createElement('dialog');
  private list = document.createElement('div');
  private status = document.createElement('p');
  private inputs = new Map<string, HTMLInputElement>();
  private draft: Bindings = defaultBindings();
  private expected: string | null = null;
  private stale = false;
  constructor(private runtime: HotkeyRuntime) {
    this.root.id = this.id;
    this.root.setAttribute('aria-label', 'Keyboard shortcuts');
    this.status.id = 'shortcut-status';
    this.status.role = 'status';
    const info = document.createElement('p');
    info.textContent =
      'Shortcuts use physical key codes. Record a chord or enter one such as Alt+KeyM; Mod means Command or Control. Blank disables an action. Chat shortcuts run outside text fields and dialogs; action search also works from the composer. F5 reloads provider metadata outside text fields and dialogs. Reserved browser shortcuts and privacy panic cannot be reassigned.';
    for (const action of ACTIONS) {
      const row = document.createElement('label'),
        input = document.createElement('input');
      input.dataset.binding = action.id;
      input.maxLength = 60;
      input.setAttribute('aria-label', action.label + ' binding');
      row.append(
        document.createTextNode(action.label + ' · ' + action.context + ' · default ' + action.binding),
        input,
      );
      const record = button('', 'Record', () => {
        input.focus();
        input.dataset.recording = 'true';
        this.status.textContent = 'Press the shortcut chord; Escape cancels recording';
      });
      record.setAttribute('aria-label', 'Record ' + action.label + ' shortcut');
      row.append(record);
      input.addEventListener('keydown', (event) => {
        if (input.dataset.recording !== 'true') return;
        if (event.isComposing || event.key === 'Process') return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key !== 'Escape' && !['Control', 'Alt', 'Meta', 'Shift'].includes(event.key)) {
          input.value = bindingFor(event);
          delete input.dataset.recording;
          this.validate();
        } else if (event.key === 'Escape') {
          delete input.dataset.recording;
          this.validate();
        }
      });
      input.addEventListener('blur', () => delete input.dataset.recording);
      input.addEventListener('input', () => this.validate());
      this.inputs.set(action.id, input);
      this.list.append(row);
    }
    this.root.append(
      info,
      this.list,
      this.status,
      button('shortcut-save', 'Save shortcuts', () => this.save()),
      button('shortcut-reset', 'Restore default shortcuts', () => this.reset()),
      button('shortcut-close', 'Close', () => this.root.close()),
    );
    document.body.append(this.root);
    this.runtime.addEventListener('change', this.changed);
  }
  private sync(): void {
    this.draft = { ...this.runtime.bindings };
    for (const [id, input] of this.inputs) input.value = this.draft[id] ?? '';
  }
  private validate(): string[] {
    this.draft = Object.fromEntries([...this.inputs].map(([id, input]) => [id, input.value.trim()]));
    const errors = validateBindings(this.draft);
    this.status.textContent = errors.join('; ') || 'Bindings are valid; Save applies them';
    const save = this.root.querySelector<HTMLButtonElement>('#shortcut-save');
    if (save) save.disabled = errors.length > 0;
    return errors;
  }
  private changed = (): void => {
    if (this.root.open) {
      this.stale = true;
      this.status.textContent = 'Shortcuts changed in another tab; close and reopen to edit the latest bindings';
    } else this.sync();
  };
  private write(bindings: Bindings): void {
    if (this.stale) throw new Error('Shortcuts changed in another tab; close and reopen before saving');
    this.runtime.write(bindings, this.expected);
    this.expected = this.runtime.raw;
    this.stale = false;
    this.sync();
  }
  private save(): void {
    if (this.validate().length) return;
    try {
      this.write(this.draft);
      this.root.close();
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : 'Could not save shortcuts';
    }
  }
  private reset(): void {
    try {
      this.write(defaultBindings());
      this.status.textContent = 'Default shortcuts restored; other settings are unchanged';
      this.validate();
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : 'Could not restore shortcuts';
    }
  }
  open(): void {
    if (privacyEnabled()) return;
    this.stale = false;
    this.expected = this.runtime.raw;
    this.sync();
    this.status.textContent = this.runtime.error;
    showPanel(this.root);
    this.inputs.values().next().value?.focus();
  }
  close(): void {
    this.root.close();
  }
  stop(): void {
    this.runtime.removeEventListener('change', this.changed);
    this.root.remove();
  }
}
