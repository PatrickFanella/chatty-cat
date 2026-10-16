import { showPanel } from './shell/open-panel';
import { privacyEnabled } from './privacy';
import type { SplitLayout } from './splits';
export interface SplitSettingsHost {
  layout: SplitLayout;
  dialog: HTMLDialogElement;
  status: HTMLElement;
  joined: readonly string[];
  actions: {
    target: (channel: string) => void;
    changed: () => void;
    rules?: () => readonly { id: string; name: string }[];
  };
  available: () => boolean;
  canChange: () => boolean;
  run: (action: () => void) => void;
  captureReaders: () => void;
  rebuild: () => void;
}
function button(label: string, action: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.addEventListener('click', action);
  return node;
}

export class SplitSettingsUI {
  constructor(private host: SplitSettingsHost) {}
  rename(): void {
    if (privacyEnabled()) return;
    this.host.dialog.replaceChildren();
    const form = document.createElement('form'),
      input = document.createElement('input');
    input.value = this.host.layout.activeTab.name;
    input.maxLength = 60;
    input.setAttribute('aria-label', 'Tab name');
    const tab = this.host.layout.activeTab.id;
    const submit = button('Save', () => {
      if (!this.host.available() || this.host.layout.activeTab.id !== tab) return;
      this.host.run(() => this.host.layout.renameTab(this.host.layout.activeTab.id, input.value));
      if (!this.host.status.textContent) this.host.dialog.close();
    });
    form.append(
      input,
      submit,
      button('Cancel', () => this.host.dialog.close()),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit.click();
    });
    this.host.dialog.append(form);
    showPanel(this.host.dialog);
  }
  configure(id: string): void {
    if (privacyEnabled() || !this.host.canChange()) return;
    const pane = this.host.layout.activeTab.panes.find((p) => p.id === id);
    if (!pane) return;
    this.host.dialog.replaceChildren();
    const form = document.createElement('form');
    form.className = 'split-form';
    const channels = document.createElement('fieldset'),
      legend = document.createElement('legend');
    legend.textContent = 'Display channels';
    channels.append(legend);
    const checks = this.host.joined.map((channel) => {
      const label = document.createElement('label'),
        check = document.createElement('input');
      check.type = 'checkbox';
      check.value = channel;
      check.checked = pane.channels.includes(channel);
      label.append(check, channel);
      channels.append(label);
      return check;
    });
    const target = document.createElement('select');
    target.setAttribute('aria-label', 'Pane send target');
    for (const channel of this.host.joined) {
      const option = document.createElement('option');
      option.value = channel;
      option.textContent = channel;
      target.append(option);
    }
    target.value = pane.target;
    const filter = document.createElement('input');
    filter.type = 'search';
    filter.maxLength = 200;
    filter.value = pane.filter;
    filter.setAttribute('aria-label', 'Pane text filter');
    filter.placeholder = 'Only messages containing…';
    const checkbox = (text: string, on: boolean): { label: HTMLLabelElement; input: HTMLInputElement } => {
      const label = document.createElement('label'),
        input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = on;
      label.append(input, text);
      return { label, input };
    };
    const ruleChoices = document.createElement('fieldset'),
      ruleLegend = document.createElement('legend');
    ruleLegend.textContent = 'Message rules for this pane';
    ruleChoices.append(ruleLegend);
    const ruleChecks = (this.host.actions.rules?.() ?? []).map((rule) => {
      const choice = checkbox(rule.name, (pane.rules ?? []).includes(rule.id));
      choice.input.value = rule.id;
      ruleChoices.append(choice.label);
      return choice.input;
    });
    const reverse = checkbox('Newest first', pane.reverse),
      hover = checkbox('Pause on hover', pane.pauseHover);
    const error = document.createElement('p');
    error.setAttribute('role', 'status');
    const tab = this.host.layout.activeTab.id;
    const save = button('Apply pane settings', () => {
      if (!this.host.available() || this.host.layout.activeTab.id !== tab) return;
      this.host.captureReaders();
      try {
        this.host.layout.configure(id, {
          channels: checks.filter((c) => c.checked).map((c) => c.value),
          target: target.value,
          filter: filter.value,
          rules: ruleChecks.filter((c) => c.checked).map((c) => c.value),
          reverse: reverse.input.checked,
          pauseHover: hover.input.checked,
        });
        if (this.host.layout.activePane.id === id) this.host.actions.target(target.value);
        this.host.rebuild();
        this.host.dialog.close();
        this.host.actions.changed();
      } catch (e) {
        error.textContent = e instanceof Error ? e.message : 'Invalid pane';
      }
    });
    form.append(
      channels,
      target,
      filter,
      ruleChoices,
      reverse.label,
      hover.label,
      error,
      save,
      button('Cancel', () => this.host.dialog.close()),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      save.click();
    });
    this.host.dialog.append(form);
    showPanel(this.host.dialog);
  }
}
