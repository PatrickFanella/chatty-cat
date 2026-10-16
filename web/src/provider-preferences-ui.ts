import { showPanel } from './shell/open-panel';
import type { Panel } from './shell/panels';
import { privacyEnabled } from './privacy';
import { panelActions, panelDetails, panelSection } from './panel-sections';
import {
  ProviderPreferenceStore,
  parseProviderPreferences,
  setProviderPreferences,
  providerDefaults,
  PROVIDERS,
  BADGE_CATEGORIES,
  type ProviderPreferences,
} from './provider-preferences';
export class ProviderPanel implements Panel {
  readonly id = 'provider-preferences-panel';
  readonly title = 'Provider and badge preferences';
  readonly group = 'providers';
  readonly root = document.createElement('dialog');
  private status = document.createElement('pre');
  private eventsNotice = document.createElement('p');
  private cosmeticNotice = document.createElement('p');
  private store: ProviderPreferenceStore | undefined;
  private pending: ProviderPreferences | undefined;
  private apply: HTMLButtonElement;
  constructor(
    private changed: () => void,
    private reload: () => boolean,
    private readonlyView = false,
    reconnect?: () => void,
  ) {
    this.root.id = this.id;
    this.root.setAttribute('aria-label', 'Provider and badge preferences');
    const h = document.createElement('h2');
    h.textContent = 'Provider emotes and Twitch badges';
    const note = document.createElement('p');
    note.textContent =
      'These preferences affect this account on this browser. Existing public provider metadata is checked every minute; the server caches emote sets for up to ten minutes. Live refresh uses bounded polling. Optional 7TV events can refresh changed sets sooner. Turning off display does not disable server metadata requests. Native Twitch tag ranges still identify sent emotes. Optional cosmetic badges require server configuration and your opt-in here. FFZ/Chatterino cosmetics send at most 100 recent public-message user IDs per minute to this server. BTTV/7TV services open fixed provider sockets directly from this browser and disclose joined channel IDs. 7TV cosmetics also require the event connection opt-in. Badge images contact their host from your browser. Cosmetic badges do not prove Twitch roles. FFZ role artwork only replaces the image of a native moderator/VIP tag, with native-image fallback. Activity opt-ins alone send no announcements. Use Provider activity to review and start a session; it shares your identity and selected channel with the chosen services every five minutes until stopped.';
    const lead = document.createElement('p');
    lead.textContent =
      'Choose emote display and badge preferences for this browser account. Optional services require server support and your opt-in. Activity sharing also requires a separately reviewed session.';
    const providers = panelSection('Emote providers');
    const display = panelSection('Emote display');
    const badges = panelSection('Twitch badges');
    const optional = panelSection('Optional cosmetics and live services', this.cosmeticNotice, this.eventsNotice);
    const activity = panelSection('Activity sharing');
    this.root.append(
      h,
      lead,
      providers,
      display,
      badges,
      optional,
      activity,
      panelDetails('Provider requests, privacy and limits', note),
    );
    this.cosmeticNotice.textContent = 'Cosmetic services are off by default and require server configuration.';
    for (const provider of PROVIDERS)
      for (const key of ['global', 'channel', 'live'] as const)
        this.checkbox(
          provider + '.' + key,
          provider + ' ' + (key === 'live' ? 'live refresh' : key + ' emotes'),
          providers,
        );
    for (const role of ['moderator', 'vip'] as const)
      this.checkbox('ffzRoleArtwork.' + role, 'Use FFZ ' + role + ' artwork for native Twitch badges', badges);
    for (const cosmetic of ['FFZ', 'Chatterino', 'BTTV', '7TV'] as const)
      this.checkbox(
        'cosmetic.' + cosmetic,
        'Allow ' + cosmetic + ' cosmetic badges (requires server configuration)',
        optional,
      );
    this.checkbox('sevenTVEventAPI', 'Allow 7TV event connections (requires server configuration)', optional);
    if (reconnect) optional.append(panelActions(this.button('Reconnect optional provider services', reconnect)));
    for (const provider of ['BTTV', '7TV'] as const)
      this.checkbox(
        'activity.' + provider,
        'Allow ' + provider + ' activity sharing (start a reviewed session separately)',
        activity,
      );
    for (const category of BADGE_CATEGORIES) this.checkbox('badge.' + category, 'Show ' + category + ' badges', badges);
    this.checkbox('images', 'Show native and provider emote images (off keeps names as text)', display);
    this.checkbox('zeroWidth', 'Allow zero-width emote layering', display);
    this.checkbox('animated', 'Animate emotes and cheer images', display);
    this.checkbox('stackBits', 'Combine recognized cheers when their amounts match Twitch’s bits total', display);
    this.checkbox('scaleEmotesByLineHeight', 'Scale emotes by chat line height', display);
    this.checkbox('showUnlistedSevenTV', 'Show unlisted 7TV emotes', display);
    this.checkbox('removeSpacesBetweenEmotes', 'Remove visual spaces between emotes', display);
    const tooltip = document.createElement('label');
    tooltip.textContent = 'Emote tooltip scale (0.5, 1, 1.5 or 2; image tooltip consent required)';
    const tooltipInput = document.createElement('input');
    tooltipInput.type = 'number';
    tooltipInput.name = 'tooltipScale';
    tooltipInput.min = '0.5';
    tooltipInput.max = '2';
    tooltipInput.step = '0.5';
    tooltip.append(tooltipInput);
    display.append(tooltip);
    const label = document.createElement('label');
    label.textContent = 'Emote scale (0.5–3)';
    const input = document.createElement('input');
    input.type = 'number';
    input.name = 'scale';
    input.min = '0.5';
    input.max = '3';
    input.step = '0.1';
    label.append(input);
    display.append(label);
    this.status.setAttribute('role', 'status');
    this.status.style.whiteSpace = 'pre-wrap';
    this.apply = this.button('Apply provider preferences', () => this.commit());
    this.root.append(
      this.status,
      panelActions(
        this.button('Review provider preferences', () => this.review()),
        this.apply,
        this.button('Reload provider metadata', () => {
          this.status.textContent = this.reload()
            ? 'Reload requested; existing server cache remains in effect.'
            : 'Wait 30 seconds between reload requests.';
        }),
        this.button('Close provider preferences', () => this.root.close()),
      ),
    );
    this.root.addEventListener('input', this.invalidate);
    this.root.addEventListener('change', this.invalidate);
    this.root.addEventListener('close', this.invalidate);
    document.addEventListener('privacychange', this.privacy);
    document.body.append(this.root);
    this.load();
  }
  eventsStatus(detail: string): void {
    this.eventsNotice.textContent = detail;
  }
  cosmeticsStatus(detail: string): void {
    this.cosmeticNotice.textContent = detail;
  }
  private checkbox(name: string, text: string, section: HTMLElement): void {
    const label = document.createElement('label'),
      input = document.createElement('input');
    input.type = 'checkbox';
    input.name = name;
    label.append(input, text);
    section.append(label);
  }
  private field(name: string): HTMLInputElement {
    const input = this.root.querySelector('input[name="' + name + '"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing provider field');
    return input;
  }
  private button(text: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', () => {
      try {
        action();
      } catch (error) {
        this.status.textContent = error instanceof Error ? error.message : 'Preferences unavailable';
      }
    });
    return b;
  }
  private load(): void {
    try {
      this.store = new ProviderPreferenceStore();
      const p = this.store.read();
      setProviderPreferences(p);
      for (const role of ['moderator', 'vip'] as const)
        this.field('ffzRoleArtwork.' + role).checked = p.ffzRoleArtwork[role];
      for (const provider of PROVIDERS)
        for (const key of ['global', 'channel', 'live'] as const)
          this.field(provider + '.' + key).checked = p.providers[provider][key];
      for (const cosmetic of ['FFZ', 'Chatterino', 'BTTV', '7TV'] as const)
        this.field('cosmetic.' + cosmetic).checked = p.cosmetics[cosmetic];
      for (const provider of ['BTTV', '7TV'] as const)
        this.field('activity.' + provider).checked = p.activity[provider];
      for (const category of BADGE_CATEGORIES) this.field('badge.' + category).checked = p.badges[category];
      for (const key of [
        'sevenTVEventAPI',
        'images',
        'zeroWidth',
        'stackBits',
        'scaleEmotesByLineHeight',
        'showUnlistedSevenTV',
        'removeSpacesBetweenEmotes',
      ] as const)
        this.field(key).checked = p[key];
      this.field('tooltipScale').value = String(p.tooltipScale);
      this.field('animated').checked = p.animated;
      this.field('scale').value = String(p.scale);
      this.status.textContent = '';
    } catch {
      this.store = undefined;
      setProviderPreferences(providerDefaults());
      this.status.textContent = 'Saved preferences unavailable; existing data retained.';
    }
    this.invalidate();
  }
  private review(): void {
    if (privacyEnabled() || !this.store) throw new Error('Preferences unavailable');
    this.store.read();
    const p = providerDefaults();
    for (const role of ['moderator', 'vip'] as const)
      p.ffzRoleArtwork[role] = this.field('ffzRoleArtwork.' + role).checked;
    for (const provider of PROVIDERS)
      for (const key of ['global', 'channel', 'live'] as const)
        p.providers[provider][key] = this.field(provider + '.' + key).checked;
    for (const cosmetic of ['FFZ', 'Chatterino', 'BTTV', '7TV'] as const)
      p.cosmetics[cosmetic] = this.field('cosmetic.' + cosmetic).checked;
    for (const provider of ['BTTV', '7TV'] as const) p.activity[provider] = this.field('activity.' + provider).checked;
    for (const category of BADGE_CATEGORIES) p.badges[category] = this.field('badge.' + category).checked;
    for (const key of [
      'sevenTVEventAPI',
      'images',
      'zeroWidth',
      'stackBits',
      'scaleEmotesByLineHeight',
      'showUnlistedSevenTV',
      'removeSpacesBetweenEmotes',
    ] as const)
      p[key] = this.field(key).checked;
    p.tooltipScale = Number(this.field('tooltipScale').value);
    p.animated = this.field('animated').checked;
    p.scale = Number(this.field('scale').value);
    this.pending = parseProviderPreferences(p);
    this.status.textContent =
      JSON.stringify(this.pending, null, 2) +
      '\nApply saves preferences for this profile. Activity sharing requires a separate reviewed session; no announcement is sent by Apply.';
    this.apply.disabled = false;
  }
  private commit(): void {
    if (privacyEnabled() || !this.pending || !this.store) throw new Error('Review preferences first');
    this.store.save(this.pending);
    setProviderPreferences(this.pending);
    this.invalidate();
    document.dispatchEvent(new Event('presentation-before-change'));
    this.changed();
    this.status.textContent = 'Provider preferences saved.';
  }
  private invalidate = (): void => {
    this.pending = undefined;
    this.apply.disabled = true;
  };
  open = (): void => {
    if (this.readonlyView || privacyEnabled()) return;
    this.load();
    showPanel(this.root);
  };
  private privacy = (): void => {
    if (privacyEnabled()) {
      this.invalidate();
      this.root.close();
    }
  };
  close(): void {
    this.root.close();
  }
  stop(): void {
    document.removeEventListener('privacychange', this.privacy);
    this.root.removeEventListener('input', this.invalidate);
    this.root.removeEventListener('change', this.invalidate);
    this.root.removeEventListener('close', this.invalidate);
    this.root.remove();
  }
}
