import { showPanel } from './shell/open-panel';
import type { Panel } from './shell/panels';
import type { AuthStatus } from './auth';
import { getProfileScope } from './account-profiles';
import { privacyEnabled } from './privacy';
import { parseExtension, ExtensionStore, type ExtensionManifest } from './extensions';
import { ExtensionRuntime } from './extension-runtime';
type Review =
  | { kind: 'install'; manifest: ExtensionManifest; account: string }
  | { kind: 'enable' | 'remove'; id: string; manifest: string; account: string };
export class ExtensionsPanel implements Panel {
  readonly id = 'extensions-panel';
  readonly title = 'Web extensions';
  readonly group = 'tools';
  readonly root = document.createElement('dialog');
  private file = document.createElement('input');
  private selected = document.createElement('select');
  private contribution = document.createElement('select');
  private input = document.createElement('textarea');
  private exact = document.createElement('textarea');
  private output = document.createElement('textarea');
  private status = document.createElement('p');
  private confirm = document.createElement('button');
  private stage = document.createElement('button');
  private store: ExtensionStore | undefined;
  private runtime = new ExtensionRuntime();
  private pending: Review | undefined;
  private generation = 0;
  private running = false;
  private observed = '';
  private result: { extension: string; manifest: string; account: string; text: string } | undefined;
  constructor(
    private auth: () => AuthStatus | undefined,
    private channel: () => string,
    private stageDraft: (text: string) => void,
    private hidden = false,
  ) {
    this.observed = this.identity();
    this.root.id = this.id;
    this.root.setAttribute('aria-label', 'Local web extensions');
    const h = document.createElement('h2');
    h.textContent = 'Optional local text extensions';
    const help = document.createElement('p');
    help.textContent =
      'Version 1 supports declarative text commands and views, not JavaScript or Chatterino Lua. Review each manifest and its channel/input/draft permissions. Install starts disabled; enabling requires separate permission review. Each action uses an opaque sandbox with no network, storage, private account state or native command API. Output is plain text. Staging a draft requires its declared permission and a separate click; normal Send remains separate. Extensions are account-local and excluded from device sync.';
    this.file.type = 'file';
    this.file.accept = 'application/json,.json';
    this.file.setAttribute('aria-label', 'Extension manifest file');
    this.selected.setAttribute('aria-label', 'Installed extension');
    this.contribution.setAttribute('aria-label', 'Extension command or view');
    this.input.maxLength = 500;
    this.input.setAttribute('aria-label', 'Text explicitly supplied to extension');
    this.exact.readOnly = true;
    this.exact.rows = 8;
    this.exact.setAttribute('aria-label', 'Exact extension permission review');
    this.output.readOnly = true;
    this.output.rows = 6;
    this.output.setAttribute('aria-label', 'Plain extension output');
    this.status.setAttribute('role', 'status');
    this.confirm = this.button('Confirm reviewed extension change', () => this.commit());
    this.confirm.disabled = true;
    this.stage = this.button('Stage extension output in draft', () => this.stageOutput());
    this.stage.disabled = true;
    const disable = document.createElement('button');
    disable.type = 'button';
    disable.textContent = 'Disable selected extension now';
    disable.addEventListener('click', () => {
      this.invalidate();
      try {
        this.context();
        this.store!.enable(this.selected.value, false);
        this.paint();
        this.status.textContent = 'Extension disabled';
      } catch (e) {
        this.error(e);
      }
    });
    this.root.append(
      h,
      help,
      this.file,
      this.button('Review extension install', () => this.reviewInstall()),
      this.selected,
      this.button('Review enable permissions', () => this.review('enable')),
      disable,
      this.button('Review remove extension', () => this.review('remove')),
      this.exact,
      this.confirm,
      this.contribution,
      this.input,
      this.button('Run selected extension command/view', () => this.run()),
      this.output,
      this.stage,
      this.button('Export selected manifest', () => this.export()),
      this.button('Close extensions', () => this.root.close()),
      this.status,
    );
    document.body.append(this.root);
    this.root.addEventListener('close', this.closed);
    this.root.addEventListener('change', this.edited);
    this.input.addEventListener('input', this.edited);
    document.addEventListener('privacychange', this.privacy);
  }
  private context(): string {
    const a = this.auth();
    if (privacyEnabled() || !a?.authenticated || !a.userID || getProfileScope() !== a.userID)
      throw new Error('Use the current signed-in account outside privacy mode');
    if (!this.store) this.store = new ExtensionStore(a.userID);
    this.store.all();
    return a.userID;
  }
  private button(text: string, action: () => void | Promise<void>): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => {
      if (this.running) return;
      try {
        if (privacyEnabled()) throw new Error('Exit privacy mode');
        void Promise.resolve(action()).catch((e) => this.error(e));
      } catch (e) {
        this.error(e);
      }
    });
    return b;
  }
  private error(e: unknown): void {
    this.status.textContent = e instanceof Error ? e.message : 'Extension unavailable';
  }
  private paint(): void {
    const previous = this.selected.value;
    this.selected.replaceChildren();
    this.contribution.replaceChildren();
    for (const e of this.store?.all() ?? []) {
      const o = document.createElement('option');
      o.value = e.manifest.id;
      o.textContent = e.manifest.name + (e.enabled ? ' · enabled' : ' · disabled');
      this.selected.append(o);
      if (e.enabled)
        for (const [kind, list] of [
          ['command', e.manifest.commands],
          ['view', e.manifest.views],
        ] as const)
          for (const c of list) {
            const action = document.createElement('option');
            action.value = e.manifest.id + '/' + kind + '/' + c.id;
            action.textContent = e.manifest.name + ' / ' + kind + ': ' + c.title;
            this.contribution.append(action);
          }
    }
    this.selected.value = [...this.selected.options].some((o) => o.value === previous)
      ? previous
      : (this.selected.options[0]?.value ?? '');
    this.contribution.value = this.contribution.options[0]?.value ?? '';
  }
  private async reviewInstall(): Promise<void> {
    const account = this.context(),
      generation = this.generation,
      file = this.file.files?.[0];
    if (!file || file.size > 16384) throw new Error('Choose an extension JSON file up to 16 KiB');
    const manifest = parseExtension(JSON.parse(await file.text()));
    if (generation !== this.generation || account !== this.context()) throw new Error('Extension account changed');
    this.pending = { kind: 'install', manifest, account };
    this.exact.value =
      'Install disabled. Declared permissions: ' +
      manifest.permissions.join(', ') +
      '\n' +
      JSON.stringify(manifest, null, 2);
    this.confirm.disabled = false;
  }
  private review(kind: 'enable' | 'remove'): void {
    const account = this.context(),
      e = this.store!.all().find((e) => e.manifest.id === this.selected.value);
    if (!e) throw new Error('Choose an installed extension');
    this.pending = { kind, id: e.manifest.id, manifest: JSON.stringify(e.manifest), account };
    this.exact.value =
      (kind === 'enable'
        ? 'Enable and grant only these declared permissions: '
        : 'Remove only this installed manifest: ') + JSON.stringify(e.manifest, null, 2);
    this.confirm.disabled = false;
  }
  private commit(): void {
    const p = this.pending,
      account = this.context();
    if (!p || p.account !== account) throw new Error('Review the extension change first');
    if (p.kind === 'install') this.store!.install(p.manifest);
    else {
      if (JSON.stringify(this.store!.all().find((e) => e.manifest.id === p.id)?.manifest) !== p.manifest)
        throw new Error('Extension changed; review again');
      if (p.kind === 'enable') this.store!.enable(p.id, true);
      else this.store!.remove(p.id);
    }
    this.runtime.stop();
    this.clearOutput();
    this.clearReview();
    this.paint();
    this.status.textContent = 'Reviewed extension change saved';
  }
  private async run(): Promise<void> {
    const account = this.context(),
      [extension, kind, id] = this.contribution.value.split('/'),
      e = this.store!.all().find((e) => e.manifest.id === extension && e.enabled);
    if (!e || !id || (kind !== 'command' && kind !== 'view'))
      throw new Error('Choose an enabled extension command/view');
    this.clearOutput();
    this.running = true;
    const generation = this.generation,
      channel = this.channel(),
      input = this.input.value;
    try {
      const text = await this.runtime.run(e.manifest, kind, id, input, channel);
      if (
        generation !== this.generation ||
        this.context() !== account ||
        this.channel() !== channel ||
        this.input.value !== input ||
        !this.store!.all().some(
          (current) => current.enabled && JSON.stringify(current.manifest) === JSON.stringify(e.manifest),
        )
      )
        return;
      this.result = { extension: e.manifest.id, manifest: JSON.stringify(e.manifest), account, text };
      this.output.value = text;
      this.stage.disabled = !e.manifest.permissions.includes('composer:stage');
      this.status.textContent = 'Extension returned plain text; no message sent';
    } finally {
      if (generation === this.generation) this.running = false;
    }
  }
  private stageOutput(): void {
    const account = this.context(),
      result = this.result;
    if (!result || result.account !== account) throw new Error('Run an extension first');
    const e = this.store!.all().find((e) => e.enabled && e.manifest.id === result.extension);
    if (!e || JSON.stringify(e.manifest) !== result.manifest || !e.manifest.permissions.includes('composer:stage'))
      throw new Error('Extension lacks current draft permission');
    this.stageDraft(result.text);
    this.clearOutput();
    this.status.textContent = 'Output staged in draft; review it before using normal Send';
  }
  private export(): void {
    this.context();
    const e = this.store!.all().find((e) => e.manifest.id === this.selected.value);
    if (!e) throw new Error('Choose an extension');
    const url = URL.createObjectURL(new Blob([JSON.stringify(e.manifest, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = e.manifest.id + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  private clearReview(): void {
    this.pending = undefined;
    this.exact.value = '';
    this.confirm.disabled = true;
  }
  private clearOutput(): void {
    this.result = undefined;
    this.output.value = '';
    this.stage.disabled = true;
  }
  private invalidate(): void {
    this.generation++;
    this.runtime.stop();
    this.running = false;
    this.clearReview();
    this.clearOutput();
    this.input.value = '';
    this.file.value = '';
  }
  open = (): void => {
    if (this.hidden) return;
    if (privacyEnabled()) return;
    try {
      this.store = undefined;
      this.context();
      this.paint();
      showPanel(this.root);
    } catch (e) {
      this.error(e);
      showPanel(this.root);
    }
  };
  private closed = (): void => this.invalidate();
  private edited = (): void => {
    this.generation++;
    this.runtime.stop();
    this.running = false;
    this.clearReview();
    this.clearOutput();
  };
  private privacy = (): void => {
    if (privacyEnabled()) {
      this.invalidate();
      this.root.close();
    }
  };
  private identity(): string {
    const a = this.auth();
    return (a?.authenticated ? a.userID + ':' + a.csrf : '') + ':' + getProfileScope();
  }
  authChanged(): void {
    const identity = this.identity();
    if (identity === this.observed) return;
    this.observed = identity;
    this.invalidate();
    this.store = undefined;
    this.selected.replaceChildren();
    this.contribution.replaceChildren();
  }
  actions(): { id: string; label: string; context: string; run: () => void }[] {
    if (privacyEnabled()) return [];
    try {
      this.context();
      return this.store!.all()
        .filter((e) => e.enabled)
        .flatMap((e) =>
          [
            ...e.manifest.commands.map((c) => ({ kind: 'command', ...c })),
            ...e.manifest.views.map((c) => ({ kind: 'view', ...c })),
          ].map((c) => ({
            id: 'extension:' + e.manifest.id + ':' + c.kind + ':' + c.id,
            label: e.manifest.name + ': ' + c.title,
            context: 'local extension',
            run: () => {
              this.open();
              this.contribution.value = e.manifest.id + '/' + c.kind + '/' + c.id;
            },
          })),
        );
    } catch {
      return [];
    }
  }
  selectAction(id: string): void {
    this.open();
    this.contribution.value = id;
  }
  close(): void {
    this.root.close();
  }
  stop(): void {
    this.invalidate();
    this.root.removeEventListener('close', this.closed);
    this.root.removeEventListener('change', this.edited);
    this.input.removeEventListener('input', this.edited);
    document.removeEventListener('privacychange', this.privacy);
    this.root.remove();
  }
}
