import { profileKey } from './account-profiles';
import { FloatingPanel } from './floating';
import { appendLinks } from './links';
import type { WhisperRuntime } from './whispers-runtime';
import { privacyEnabled } from './privacy';
export class WhisperPanel {
  private floating: FloatingPanel;
  private log: HTMLElement;
  private status: HTMLElement;
  constructor(
    readonly root: HTMLElement,
    private runtime: WhisperRuntime,
    private answer: (login: string) => void,
  ) {
    this.log = root.querySelector('#whisper-log')!;
    this.status = root.querySelector('#whisper-status')!;
    this.floating = new FloatingPanel(
      root,
      root.querySelector('#whisper-handle')!,
      root.querySelector('#whisper-pin')!,
      profileKey('chatthing:v1:whispers:geometry'),
    );
    root.addEventListener('click', this.click);
    root.addEventListener('keydown', this.key);
    runtime.addEventListener('change', this.changed);
    runtime.addEventListener('accountchange', this.accountChanged);
    document.addEventListener('privacychange', this.privacy);
  }
  private accountChanged = (): void => {
    this.close();
    this.log.replaceChildren();
  };
  private changed = (): void => {
    this.status.textContent = this.runtime.status;
    if (!this.root.hidden) this.paint();
  };
  private paint(): void {
    this.log.replaceChildren();
    for (const { message, outgoing } of this.runtime.messages) {
      const row = document.createElement('article');
      row.className = 'whisper-row';
      const time = document.createElement('time');
      time.dateTime = new Date(message.timestamp).toISOString();
      time.textContent = new Date(message.timestamp).toLocaleTimeString();
      const name = document.createElement('button');
      name.type = 'button';
      name.dataset.answer = message.login;
      name.textContent = (outgoing ? 'Requested → ' : '← ') + (message.tags['display-name'] || message.login);
      const text = document.createElement('span');
      appendLinks(text, message.text);
      row.append(time, ' ', name, ' ', text);
      this.log.append(row);
    }
    this.log.scrollTop = this.log.scrollHeight;
  }
  open(): void {
    if (privacyEnabled() || !this.runtime.identity) return;
    this.root.hidden = false;
    this.runtime.setVisible(true);
    this.floating.opened();
    this.status.textContent = this.runtime.status;
    this.paint();
    this.root.querySelector<HTMLElement>('#whisper-close')?.focus();
  }
  close(): void {
    this.root.hidden = true;
    this.runtime.setVisible(false);
    this.log.replaceChildren();
    this.floating.closed();
  }
  private click = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (button?.id === 'whisper-close') this.close();
    else if (button?.dataset.answer && /^[a-z0-9_]{1,25}$/.test(button.dataset.answer))
      this.answer(button.dataset.answer);
  };
  private key = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  };
  private privacy = (): void => {
    if (privacyEnabled()) this.close();
  };
  stop(): void {
    this.runtime.removeEventListener('change', this.changed);
    this.runtime.removeEventListener('accountchange', this.accountChanged);
    document.removeEventListener('privacychange', this.privacy);
    this.root.removeEventListener('click', this.click);
    this.root.removeEventListener('keydown', this.key);
    this.floating.stop();
  }
}
