import { showPanel } from './shell/open-panel';
import { parsePresentation, presentationDefaults, presentationFields, type PresentationOptions } from './presentation';
import type { PresentationRuntime } from './presentation-runtime';
import type { Panel } from './shell/panels';
import { privacyEnabled } from './privacy';
import { panelActions, panelDetails, panelSection } from './panel-sections';

const fieldGroups: ReadonlyArray<readonly [string, readonly (keyof PresentationOptions)[]]> = [
  [
    'Message text',
    [
      'uiScale',
      'boldScale',
      'showTimestamps',
      'timestampFormat',
      'separators',
      'alternating',
      'fadeHistory',
      'collapseLines',
    ],
  ],
  [
    'Names and mentions',
    [
      'usernameMode',
      'boldUsernames',
      'colorUsernames',
      'colorMentions',
      'findAllUsernames',
      'showPronouns',
      'mutedChannels',
    ],
  ],
  [
    'Replies and moderation',
    [
      'deletedLength',
      'hideModerated',
      'hideModerationActions',
      'hideDeletionActions',
      'hideReplyContext',
      'showReplyButton',
      'stripReplyMention',
    ],
  ],
  [
    'Composer',
    [
      'showEmptyInput',
      'showLength',
      'showWait',
      'overflow',
      'pulseSelf',
      'mentionAt',
      'mentionComma',
      'showSendButton',
    ],
  ],
  [
    'Scrolling',
    [
      'scrollMultiplier',
      'smoothScroll',
      'smoothNew',
      'pauseHoverSeconds',
      'pauseModifier',
      'markers',
      'hideScrollbar',
      'paneScrollback',
    ],
  ],
  [
    'Mouse and popups',
    ['rightClick', 'modifiedRightClick', 'rightClickModifier', 'autoCloseUserPopup', 'autoCloseThreadPopup'],
  ],
  [
    'Header and motion',
    ['hideSettings', 'hideAccount', 'animateOnlyFocused', 'headerViewers', 'headerTitle', 'headerUptime', 'headerGame'],
  ],
  ['History and membership', ['showJoins', 'showParts', 'loadHistory', 'historyLimit']],
  ['Last-message marker', ['lastMessage', 'lastPattern', 'lastColor']],
  [
    'Overlay',
    [
      'overlayBackgroundOpacity',
      'overlayShadow',
      'overlayShadowOpacity',
      'overlayShadowColor',
      'overlayShadowOffsetX',
      'overlayShadowOffsetY',
      'overlayShadowRadius',
    ],
  ],
];
export class PresentationPanel implements Panel {
  readonly id = 'presentation-panel';
  readonly title = 'Presentation';
  readonly group = 'view';
  readonly root = document.createElement('dialog');
  constructor(private runtime: PresentationRuntime) {
    this.root.id = 'presentation-panel';
    this.root.setAttribute('aria-label', 'Presentation settings');
    const heading = document.createElement('h2');
    heading.textContent = 'Presentation';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search settings';
    search.setAttribute('aria-label', 'Search presentation settings');
    search.addEventListener('input', () => {
      for (const label of this.root.querySelectorAll<HTMLElement>('[data-setting]'))
        label.hidden = !label.textContent?.toLowerCase().includes(search.value.toLowerCase());
      for (const group of this.root.querySelectorAll<HTMLFieldSetElement>('[data-setting-group]'))
        group.hidden = ![...group.querySelectorAll<HTMLElement>('[data-setting]')].some((label) => !label.hidden);
    });
    this.root.append(heading, search);
    for (const [title, keys] of fieldGroups) {
      const group = panelSection(title);
      group.dataset.settingGroup = '';
      for (const key of keys) {
        const field = presentationFields[key];
        const label = document.createElement('label');
        label.dataset.setting = key;
        label.append(field.label + ' ');
        const defaultValue = presentationDefaults[key as keyof PresentationOptions];
        const input = field.choices ? document.createElement('select') : document.createElement('input');
        input.id = 'presentation-' + key;
        input.setAttribute('aria-label', field.label);
        if (input instanceof HTMLSelectElement)
          for (const value of field.choices ?? []) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            input.append(option);
          }
        else {
          input.type =
            typeof defaultValue === 'boolean'
              ? 'checkbox'
              : typeof defaultValue === 'number'
                ? 'number'
                : key === 'lastColor' || key === 'overlayShadowColor'
                  ? 'color'
                  : 'text';
          if (field.min !== undefined) input.min = String(field.min);
          if (field.max !== undefined) input.max = String(field.max);
          if (field.step !== undefined) input.step = String(field.step);
        }
        label.append(input);
        group.append(label);
      }
      this.root.append(group);
    }
    const notes = document.createElement('p');
    notes.textContent =
      'Preview is temporary. Apply saves supported preferences; Cancel restores the saved view. Existing font, palette, separator strength, alternation strength and timestamp presets remain in Settings. Chat pronouns are off by default and use bounded public lookups; profile-card pronouns have a separate Settings control. Browser defaults preserve current chat behavior. Truncate stages an edited message for review and never sends it automatically. The empty input stays focusable when collapsed. Reduced motion overrides smooth scrolling and pulses. Bare-name detection uses at most 1,000 recently observed message authors per channel; it does not fetch a complete chatter list. Join/departure notices show only events supplied by Twitch and are unavailable in rooms above 1,000 chatters. Previewing membership/history controls may reconnect the read stream; drafts and retained history stay intact. Duplicate-send bypass and alternate send transports are unavailable with the supported API. Twitch sending uses the existing supported API; iframe login remains separate. History limits, font settings and pronouns remain in Settings.';
    this.root.append(panelDetails('Preview, privacy and supported behavior', notes));
    const actions = panelActions();
    for (const [name, action] of [
      [
        'Preview',
        () => {
          this.runtime.preview(this.read());
          this.status('Temporary preview; Apply to save');
        },
      ],
      [
        'Apply',
        () => {
          this.runtime.persist(this.read());
          this.status('Presentation saved');
        },
      ],
      ['Cancel', () => this.root.close()],
      [
        'Reset to defaults',
        () => {
          this.sync(presentationDefaults);
          this.status('Defaults loaded into controls; preview or apply to use');
        },
      ],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.addEventListener('click', () => {
        try {
          action();
        } catch (e) {
          this.status(e instanceof Error ? e.message : 'Could not update presentation');
        }
      });
      actions.append(button);
    }
    const status = document.createElement('p');
    status.id = 'presentation-status';
    status.setAttribute('role', 'status');
    this.root.append(status, actions);
    this.root.addEventListener('close', this.cancel);
    this.runtime.addEventListener('change', this.runtimeChanged);
    document.body.append(this.root);
    this.runtimeChanged();
  }
  private runtimeChanged = (): void => {
    this.sync(this.runtime.saved);
    this.status(this.runtime.error);
  };
  private status(text: string): void {
    this.root.querySelector('#presentation-status')!.textContent = text;
  }
  private sync(value: PresentationOptions): void {
    for (const [key, v] of Object.entries(value)) {
      const input = this.root.querySelector<HTMLInputElement | HTMLSelectElement>('#presentation-' + key)!;
      if (typeof v === 'boolean' && input instanceof HTMLInputElement) input.checked = v;
      else input.value = String(v);
    }
  }
  private read(): PresentationOptions {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(presentationDefaults)) {
      const input = this.root.querySelector<HTMLInputElement | HTMLSelectElement>('#presentation-' + key)!;
      result[key] =
        typeof v === 'boolean' && input instanceof HTMLInputElement
          ? input.checked
          : typeof v === 'number'
            ? Number(input.value)
            : input.value;
    }
    return parsePresentation(result);
  }
  open = (): void => {
    if (privacyEnabled()) return;
    this.sync(this.runtime.saved);
    showPanel(this.root);
  };
  private cancel = (): void => {
    this.runtime.cancel();
    this.sync(this.runtime.saved);
  };
  close(): void {
    this.root.close();
  }
  stop(): void {
    this.runtime.cancel();
    this.runtime.removeEventListener('change', this.runtimeChanged);
    this.root.removeEventListener('close', this.cancel);
    this.root.remove();
  }
}
