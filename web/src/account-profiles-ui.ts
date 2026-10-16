import { showPanel } from './shell/open-panel';
import type { Panel } from './shell/panels';
import { AccountProfiles } from './account-profiles';
import type { AuthStatus } from './auth';
import { privacyEnabled } from './privacy';
export class AccountControls implements Panel {
  readonly id = 'account-profiles';
  readonly title = 'Accounts';
  readonly group = 'account';
  readonly root = document.createElement('dialog');
  private list = document.createElement('div');
  private status = document.createElement('p');
  private auth: AuthStatus | undefined;
  private busy = false;
  private disposed = false;
  constructor(
    _anchor: HTMLElement,
    private change: (target: string | undefined) => Promise<void>,
  ) {
    this.root.id = 'account-profiles';
    this.root.setAttribute('aria-label', 'Account profiles');
    const title = document.createElement('h2');
    title.textContent = 'Account profiles';
    const help = document.createElement('p');
    help.textContent =
      'Saved profiles remember up to eight account names on this device. Switching signs out the current account and opens Twitch consent; select the requested account there. Tokens stay on the server. Preferences, drafts and private data stay with their account. Forget removes the saved name and signs out if active; it keeps local data so reconnecting can restore it.';
    this.status.setAttribute('role', 'status');
    this.root.append(
      title,
      this.button('Close accounts', () => this.root.close()),
      help,
      this.list,
      this.button('Add Twitch account', () => void this.run(undefined)),
      this.status,
    );
    document.body.append(this.root);
    document.addEventListener('privacychange', this.privacy);
  }
  private button(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      if (!this.busy && !privacyEnabled()) action();
    });
    return button;
  }
  setAuth(auth: AuthStatus | undefined): void {
    this.auth = auth;
    if (auth?.authenticated) {
      try {
        const store = new AccountProfiles();
        const old = store.list().find((p) => p.id === auth.userID);
        if (!old || old.login !== auth.login) store.remember(auth.userID!, auth.login!);
      } catch (e) {
        this.status.textContent = e instanceof Error ? e.message : 'Account profile unavailable';
      }
    }
    if (this.root.open) this.paint();
  }
  open = (): void => {
    if (privacyEnabled()) return;
    this.status.textContent = '';
    this.paint();
    showPanel(this.root);
  };
  private paint(): void {
    this.list.replaceChildren();
    if (privacyEnabled()) return;
    try {
      const profiles = new AccountProfiles().list();
      for (const profile of profiles) {
        const row = document.createElement('p'),
          active = this.auth?.authenticated && this.auth.userID === profile.id;
        row.append(
          document.createTextNode(profile.login + (active ? ' · active sender' : ' · saved, consent required') + ' '),
        );
        const switchButton = this.button('Switch to ' + profile.login, () => void this.run(profile.id));
        switchButton.disabled = !!active || !this.auth || this.busy;
        row.append(
          switchButton,
          this.button('Forget ' + profile.login, () => void this.forget(profile.id)),
        );
        this.list.append(row);
      }
      for (const button of this.root.querySelectorAll('button'))
        if (button.textContent === 'Add Twitch account')
          button.disabled = !this.auth?.enabled || this.busy || profiles.length >= 8;
    } catch (e) {
      this.status.textContent = e instanceof Error ? e.message : 'Saved profiles unavailable';
    }
  }
  private async run(target: string | undefined): Promise<void> {
    if (!this.auth?.enabled) return;
    this.busy = true;
    this.paint();
    this.status.textContent = 'Signing out before Twitch account consent…';
    try {
      await this.change(target);
    } catch (e) {
      if (!this.disposed) this.status.textContent = e instanceof Error ? e.message : 'Account could not be changed';
    } finally {
      this.busy = false;
      if (!this.disposed) this.paint();
    }
  }
  private async forget(id: string): Promise<void> {
    this.busy = true;
    this.paint();
    try {
      if (this.auth?.authenticated && this.auth.userID === id) await this.change('');
      new AccountProfiles().forget(id);
      this.status.textContent = 'Saved account name forgotten; local account data retained';
    } catch (e) {
      this.status.textContent = e instanceof Error ? e.message : 'Profile could not be forgotten';
    } finally {
      this.busy = false;
      this.paint();
    }
  }
  private privacy = (): void => {
    if (privacyEnabled()) {
      this.list.replaceChildren();
      this.status.textContent = '';
      if (this.root.open) this.root.close();
    }
  };
  close(): void {
    this.root.close();
  }
  stop(): void {
    this.disposed = true;
    document.removeEventListener('privacychange', this.privacy);
    this.root.remove();
  }
}
