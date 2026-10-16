import { showPanel } from './open-panel';
// Command palette: one search box over every registered command, the keyboard actions and quick-switch targets.
import { CommandRegistry, GROUP_LABELS, type Command } from './registry';
export interface PaletteEntry {
  id: string;
  label: string;
  context: string;
  hint?: string | undefined;
  enabled?: boolean | undefined;
  run: () => void;
}
export function scoreMatch(query: string, text: string): number {
  if (!query) return 1;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  if (haystack.startsWith(needle)) return 3;
  if (haystack.includes(needle)) return 2;
  // Subsequence match for abbreviations such as "prvact" → Provider activity.
  let at = 0;
  for (const char of needle) {
    at = haystack.indexOf(char, at);
    if (at < 0) return 0;
    at++;
  }
  return 1;
}
export class CommandPalette {
  private dialogRoot: HTMLDialogElement | undefined;
  get dialog(): HTMLDialogElement {
    this.mount();
    return this.dialogRoot!;
  }
  private input!: HTMLInputElement;
  private list!: HTMLDivElement;
  private status!: HTMLParagraphElement;
  private entries: PaletteEntry[] = [];
  private selected = 0;
  constructor(
    private registry: CommandRegistry,
    private extra: () => PaletteEntry[],
  ) {}
  private mount(): void {
    if (this.dialogRoot) return;
    this.dialogRoot = document.createElement('dialog');
    this.input = document.createElement('input');
    this.list = document.createElement('div');
    this.status = document.createElement('p');
    this.dialog.id = 'shell-palette';
    this.dialog.setAttribute('aria-label', 'Search commands');
    this.dialog.dataset.shellOwned = 'true';
    this.input.type = 'search';
    this.input.placeholder = 'Search commands, panels, channels…';
    this.input.setAttribute('aria-label', 'Search commands');
    this.input.autocomplete = 'off';
    this.input.maxLength = 200;
    this.list.className = 'shell-palette-list';
    this.list.setAttribute('role', 'listbox');
    this.list.id = 'shell-palette-list';
    this.input.setAttribute('aria-controls', this.list.id);
    this.status.className = 'shell-palette-status';
    this.status.setAttribute('role', 'status');
    this.dialog.append(this.input, this.list, this.status);
    document.body.append(this.dialog);
    this.input.addEventListener('input', this.paint);
    this.input.addEventListener('keydown', this.keys);
    this.list.addEventListener('click', (event) => {
      const option = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (option) this.execute(Number(option.dataset.index));
    });
    this.list.addEventListener('pointermove', (event) => {
      const option = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (option && Number(option.dataset.index) !== this.selected) {
        this.selected = Number(option.dataset.index);
        this.mark();
      }
    });
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.dialog.close();
    });
  }
  get open(): boolean {
    return this.dialogRoot?.open ?? false;
  }
  show(): void {
    if (this.dialog.open) return;
    this.input.value = '';
    this.selected = 0;
    this.status.textContent = '';
    showPanel(this.dialog);
    this.paint();
    this.input.focus();
  }
  toggle(): void {
    if (this.dialogRoot?.open) this.dialogRoot.close();
    else this.show();
  }
  private candidates(): PaletteEntry[] {
    const commands: PaletteEntry[] = this.registry
      .all()
      .sort((a, b) => Number(a.id.startsWith('action:')) - Number(b.id.startsWith('action:')))
      .map((command: Command) => ({
        id: command.id,
        label: command.label,
        context: GROUP_LABELS[command.group],
        hint: command.hint,
        enabled: command.available?.() ?? true,
        run: command.run,
      }));
    return [...commands, ...this.extra()];
  }
  private paint = (): void => {
    const query = this.input.value.trim();
    this.entries = this.candidates()
      .map((entry) => ({ entry, score: scoreMatch(query, entry.label + ' ' + entry.context) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.entry)
      .slice(0, 60);
    this.selected = Math.min(this.selected, Math.max(0, this.entries.length - 1));
    this.list.replaceChildren(
      ...this.entries.map((entry, index) => {
        const option = document.createElement('div');
        option.setAttribute('role', 'option');
        option.dataset.index = String(index);
        option.id = 'shell-palette-option-' + index;
        option.className = 'shell-palette-option' + (entry.enabled === false ? ' is-unavailable' : '');
        const label = document.createElement('span');
        label.className = 'shell-palette-label';
        label.textContent = entry.label;
        const context = document.createElement('span');
        context.className = 'shell-palette-context';
        context.textContent = entry.context;
        option.append(label, context);
        if (entry.hint) {
          const hint = document.createElement('kbd');
          hint.textContent = entry.hint;
          option.append(hint);
        }
        return option;
      }),
    );
    this.status.textContent = this.entries.length ? '' : 'No matching commands';
    this.mark();
  };
  private mark(): void {
    for (const option of this.list.children) {
      const selected = Number((option as HTMLElement).dataset.index) === this.selected;
      option.setAttribute('aria-selected', String(selected));
      if (selected) {
        this.input.setAttribute('aria-activedescendant', option.id);
        (option as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    }
  }
  private keys = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.entries.length) return;
      this.selected =
        (this.selected + (event.key === 'ArrowDown' ? 1 : -1) + this.entries.length) % this.entries.length;
      this.mark();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.execute(this.selected);
    }
  };
  private execute(index: number): void {
    const entry = this.entries[index];
    if (!entry) return;
    if (entry.enabled === false) {
      this.status.textContent = 'Unavailable in the current view or account';
      return;
    }
    this.dialog.close();
    try {
      entry.run();
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : 'Command failed';
      showPanel(this.dialog);
      this.input.focus();
    }
  }
  stop(): void {
    this.dialogRoot?.remove();
    this.dialogRoot = undefined;
    this.entries = [];
  }
}
