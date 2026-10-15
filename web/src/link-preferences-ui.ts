import type { Panel } from './shell/panels';
import { privacyEnabled } from './privacy';
import {
  LinkPreferenceStore,
  linkDefaults,
  parseLinkPreferences,
  setLinkPreferences,
  type LinkPreferences,
} from './link-preferences';
export class LinkPreferencesPanel implements Panel {
  readonly id = 'link-preferences-panel';
  readonly title = 'Link preferences';
  readonly group = 'moderation';
  readonly root = document.createElement('dialog');
  private report = document.createElement('pre');
  private status = document.createElement('p');
  private store: LinkPreferenceStore | undefined;
  private pending: LinkPreferences | undefined;
  private apply: HTMLButtonElement;
  constructor(
    private changed: () => void = () => {},
    private readonlyView = false,
  ) {
    this.root.id = this.id;
    this.root.setAttribute('aria-label', 'Link preferences');
    const heading = document.createElement('h2');
    heading.textContent = 'Link previews and selection search';
    const note = document.createElement('p');
    note.textContent =
      'Enabling remote previews permits Chatty Cat to request the public destination. Thumbnails/icons contact image hosts from your browser and expose its IP. Preview buttons can request one preview explicitly even while automatic previews are off. Media players still require a separate click. Browser settings control private/incognito windows; this web app opens ordinary tabs.';
    this.root.append(heading, note);
    for (const [key, label] of [
      ['enabled', 'Allow automatic remote link previews'],
      ['tooltip', 'Show automatic link tooltips on hover/focus'],
      ['thumbnails', 'Allow remote link thumbnails and icons'],
      ['doubleClick', 'Require double-click to open chat links (Enter still works)'],
      ['unshorten', 'Enable explicit shortened-link resolution'],
      ['lowercaseDomains', 'Display normalized lowercase domains'],
      ['emoteTooltip', 'Show emote and badge tooltip images'],
      ['searchEnabled', 'Enable reviewed selection search'],
    ] as const) {
      const field = document.createElement('label'),
        input = document.createElement('input');
      input.type = 'checkbox';
      input.name = key;
      field.append(input, label);
      this.root.append(field);
    }
    for (const [key, label, type] of [
      ['thumbnailSize', 'General preview image width', 'number'],
      ['streamSize', 'Stream preview image width', 'number'],
      ['engineURL', 'Search engine URL with {query}', 'text'],
      ['engineName', 'Search engine name', 'text'],
    ] as const) {
      const field = document.createElement('label'),
        input = document.createElement('input');
      field.textContent = label;
      input.type = type;
      input.name = key;
      input.setAttribute('aria-label', label);
      if (type === 'number') {
        input.min = '80';
        input.max = '640';
      } else input.maxLength = key === 'engineURL' ? 2048 : 40;
      field.append(input);
      this.root.append(field);
    }
    this.status.setAttribute('role', 'status');
    this.root.append(
      this.button('Review link preferences', () => this.review()),
      this.report,
    );
    this.apply = this.button('Apply link preferences', () => this.commit());
    this.root.append(
      this.apply,
      this.button('Close link preferences', () => this.root.close()),
      this.status,
    );

    document.body.append(this.root);
    this.root.addEventListener('input', this.invalidate);
    this.root.addEventListener('change', this.invalidate);
    this.root.addEventListener('close', this.closed);
    document.addEventListener('privacychange', this.privacy);
    this.load();
    this.invalidate();
  }
  private button(text: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => {
      try {
        if (privacyEnabled() || this.readonlyView) throw new Error('Link tools hidden in this view');
        action();
      } catch (error) {
        this.status.textContent = error instanceof Error ? error.message : 'Link tools unavailable';
      }
    });
    return b;
  }
  private load(): void {
    try {
      this.store = new LinkPreferenceStore();
      const p = this.store.read();
      setLinkPreferences(p);
      this.sync(p);
    } catch (error) {
      this.store = undefined;
      setLinkPreferences(linkDefaults);
      this.status.textContent = error instanceof Error ? error.message : 'Link preferences unavailable';
    }
    this.announce();
  }
  private field(name: string): HTMLInputElement {
    const input = this.root.querySelector('[name=' + name + ']');
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing link preference');
    return input;
  }
  private sync(p: LinkPreferences): void {
    for (const key of [
      'enabled',
      'tooltip',
      'thumbnails',
      'doubleClick',
      'unshorten',
      'lowercaseDomains',
      'emoteTooltip',
      'searchEnabled',
    ] as const)
      this.field(key).checked = p[key];
    for (const key of ['thumbnailSize', 'streamSize', 'engineURL', 'engineName'] as const)
      this.field(key).value = String(p[key]);
  }
  private review(): void {
    this.invalidate();
    if (!this.store) throw new Error('Existing preferences unavailable; data retained');
    this.store.read();
    const raw: Record<string, unknown> = { version: 1 };
    for (const key of [
      'enabled',
      'tooltip',
      'thumbnails',
      'doubleClick',
      'unshorten',
      'lowercaseDomains',
      'emoteTooltip',
      'searchEnabled',
    ])
      raw[key] = this.field(key).checked;
    for (const key of ['thumbnailSize', 'streamSize']) raw[key] = Number(this.field(key).value);
    for (const key of ['engineURL', 'engineName']) raw[key] = this.field(key).value;
    this.pending = parseLinkPreferences(raw);
    this.report.textContent =
      'Remote previews: ' +
      this.pending.enabled +
      '; hover/focus: ' +
      this.pending.tooltip +
      '\nBrowser image requests: ' +
      this.pending.thumbnails +
      '\nPreview widths: ' +
      this.pending.thumbnailSize +
      ' / ' +
      this.pending.streamSize +
      ' px\nDouble-click: ' +
      this.pending.doubleClick +
      '; explicit resolution: ' +
      this.pending.unshorten +
      '\nSelection search: ' +
      (this.pending.searchEnabled
        ? this.pending.engineName + ' at ' + new URL(this.pending.engineURL.replace('{query}', 'fixture')).origin
        : 'off') +
      '\nNo remote request or search occurs when saving.';
    this.apply.disabled = false;
  }
  private commit(): void {
    if (!this.pending || !this.store) return;
    this.store.save(this.pending);
    setLinkPreferences(this.pending);
    this.invalidate();
    this.announce();
    this.status.textContent = 'Saved link preferences for this local account';
  }
  private announce(): void {
    document.dispatchEvent(new Event('presentation-before-change'));
    document.dispatchEvent(new Event('linkpreferenceschange'));
    this.changed();
  }
  private invalidate = (): void => {
    this.pending = undefined;
    this.apply.disabled = true;
    this.report.textContent = '';
  };
  open = (): void => {
    if (privacyEnabled() || this.readonlyView) return;
    this.load();
    this.invalidate();
    this.root.showModal();
  };
  private closed = (): void => {
    this.invalidate();
    this.field('engineURL').value = '';
    this.field('engineName').value = '';
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
    this.root.removeEventListener('input', this.invalidate);
    this.root.removeEventListener('change', this.invalidate);
    this.root.removeEventListener('close', this.closed);
    document.removeEventListener('privacychange', this.privacy);
    this.root.remove();
  }
}
