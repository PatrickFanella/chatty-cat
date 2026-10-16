import { showPanel } from './shell/open-panel';
import type { Panel } from './shell/panels';
import { getProfileScope } from './account-profiles';
import { planChatterinoImport, type ChatterinoSources, type ChatterinoImport } from './chatterino-import';
import { privacyEnabled } from './privacy';
import { WorkspaceStore, parseSnapshot, workspaceFile, type WorkspaceSnapshot } from './workspaces';

export class ChatterinoImportPanel implements Panel {
  readonly id = 'chatterino-import-panel';
  readonly title = 'Import Chatterino';
  readonly group = 'tools';
  readonly root = document.createElement('dialog');
  private account = getProfileScope();
  private generation = 0;
  private pending: { plan: ChatterinoImport; current: string; saved: string; recovery: string } | undefined;
  private report = document.createElement('pre');
  private status = document.createElement('p');
  private recovery = document.createElement('pre');
  private apply: HTMLButtonElement;
  private url: string | undefined;
  constructor(
    private store: WorkspaceStore,
    private capture: () => WorkspaceSnapshot,
    private readonlyView = false,
  ) {
    this.root.id = this.id;
    this.root.setAttribute('aria-label', 'Import Chatterino settings');
    this.root.innerHTML =
      '<h2>Import Chatterino settings</h2><p>Choose local Chatterino 2.5.6 JSON files or paste their contents. Review supported settings, commands and Twitch layouts before saving new workspace copies. Files stay in this browser. Credentials, private channel panes and native scripts are excluded. Current settings stay active until you switch workspaces.</p><label>Imported workspace name<input aria-label="Imported workspace name" maxlength="55" value="Chatterino"></label>';
    for (const [part, label] of [
      ['settings', 'settings.json'],
      ['layout', 'window-layout.json'],
      ['commands', 'commands.json'],
    ] as const) {
      const wrapper = document.createElement('label');
      wrapper.textContent = label + ' (optional)';
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = '.json,application/json';
      file.setAttribute('aria-label', 'Choose ' + label);
      const input = document.createElement('textarea');
      input.rows = 4;
      input.maxLength = 256 * 1024;
      input.dataset.source = part;
      input.setAttribute('aria-label', 'Chatterino ' + part + ' JSON');
      wrapper.append(file, input);
      this.root.append(wrapper);
      file.addEventListener('change', () => {
        this.invalidate();
        const selected = file.files?.[0],
          generation = this.generation;
        if (!selected) return;
        if (selected.size > 256 * 1024) {
          this.status.textContent = 'Each file must be at most 256 KB';
          return;
        }
        void selected
          .text()
          .then((raw) => {
            if (generation !== this.generation || privacyEnabled()) return;
            this.scope();
            input.value = raw;
            this.status.textContent = 'File read locally; review before saving';
          })
          .catch(() => {
            if (generation === this.generation) this.status.textContent = 'File could not be read for this account';
          });
      });
    }
    this.report.setAttribute('aria-label', 'Chatterino import review');
    this.recovery.setAttribute('aria-label', 'Workspace recovery preview');
    this.status.setAttribute('role', 'status');
    this.root.append(
      this.button('Review Chatterino import', () => this.review()),
      this.report,
      this.button('Preview recovery export', () => {
        this.requirePlan();
        this.recovery.textContent = this.pending!.recovery;
      }),
      this.button('Download recovery export', () => this.download()),
    );
    this.apply = this.button('Save imported workspace copies', () => this.commit());
    this.apply.disabled = true;
    this.root.append(
      this.apply,
      this.button('Close import', () => this.root.close()),
      this.recovery,
      this.status,
    );
    document.body.append(this.root);
    this.root.addEventListener('input', this.invalidate);
    this.root.addEventListener('close', this.closed);
    document.addEventListener('privacychange', this.privacy);
  }
  private button(text: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', () => {
      try {
        if (this.readonlyView || privacyEnabled()) throw new Error('Import is unavailable in this view');
        this.scope();
        action();
      } catch (e) {
        this.status.textContent = e instanceof Error ? e.message : 'Import unavailable';
      }
    });
    return button;
  }
  private scope(): void {
    if (getProfileScope() !== this.account) throw new Error('Account changed; reload before importing');
  }
  private requirePlan(): void {
    if (!this.pending) throw new Error('Review Chatterino files before saving or exporting');
  }
  private invalidate = (): void => {
    this.pending = undefined;
    this.apply.disabled = true;
    this.report.textContent = '';
    this.recovery.textContent = '';
    this.generation++;
  };
  private review(): void {
    this.invalidate();
    const sources: ChatterinoSources = {};
    for (const input of this.root.querySelectorAll<HTMLTextAreaElement>('textarea[data-source]')) {
      switch (input.dataset.source) {
        case 'settings':
          sources.settings = input.value;
          break;
        case 'layout':
          sources.layout = input.value;
          break;
        case 'commands':
          sources.commands = input.value;
          break;
      }
    }
    const current = parseSnapshot(this.capture()),
      saved = this.store.all(),
      name = this.root.querySelector<HTMLInputElement>('[aria-label="Imported workspace name"]')!.value;
    const plan = planChatterinoImport(sources, current, name);
    if (saved.length + plan.workspaces.length > 20) throw new Error('Import exceeds 20 workspaces');
    workspaceFile([...saved, ...plan.workspaces.map((w) => ({ ...w, id: crypto.randomUUID() }))]);
    const active = this.store.active,
      recovery = workspaceFile(saved.map((w) => (active?.id === w.id ? { ...w, ...current } : w)));
    this.pending = { plan, current: JSON.stringify(current), saved: JSON.stringify(saved), recovery };
    this.report.textContent =
      'Existing workspaces retained: ' +
      saved.map((w) => w.name).join(', ') +
      '\n' +
      plan.report.join('\n') +
      '\nNew copies: ' +
      plan.workspaces.map((w) => w.name).join(', ');
    this.apply.disabled = false;
    this.status.textContent =
      'Reviewed locally. Recovery export contains supported public settings and command text only. Originals stay saved; import sends no chat.';
  }
  private commit(): void {
    this.requirePlan();
    const pending = this.pending!;
    if (
      JSON.stringify(parseSnapshot(this.capture())) !== pending.current ||
      JSON.stringify(this.store.all()) !== pending.saved
    )
      throw new Error('Current view or saved workspaces changed; review again');
    this.store.import(pending.plan.workspaces);
    this.closed();
    this.status.textContent =
      'Imported copies saved. Open Workspaces to review a switch; current settings and drafts are retained.';
  }
  private download(): void {
    this.requirePlan();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(new Blob([this.pending!.recovery], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = this.url;
    a.download = 'chatty-cat-before-chatterino-import.json';
    a.click();
    this.status.textContent = 'Recovery export prepared; verify the download before changing workspaces';
  }
  open = (): void => {
    if (this.readonlyView || privacyEnabled()) return;
    try {
      this.scope();
      showPanel(this.root);
    } catch (e) {
      this.status.textContent = e instanceof Error ? e.message : 'Import unavailable';
    }
  };
  private closed = (): void => {
    this.invalidate();
    for (const input of this.root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('textarea,input[type=file]'))
      input.value = '';
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined;
    document.getElementById('topbar')?.querySelector<HTMLButtonElement>('button')?.focus();
  };
  private privacy = (): void => {
    if (privacyEnabled()) {
      this.closed();
      if (this.root.open) this.root.close();
    }
  };
  close(): void {
    this.root.close();
  }
  stop(): void {
    this.closed();
    this.root.removeEventListener('input', this.invalidate);
    this.root.removeEventListener('close', this.closed);
    document.removeEventListener('privacychange', this.privacy);
    this.root.remove();
  }
}
