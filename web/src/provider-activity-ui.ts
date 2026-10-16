import { showPanel } from './shell/open-panel';
import type { Panel } from './shell/panels';
import type { AuthStatus } from './auth';
import { privacyEnabled } from './privacy';
import { ProviderActivity } from './provider-activity';

export class ProviderActivityPanel implements Panel {
  readonly id = 'provider-activity-panel';
  title = 'Provider activity';
  readonly group = 'providers';
  readonly root = document.createElement('dialog');
  private detail = document.createElement('p');
  private startButton: HTMLButtonElement;
  private controller: ProviderActivity;
  private generation = 0;
  private busy = false;
  private keep = false;
  constructor(
    auth: () => AuthStatus | undefined,
    channel: () => { channel: string; broadcasterID: string } | undefined,
    bttv: (auth: AuthStatus, id: string) => boolean,
    private readonlyView = false,
  ) {
    this.root.id = this.id;
    this.root.setAttribute('aria-label', 'Provider activity');
    const h = document.createElement('h2');
    h.textContent = 'Provider activity sharing';
    const note = document.createElement('p');
    note.textContent =
      'Enable each service in Provider and badge preferences, then review the current account and selected joined channel here. Starting shares your identity and channel with those services now and every five minutes. Each session requires a new review. No Twitch token is sent to either provider. Stopping prevents future announcements; an announcement already sent may remain visible to the provider.';
    this.detail.setAttribute('role', 'status');
    this.controller = new ProviderActivity(auth, channel, bttv, (text) => this.status(text));
    const review = this.button('Review provider activity', () =>
      this.run(async () => {
        this.startButton.disabled = true;
        const text = await this.controller.review();
        this.status(text);
        this.startButton.disabled = false;
      }),
    );
    this.startButton = this.button('Start reviewed provider activity', () =>
      this.run(async () => {
        this.startButton.disabled = true;
        await this.controller.start();
      }),
    );
    this.startButton.disabled = true;
    this.root.append(
      h,
      note,
      review,
      this.startButton,
      this.button('Stop provider activity', () => this.preferencesChanged()),
      this.button('Return to chat; keep activity running', () => {
        if (!this.controller.running) {
          this.status('Start a reviewed session first.');
          return;
        }
        this.keep = true;
        this.root.close();
      }),
      this.button('Stop and close provider activity', () => {
        this.preferencesChanged();
        this.root.close();
      }),
      this.detail,
    );
    this.root.addEventListener('close', this.closed);
    document.addEventListener('privacychange', this.privacy);
    document.body.append(this.root);
  }
  private button(text: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', action);
    return b;
  }
  private status(text: string): void {
    this.detail.textContent = text;
    this.title = this.controller?.running ? 'Provider activity active' : 'Provider activity';
    document.dispatchEvent(new Event('panelstatechange'));
  }
  private run(action: () => Promise<void>): void {
    if (this.busy || privacyEnabled()) return;
    const generation = this.generation;
    this.busy = true;
    void action()
      .catch((error) => {
        if (generation === this.generation)
          this.status(
            (error instanceof Error ? error.message : 'Provider activity unavailable') +
              ' · No automatic retry. Any prior announcement may have reached the provider.',
          );
      })
      .finally(() => {
        if (generation === this.generation) this.busy = false;
      });
  }
  open = (): void => {
    if (this.readonlyView) return;
    if (!privacyEnabled()) showPanel(this.root);
  };
  private closed = (): void => {
    if (this.keep) {
      this.keep = false;
      return;
    }
    this.preferencesChanged();
  };
  private privacy = (): void => {
    if (privacyEnabled()) {
      this.preferencesChanged();
      this.root.close();
    }
  };
  preferencesChanged(): void {
    this.generation++;
    this.busy = false;
    this.controller.cancel();
    this.startButton.disabled = true;
    this.status('Provider activity stopped. Review to start another session.');
  }
  authChanged(): void {
    this.controller.authChanged();
    if (!this.controller.running) this.startButton.disabled = true;
  }
  close(): void {
    this.root.close();
  }
  stop(): void {
    this.generation++;
    this.controller.dispose();
    document.removeEventListener('privacychange', this.privacy);
    this.root.removeEventListener('close', this.closed);
    this.root.remove();
  }
}
