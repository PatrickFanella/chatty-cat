import { showPanel } from './shell/open-panel';
import type { PrivacyControls } from './privacy-ui';
import type { Panel } from './shell/panels';
export class PrivacySettingsPanel implements Panel {
  readonly id = 'privacy-settings';
  readonly title = 'Privacy settings';
  readonly group = 'view';
  readonly root = document.createElement('dialog');
  private choices = document.createElement('fieldset');
  constructor(private controls: PrivacyControls) {
    this.root.id = this.id;
    this.root.setAttribute('aria-label', 'Streamer privacy settings');
    const info = document.createElement('p');
    info.textContent =
      'Choose workspaces allowed on screen while privacy mode is active. Account details, composer, whispers, alerts and settings exports stay hidden. Alt+Shift+P panic-hides every workspace. Privacy mode is manual; no process detection is used.';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Save and close';
    close.addEventListener('click', () => {
      const allowed = [...this.choices.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => input.value);
      this.root.close();
      this.controls.commit({ ...this.controls.policy, allowed });
    });
    this.root.append(info, this.choices, close);
    document.body.append(this.root);
  }
  open(): void {
    if (this.controls.policy.enabled) return;
    this.choices.replaceChildren();
    const legend = document.createElement('legend');
    legend.textContent = 'Visible workspaces';
    this.choices.append(legend);
    for (const workspace of this.controls.workspaces.all()) {
      const label = document.createElement('label'),
        input = document.createElement('input');
      input.type = 'checkbox';
      input.value = workspace.id;
      input.checked = this.controls.policy.allowed.includes(workspace.id);
      label.append(input, document.createTextNode(workspace.name));
      this.choices.append(label);
    }
    showPanel(this.root);
  }
  close(): void {
    this.root.close();
  }
  stop(): void {
    this.root.remove();
  }
}
