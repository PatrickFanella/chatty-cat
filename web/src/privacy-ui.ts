import {
  PRIVACY_KEY,
  resetPrivacyFallback,
  readPrivacy,
  savePrivacy,
  workspaceVisible,
  type PrivacyPolicy,
} from './privacy';
import type { WorkspaceStore } from './workspaces';
export class PrivacyControls {
  policy: PrivacyPolicy = readPrivacy();
  private toolbar = document.createElement('aside');
  private toggle = document.createElement('button');
  private configure = document.createElement('button');
  private status = document.createElement('span');
  constructor(
    readonly workspaces: WorkspaceStore,
    private current: () => string,
  ) {
    this.toolbar.id = 'privacy-toolbar';
    this.toolbar.setAttribute('aria-label', 'Streamer privacy');
    this.toggle.id = 'privacy-toggle';
    this.toggle.type = 'button';
    this.toggle.setAttribute('aria-keyshortcuts', 'Alt+Shift+P');
    this.toggle.addEventListener('click', this.change);
    this.configure.type = 'button';
    this.configure.textContent = 'Privacy settings';
    this.configure.addEventListener('click', this.open);
    this.status.role = 'status';
    this.toolbar.append(this.toggle, this.configure, this.status);
    document.body.prepend(this.toolbar);
    window.addEventListener('storage', this.storage);
    document.addEventListener('keydown', this.panic, true);
    this.paint();
  }
  private paint(): void {
    const root = document.documentElement;
    root.dataset.privacy = String(this.policy.enabled);
    root.dataset.workspaceVisible = String(workspaceVisible(this.policy, this.current()));
    this.toggle.textContent = this.policy.enabled ? 'Exit privacy mode' : 'Enable privacy mode';
    this.toggle.setAttribute('aria-pressed', String(this.policy.enabled));
    this.configure.disabled = this.policy.enabled;
    this.status.textContent = this.policy.enabled
      ? workspaceVisible(this.policy, this.current())
        ? 'Public workspace visible · private content hidden'
        : 'Workspace hidden · Alt+Shift+P panic hide'
      : 'Privacy off · Alt+Shift+P panic hide';
    if (this.policy.enabled) {
      document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((dialog) => dialog.close());
      this.toggle.focus({ preventScroll: true });
    }
    document.dispatchEvent(new Event('privacychange'));
  }
  commit(next: PrivacyPolicy): void {
    try {
      savePrivacy(next);
      this.policy = next;
      this.paint();
    } catch (error) {
      this.policy = readPrivacy();
      this.paint();
      this.status.textContent = error instanceof Error ? error.message : 'Privacy save failed; this tab is hidden';
    }
  }
  private change = (): void => {
    this.commit({ ...this.policy, enabled: !this.policy.enabled, panic: false });
  };
  private open = (): void => {
    document.dispatchEvent(new Event('open-privacy-settings'));
  };
  private panic = (event: KeyboardEvent): void => {
    if (
      event.isComposing ||
      !event.altKey ||
      !event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.code !== 'KeyP'
    )
      return;
    event.preventDefault();
    this.commit({ ...this.policy, enabled: true, panic: true });
  };
  private storage = (event: StorageEvent): void => {
    if (event.key === PRIVACY_KEY || event.key === null) {
      resetPrivacyFallback();
      this.policy = readPrivacy();
      this.paint();
    }
  };
  stop(): void {
    window.removeEventListener('storage', this.storage);
    document.removeEventListener('keydown', this.panic, true);
    this.toggle.removeEventListener('click', this.change);
    this.configure.removeEventListener('click', this.open);
    this.toolbar.remove();
  }
}
