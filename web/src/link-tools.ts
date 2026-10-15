import { privacyEnabled } from './privacy';
import {
  LinkPreferenceStore,
  linkDefaults,
  setLinkPreferences,
  getLinkPreferences,
  searchURL,
} from './link-preferences';
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export class LinkTools {
  private searchRoot: HTMLDialogElement | undefined;
  private searchTrigger = document.createElement('button');
  private openingStatus = document.createElement('p');
  private selected = '';
  private resolveAbort: AbortController | undefined;
  private resolveGeneration = 0;
  constructor(
    private log: HTMLElement,
    private changed: () => void = () => {},
    private readonlyView = false,
  ) {
    this.searchTrigger.type = 'button';
    this.searchTrigger.textContent = 'Search selected chat text';
    this.searchTrigger.hidden = readonlyView;
    log.before(this.searchTrigger, this.openingStatus);
    this.openingStatus.setAttribute('role', 'status');
    this.searchTrigger.addEventListener('click', this.selection);
    document.addEventListener('privacychange', this.privacy);
    document.addEventListener('linkpreferenceschange', this.preferencesChanged);
    log.addEventListener('click', this.click, true);
    log.addEventListener('dblclick', this.double, true);
    try {
      setLinkPreferences(new LinkPreferenceStore().read());
    } catch (error) {
      setLinkPreferences(linkDefaults);
      this.openingStatus.textContent = error instanceof Error ? error.message : 'Link preferences unavailable';
    }
    this.announce();
  }
  private get search(): HTMLDialogElement {
    if (!this.searchRoot) {
      this.searchRoot = document.createElement('dialog');
      this.searchRoot.id = 'link-search-panel';
      this.searchRoot.setAttribute('aria-label', 'Review selection search');
      this.searchRoot.addEventListener('close', this.clearSearch);
      document.body.append(this.searchRoot);
    }
    return this.searchRoot;
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
        this.openingStatus.textContent = error instanceof Error ? error.message : 'Link tools unavailable';
      }
    });
    return b;
  }
  private announce(): void {
    document.dispatchEvent(new Event('presentation-before-change'));
    document.dispatchEvent(new Event('linkpreferenceschange'));
  }
  private preferencesChanged = (): void => {
    this.searchTrigger.disabled = !getLinkPreferences().searchEnabled || privacyEnabled();
    this.changed();
  };
  private selection = (): void => {
    if (privacyEnabled() || this.readonlyView || !getLinkPreferences().searchEnabled) return;
    const selection = document.getSelection();
    if (
      !selection?.anchorNode ||
      !selection.focusNode ||
      !this.log.contains(selection.anchorNode) ||
      !this.log.contains(selection.focusNode)
    )
      return;
    this.selected = selection.toString();
    let href: string;
    try {
      href = searchURL(getLinkPreferences(), this.selected);
    } catch (error) {
      this.openingStatus.textContent = error instanceof Error ? error.message : 'Selection unavailable';
      return;
    }
    const h = document.createElement('h2');
    h.textContent = 'Review selection search';
    const text = document.createElement('pre');
    text.textContent = this.selected;
    const note = document.createElement('p');
    note.textContent =
      'Opening this link sends the displayed selection to ' +
      new URL(href).origin +
      '. Nothing is sent until you choose Open search. Your browser controls new-tab and private-window behavior.';
    const link = document.createElement('a');
    link.href = href;
    link.textContent = 'Open search in ' + getLinkPreferences().engineName;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    this.search.replaceChildren(
      h,
      text,
      note,
      link,
      this.button('Close selection search', () => this.search.close()),
    );
    this.search.showModal();
  };
  private resolveReview(raw: string): void {
    if (privacyEnabled() || this.readonlyView || !getLinkPreferences().unshorten) return;
    let url: URL;
    try {
      url = new URL(raw);
      if (raw.length > 2048 || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    } catch {
      return;
    }
    this.clearSearch();
    const generation = this.resolveGeneration,
      h = document.createElement('h2');
    h.textContent = 'Review link resolution';
    const note = document.createElement('p');
    note.textContent =
      'Chatty Cat will request this public URL and follow at most four redirects using its protected preview service. Destinations can observe server requests. This does not open the resolved link or load browser images. ' +
      url.href;
    const result = document.createElement('p'),
      resolve = this.button('Resolve this public URL', () => {
        if (generation !== this.resolveGeneration) return;
        this.resolveAbort?.abort();
        const abort = (this.resolveAbort = new AbortController());
        resolve.disabled = true;
        result.textContent = 'Resolving…';
        void fetch('/api/preview?url=' + encodeURIComponent(url.href), {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
        })
          .then(async (response) => {
            if (!response.ok) throw new Error('Resolution unavailable');
            const value: unknown = await response.json();
            if (generation !== this.resolveGeneration || privacyEnabled()) return;
            if (
              !record(value) ||
              typeof value.url !== 'string' ||
              value.url.length > 2048 ||
              /[\x00-\x20\x7f]/.test(value.url)
            )
              throw new Error('Invalid resolved URL');
            const destination = new URL(value.url);
            if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password)
              throw new Error('Invalid resolved URL');
            const link = document.createElement('a');
            link.href = destination.href;
            link.textContent = destination.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            result.replaceChildren('Resolved destination: ', link);
          })
          .catch((error) => {
            if (generation === this.resolveGeneration && !privacyEnabled()) {
              result.textContent = error instanceof Error ? error.message : 'Resolution unavailable';
              resolve.disabled = false;
            }
          });
      });
    this.search.replaceChildren(
      h,
      note,
      resolve,
      result,
      this.button('Close link resolution', () => this.search.close()),
    );
    this.search.showModal();
  }
  private clearSearch = (): void => {
    this.resolveGeneration++;
    this.resolveAbort?.abort();
    this.resolveAbort = undefined;
    this.selected = '';
    this.searchRoot?.replaceChildren();
  };
  private click = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const resolve = event.target.closest<HTMLButtonElement>('button[data-resolve-link]');
    if (resolve) {
      event.preventDefault();
      this.resolveReview(resolve.dataset.resolveLink ?? '');
      return;
    }
    if (!event.target.closest('a.chat-link,a.chat-image-link')) return;
    if (privacyEnabled()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (
      getLinkPreferences().doubleClick &&
      event.detail > 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  private double = (event: MouseEvent): void => {
    if (!getLinkPreferences().doubleClick || privacyEnabled() || !(event.target instanceof Element)) return;
    const anchor = event.target.closest('a.chat-link,a.chat-image-link');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const url = new URL(anchor.href);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    window.open(url.href, '_blank', 'noopener,noreferrer');
    this.openingStatus.textContent =
      'If your browser blocked the new tab, focus the link and press Enter. This opens an ordinary tab.';
  };
  private privacy = (): void => {
    if (privacyEnabled()) {
      this.clearSearch();
      if (this.searchRoot?.open) this.searchRoot.close();
    }
    this.announce();
  };
  stop(): void {
    this.clearSearch();
    this.searchTrigger.removeEventListener('click', this.selection);
    this.searchRoot?.removeEventListener('close', this.clearSearch);
    document.removeEventListener('privacychange', this.privacy);
    document.removeEventListener('linkpreferenceschange', this.preferencesChanged);
    this.log.removeEventListener('click', this.click, true);
    this.log.removeEventListener('dblclick', this.double, true);
    this.openingStatus.remove();
    this.searchRoot?.remove();
    this.searchTrigger.remove();
    setLinkPreferences(linkDefaults);
  }
}
