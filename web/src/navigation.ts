// Message IDs are compared as data, never interpolated into CSS selectors.
export class MessageNavigation {
  private pending: string | undefined;
  private selected: HTMLElement | undefined;
  private readonly status: HTMLElement;
  constructor(private readonly log: HTMLElement, private readonly pause: () => void, private readonly locate?: (id: string) => void) {
    this.status = document.createElement('div'); this.status.className = 'message-navigation'; this.status.role = 'status';
    this.log.before(this.status);
    this.pending = new URL(location.href).searchParams.get('mid') || undefined;
    log.addEventListener('click', this.click);
    window.addEventListener('popstate', this.pop);
  }
  private pop = (): void => {
    this.pending = new URL(location.href).searchParams.get('mid') || undefined;
    this.selected?.classList.remove('target-message'); this.selected = undefined;
    if (!this.pending) this.status.textContent = '';
    this.reveal();
  };
  private click = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>('[data-jump], [data-permalink]');
    const id = button?.dataset.jump || button?.dataset.permalink;
    if (!id) return;
    const url = new URL(location.href); url.searchParams.set('mid', id); history.pushState(null, '', url);
    this.pending = id; this.reveal();
  };
  reveal(): void {
    if (!this.pending) {
      if (this.selected && !this.selected.isConnected) {
        const replacement = [...this.log.querySelectorAll<HTMLElement>('.row')].find((row) => row.dataset.id === this.selected?.dataset.id);
        if (replacement) { this.selected = replacement; replacement.classList.add('target-message'); }
      }
      return;
    }
    this.pause(); this.locate?.(this.pending);
    const found = [...this.log.querySelectorAll<HTMLElement>('.row')].find((row) => row.dataset.id === this.pending);
    if (!found) { this.status.textContent = 'Linked message is not in loaded history; waiting for available backfill'; return; }
    this.selected?.classList.remove('target-message'); this.selected = found;
    found.classList.add('target-message'); found.scrollIntoView?.({ block: 'center' });
    this.status.textContent = 'Viewing linked message'; this.pending = undefined;
  }
  stop(): void { this.log.removeEventListener('click', this.click); window.removeEventListener('popstate', this.pop); this.status.remove(); }
}
