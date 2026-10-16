import { profileKey } from './account-profiles';
import { registerSettings } from './settings-bundle';
import { ResourceAuthors } from './resource-authors';
import { ResourceStreams } from './resource-streams';
import { RepositoryDetails } from './resource-repository';
import { channelURL } from './channels';
import { FloatingPanel } from './floating';
import { resourceURL } from './resource-url';
export { resourceURL } from './resource-url';
export class Resources {
  private floating: FloatingPanel;
  private authors: ResourceAuthors;
  private streams: ResourceStreams;
  private repositories: RepositoryDetails;
  private bundleDispose: () => void;
  private tabs: HTMLButtonElement[] = [];
  private pages = new Map<string, HTMLElement>();
  private selected = 'help';
  constructor(
    private root: HTMLElement,
    private trigger: HTMLButtonElement,
    private action: (name: string) => void,
    resourceTabs: Readonly<Record<string, string>>,
  ) {
    const nav = root.querySelector<HTMLElement>('[role=tablist]')!;
    const content = root.querySelector<HTMLElement>('.resource-content')!;
    const help = document.createElement('section');
    help.id = 'resources-help';
    help.role = 'tabpanel';
    help.tabIndex = 0;
    const title = document.createElement('h2');
    title.textContent = 'Chatty Cat';
    help.append(title);
    const instructions = [
      'Watch up to six Twitch chats together. Enter channel names separated by commas, then choose a send destination in the composer.',
      'Log in with Twitch to send. Enter sends; Shift+Enter adds a draft line break. Up and Down at the ends of the draft recall sent messages. Use @ for names, : for emotes, or Tab to complete a word.',
      'Reply buttons quote a parent message. Link buttons preserve the current channels and open saved message context. Jump to live resumes following chat.',
      'The emote picker has provider and emoji tabs, search, recent use, age markers, animation filters and saved size. Drag its title or use arrow keys on the move handle; Shift moves farther. Pin retains its position.',
      'Display settings control presets, palettes, fonts, metrics, timestamps, filters, scrollback, emote-only size and shadows. Mention sound and notifications are optional. The missed-mention button jumps to each queued message; Shift-click clears it.',
      'Search reads this browser’s saved archive. Stats retain observed rankings; their summary and graph cover retained messages. Offline mode displays saved history; live chat and sending need the network.',
      'Video opens Twitch’s player with the current parent domain and does not start playback automatically. Link previews load media players only when selected.',
      'GIF title lookup uses direct, uncached GIPHY requests. Results keep GIPHY attribution and original media URLs. Enable PG-13 safe mode in Display settings; request limits and failure links still apply. A server cache or proxy is not part of the supported integration.',
      'Warnings/Shield Mode: /warn username reason, /shield, /shieldoff, /banid numeric-user-id [reason], /untimeout username. These composer commands open the moderation review; Confirm sends once and records a private receipt. Warning acknowledgement happens in Twitch and is unavailable here. Supported commands: /me action text, /timeout username [seconds] [reason], /ban username [reason], /unban username, /delete message-id, /clear, /slow [seconds], /slowoff, /followers [minutes], /followersoff, /subscribers and /subscribersoff, /emoteonly and /emoteonlyoff, /uniquechat and /uniquechatoff, /announce text (or /announceblue, /announcegreen, /announceorange, /announcepurple), /color named-color or #RRGGBB. Also /raid username, /unraid, /mod and /unmod username, /vip and /unvip username, /block and /unblock username, /shoutout username. Raid/mod/VIP commands require the selected channel’s broadcaster account. A raid request starts Twitch’s pending raid; complete or cancel it there. Commands require the relevant Twitch scope and channel permission.',
      'Media, left, libre and author lists retain the original project’s curated links and attribution.',
    ];
    for (const text of instructions) {
      const p = document.createElement('p');
      p.textContent = text;
      help.append(p);
    }
    for (const [name, label] of [
      ['display-open', 'Display settings'],
      ['stats-open', 'Stats'],
      ['archive-open', 'Search archive'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.helpAction = name;
      button.textContent = label;
      help.append(button);
    }
    const credit = document.createElement('p');
    credit.append('Rebuilt in Go and TypeScript from ');
    const upstream = document.createElement('a');
    upstream.href = 'https://github.com/mxmilkiib/hasanabi.neocities.org';
    upstream.textContent = 'the original AGPL project';
    upstream.target = '_blank';
    upstream.rel = 'noopener noreferrer';
    credit.append(upstream, '. ');
    const source = document.createElement('a');
    source.href = 'https://git.subcult.tv/subculture-collective/chatty-cat';
    source.textContent = 'Go and TypeScript source';
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    credit.append(source);
    help.append(credit);
    const repositoryOutputs: { url: string; output: HTMLElement }[] = [];
    for (const [label, url] of [
      ['Rebuild repository', source.href],
      ['Upstream repository', upstream.href],
    ]) {
      const row = document.createElement('p'),
        output = document.createElement('span');
      row.append(label + ': ', output);
      help.append(row);
      repositoryOutputs.push({ url: url!, output });
    }
    this.repositories = new RepositoryDetails(repositoryOutputs);
    this.pages.set('help', help);
    content.append(help);
    for (const [key, html] of Object.entries(resourceTabs)) {
      const page = document.createElement('section');
      page.id = 'resources-' + key;
      page.role = 'tabpanel';
      page.tabIndex = 0;
      // Build-time port strips scripts, event handlers, styles and unsafe URLs.
      page.innerHTML = html;
      page.hidden = true;
      this.pages.set(key, page);
      content.append(page);
    }
    for (const [key, label] of [
      ['help', 'Help'],
      ['htabRes', 'Media'],
      ['htabLib', 'Left'],
      ['htabLbr', 'Libre'],
      ['htabAuth', 'Authors'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.role = 'tab';
      button.id = 'resources-tab-' + key;
      button.dataset.tab = key;
      button.textContent = label!;
      button.setAttribute('aria-controls', 'resources-' + key);
      nav.append(button);
      this.tabs.push(button);
      this.pages.get(key!)?.setAttribute('aria-labelledby', button.id);
    }
    try {
      const saved = localStorage.getItem(profileKey('chatthing:v1:resources:tab'));
      if (saved && this.pages.has(saved)) this.selected = saved;
    } catch {
      /* optional storage */
    }
    this.authors = new ResourceAuthors(this.pages.get('htabAuth')!);
    this.streams = new ResourceStreams(this.pages.get('htabRes')!);
    const current = new URL(location.href),
      joined = (current.searchParams.get('channel') ?? 'hasanabi').split(',');
    for (const link of root.querySelectorAll<HTMLAnchorElement>('a[data-channel-link]')) {
      const channel = new URL(link.href).searchParams.get('channel');
      if (!channel) continue;
      const action = joined.includes(channel) ? 'remove' : 'add';
      if ((action === 'remove' && joined.length === 1) || (action === 'add' && joined.length >= 6)) continue;
      try {
        const control = document.createElement('a');
        control.href = channelURL(current, joined, { kind: action, channel }).href;
        control.textContent = action === 'add' ? '+' : '−';
        control.setAttribute('aria-label', (action === 'add' ? 'Join #' : 'Leave #') + channel);
        control.className = 'resource-channel-control';
        link.after(control);
      } catch {
        /* invalid curated channel */
      }
    }
    this.select(this.selected);
    this.floating = new FloatingPanel(
      root,
      root.querySelector<HTMLElement>('#resources-handle')!,
      root.querySelector<HTMLButtonElement>('#resources-pin')!,
      profileKey('chatthing:v1:resources:geometry'),
    );
    trigger.addEventListener('click', this.toggle);
    root.addEventListener('click', this.click);
    root.addEventListener('keydown', this.key);
    this.bundleDispose = registerSettings(
      'resources',
      () => ({ tab: this.selected, authors: this.authors.state(), floating: this.floating.state() }),
      (value) => {
        if (!value || typeof value !== 'object') return;
        const data = value as Record<string, unknown>;
        if (typeof data.tab !== 'string' || !this.pages.has(data.tab) || !this.floating.restore(data.floating)) return;
        this.authors.restore(data.authors);
        this.select(data.tab);
        if (this.floating.reopen) this.open();
        else this.close();
      },
    );
    const query = resourceURL(new URL(location.href).searchParams);
    if (query.tab) this.select(query.tab);
    if (query.width) {
      const box = this.floating.geometry();
      this.floating.configure(
        { width: query.width, height: box?.height ?? 600, left: box?.left ?? 20, top: box?.top ?? 60 },
        this.floating.pinned,
      );
    }
    if (query.open === true || (query.open === undefined && this.floating.reopen)) this.open();
    else if (query.open === false) this.close();
    if (query.action && query.open !== false) this.action(query.action);
    document.addEventListener('share-settings', this.share);
  }
  private select(key: string): void {
    this.selected = key;
    for (const [name, page] of this.pages) page.hidden = name !== key;
    for (const button of this.tabs) {
      const active = button.dataset.tab === key;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    try {
      localStorage.setItem(profileKey('chatthing:v1:resources:tab'), key);
    } catch {
      /* optional storage */
    }
    if (key === 'htabRes' && !this.root.hidden) this.streams.start();
    else this.streams.stop();
    if (key === 'help' && !this.root.hidden) this.repositories.start();
    else this.repositories.stop();
  }
  open(): void {
    this.root.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.floating.opened();
    this.select(this.selected);
    this.tabs.find((tab) => tab.dataset.tab === this.selected)?.focus();
  }
  close(): void {
    this.repositories.stop();
    this.streams.stop();
    this.root.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.floating.closed();
    this.trigger.focus();
  }
  private toggle = (): void => {
    if (this.root.hidden) this.open();
    else this.close();
  };
  private click = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    const citation = event.target.closest<HTMLAnchorElement>('a[data-au]');
    if (citation) {
      event.preventDefault();
      this.select('htabAuth');
      const name = citation.dataset.au?.toLowerCase();
      const hit = [...this.pages.get('htabAuth')!.querySelectorAll<HTMLAnchorElement>('a[data-b]')].find(
        (link) => link.textContent?.trim().toLowerCase() === name,
      );
      hit?.closest('i')?.scrollIntoView({ block: 'center' });
      hit?.focus({ preventScroll: true });
      return;
    }
    if (button?.id === 'resources-close') this.close();
    else if (button?.dataset.tab) this.select(button.dataset.tab);
    else if (button?.dataset.helpAction) this.action(button.dataset.helpAction);
    const link = event.target.closest<HTMLAnchorElement>('a[data-channel-link]');
    if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
      event.preventDefault();
      const channel = new URL(link.href).searchParams.get('channel');
      if (channel && /^[a-z0-9_]{1,25}$/.test(channel)) {
        const url = new URL(location.href);
        url.searchParams.set('channel', channel);
        url.searchParams.delete('mid');
        location.assign(url);
      }
    }
  };
  private key = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (!(event.target instanceof HTMLButtonElement) || event.target.role !== 'tab') return;
    const index = this.tabs.indexOf(event.target);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % this.tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + this.tabs.length - 1) % this.tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.tabs.length - 1;
    else return;
    event.preventDefault();
    const tab = this.tabs[next];
    if (tab?.dataset.tab) {
      this.select(tab.dataset.tab);
      tab.focus();
    }
  };
  private share = (event: Event): void => {
    if (!(event instanceof CustomEvent) || !(event.detail instanceof URL)) return;
    const q = event.detail.searchParams;
    q.set('help', this.root.hidden ? 'off' : 'panel');
    q.set(
      'htab',
      (
        { help: 'help', htabRes: 'media', htabLib: 'left', htabLbr: 'libre', htabAuth: 'authors' } as Record<
          string,
          string
        >
      )[this.selected] ?? 'help',
    );
    const box = this.floating.geometry();
    if (box) q.set('hpw', String(Math.max(480, Math.min(1600, Math.round(box.width)))));
  };
  stop(): void {
    document.removeEventListener('share-settings', this.share);
    this.repositories.stop();
    this.streams.stop();
    this.authors.stop();
    this.bundleDispose();
    this.floating.stop();
    this.trigger.removeEventListener('click', this.toggle);
    this.root.removeEventListener('click', this.click);
    this.root.removeEventListener('keydown', this.key);
  }
}
