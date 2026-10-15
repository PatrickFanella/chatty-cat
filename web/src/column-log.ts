import { VirtualLog, type LogItem } from './virtual-log';

// Page columns keep the newest pages visible and retire older pages into the
// first column's virtual history. The archive never becomes a 100k-node DOM.
export class ColumnLog {
  private views: VirtualLog[] = [];
  private columns: HTMLElement[] = [];
  private items: readonly LogItem[] = [];
  private pages: string[][] = [];
  private active = 0;
  private count = 1;
  private revision = -1;
  private reverse = false;
  private following = true;
  private pauseHover = false;
  private hovered = -1;
  private manual = new Set<number>();
  private frame = 0;
  private observer: ResizeObserver | undefined;
  constructor(private root: HTMLElement) {
    this.rebuild(1);
    if (typeof ResizeObserver !== 'undefined') this.observer = new ResizeObserver(this.refit);
    this.observer?.observe(root);
    root.addEventListener('logmetrics', this.refit);
    root.addEventListener('pointerover', this.over);
    root.addEventListener('pointerout', this.out);
    root.addEventListener('wheel', this.scrollIntent, { passive: true });
    root.addEventListener('touchstart', this.scrollIntent, { passive: true });
  }
  private rebuild(count: number): void {
    for (const view of this.views) view.stop();
    this.views = [];
    this.columns = [];
    this.hovered = -1;
    this.manual.clear();
    this.count = count;
    this.active = count - 1;
    this.pages = Array.from({ length: count }, () => []);
    this.root.replaceChildren();
    this.root.classList.toggle('page-columns', count > 1);
    if (count === 1) {
      this.columns = [this.root];
      this.views = [new VirtualLog(this.root)];
      return;
    }
    for (let i = 0; i < count; i++) {
      const column = document.createElement('section');
      column.className = 'log-column';
      column.tabIndex = 0;
      column.setAttribute('aria-label', 'Chat column ' + (i + 1));
      this.root.append(column);
      this.columns.push(column);
      this.views.push(new VirtualLog(column));
    }
  }
  set(
    items: readonly LogItem[],
    following: boolean,
    revision = 0,
    reverse = false,
    mode = 1,
    pauseHover = false,
  ): void {
    this.pauseHover = pauseHover;
    if (!pauseHover) this.hovered = -1;
    const count = mode === 2 ? 2 : mode === 3 ? (innerWidth > innerHeight ? 3 : 2) : 1;
    const reset = count !== this.count || reverse !== this.reverse || revision !== this.revision;
    const previousLast = this.items.at(-1)?.key;
    this.items = items;
    this.reverse = reverse;
    this.following = following;
    this.revision = revision;
    if (count !== this.count) this.rebuild(count);
    if (count === 1) {
      this.views[0]!.set(items, following && !this.held(0), revision, reverse);
      return;
    }
    if (reverse) {
      this.dealReverse();
      this.paint();
      return;
    }
    if (!following && !reset) return;
    const indexes = new Map(items.map((item, i) => [item.key, i]));
    if (reset || !previousLast || !indexes.has(previousLast) || !this.pages.some((page) => page.length)) this.deal();
    else {
      for (const page of this.pages)
        for (let i = page.length - 1; i >= 0; i--) if (!indexes.has(page[i]!)) page.splice(i, 1);
      const start = indexes.get(previousLast)! + 1;
      for (const item of items.slice(start)) {
        if (this.held(this.active)) {
          const next = this.nextActive();
          if (next < 0) break;
          this.active = next;
          this.pages[next] = [];
        }
        let page = this.pages[this.active]!;
        if (page.length && this.pageHeight(page) + this.height(item.key) > this.room()) {
          const next = this.nextActive();
          if (next < 0) break;
          this.active = next;
          page = [];
          this.pages[this.active] = page;
        }
        page.push(item.key);
      }
      if (this.pages.some((page, i) => i !== this.active && page.length > 1 && this.pageHeight(page) > this.room() + 1))
        this.deal();
    }
    this.paint();
  }
  private held(index: number): boolean {
    return index === this.hovered || this.manual.has(index);
  }
  private nextActive(): number {
    for (let step = 1; step <= this.count; step++) {
      const next = (this.active + step) % this.count;
      if (!this.held(next)) return next;
    }
    return -1;
  }
  private height(key: string): number {
    for (const view of this.views) {
      const height = view.measuredHeight(key);
      if (height !== undefined) return height;
    }
    return 32;
  }
  private room(): number {
    return Math.max(32, (this.columns[0]?.clientHeight || this.root.clientHeight || 640) - 16);
  }
  private pageHeight(keys: readonly string[]): number {
    return keys.reduce((sum, key) => sum + this.height(key), 0);
  }
  private deal(): void {
    const available = Array.from(
      { length: this.count },
      (_, step) => (this.active - step + this.count) % this.count,
    ).filter((index) => !this.held(index));
    if (!available.length) return;
    const retained = new Set(this.pages.filter((_, index) => this.held(index)).flat());
    for (const index of available) this.pages[index] = [];
    this.active = available[0]!;
    let page = 0,
      used = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const key = this.items[i]!.key;
      if (retained.has(key)) continue;
      const height = this.height(key);
      let column = available[page]!;
      if (this.pages[column]!.length && used + height > this.room()) {
        if (page === available.length - 1) break;
        column = available[++page]!;
        used = 0;
      }
      this.pages[column]!.unshift(key);
      used += height;
    }
  }
  private dealReverse(): void {
    const available = Array.from({ length: this.count }, (_, index) => index).filter((index) => !this.held(index));
    if (!available.length) return;
    const retained = new Set(this.pages.filter((_, index) => this.held(index)).flat());
    for (const index of available) this.pages[index] = [];
    let page = 0,
      used = 0;
    for (const item of this.items) {
      if (retained.has(item.key)) continue;
      const height = this.height(item.key);
      let column = available[page]!;
      if (page < available.length - 1 && this.pages[column]!.length && used + height > this.room()) {
        column = available[++page]!;
        used = 0;
      }
      this.pages[column]!.push(item.key);
      used += height;
    }
    this.active = available[0]!;
  }
  private paint(): void {
    const byKey = new Map(this.items.map((item) => [item.key, item]));
    const live = new Set(this.pages.flat());
    const archived = this.reverse ? [] : this.items.filter((item) => !live.has(item.key));
    for (let i = 0; i < this.count; i++) {
      const page = this.pages[i]!.map((key) => byKey.get(key)).filter((item): item is LogItem => !!item);
      const rows = i === 0 && !this.reverse ? [...archived, ...page] : page;
      this.columns[i]!.dataset.active = String(i === this.active);
      this.views[i]!.set(rows, this.following && !this.held(i), this.revision, this.reverse);
    }
    this.root.dispatchEvent(new Event('virtualpaint'));
  }
  private columnAt(target: EventTarget | null): number {
    if (!(target instanceof Element)) return -1;
    const column = target.closest('.log-column');
    return this.count === 1 && this.root.contains(target)
      ? 0
      : column instanceof HTMLElement
        ? this.columns.indexOf(column)
        : -1;
  }
  private over = (event: PointerEvent): void => {
    if (!this.pauseHover || !this.following) return;
    const index = this.columnAt(event.target);
    const next = event.target instanceof Element && event.target.closest('.row') ? index : -1;
    if (next !== this.hovered) {
      this.hovered = next;
      this.paintCurrent();
    }
  };
  private out = (event: PointerEvent): void => {
    if (this.hovered < 0) return;
    if (
      event.relatedTarget instanceof Element &&
      event.relatedTarget.closest('.row') &&
      this.columnAt(event.relatedTarget) === this.hovered
    )
      return;
    this.hovered = -1;
    this.paintCurrent();
  };
  private paintCurrent(): void {
    if (this.count === 1) this.views[0]!.set(this.items, this.following && !this.held(0), this.revision, this.reverse);
    else this.paint();
  }
  hoverPaused(target: EventTarget | null): boolean {
    return this.hovered >= 0 && !this.manual.has(this.hovered) && this.columnAt(target) === this.hovered;
  }
  private scrollIntent = (event: Event): void => {
    const index = this.columnAt(event.target);
    if (index >= 0 && this.following) this.manual.add(index);
  };
  private refit = (): void => {
    if (this.frame || this.count === 1 || !this.following) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.reverse) this.dealReverse();
      else if (
        this.pages.some((page, i) => i !== this.active && page.length > 1 && this.pageHeight(page) > this.room() + 1)
      )
        this.deal();
      else {
        const page = this.pages[this.active]!;
        let used = 0,
          cut = page.length;
        for (let i = 0; i < page.length; i++) {
          const height = this.height(page[i]!);
          if (i > 0 && used + height > this.room()) {
            cut = i;
            break;
          }
          used += height;
        }
        if (cut < page.length && !this.held(this.active) && this.nextActive() >= 0) {
          const spill = page.splice(cut);
          this.active = this.nextActive();
          this.pages[this.active] = spill;
          if (this.pageHeight(spill) > this.room()) this.deal();
        }
      }
      this.paint();
    });
  };
  // Scroll events in page layouts hold their own column while transport stays live.
  trackScroll(target: EventTarget | null, following: boolean): boolean {
    if (this.count === 1) {
      const live = this.isAtLive(target);
      if (live) {
        this.manual.delete(0);
        this.views[0]?.resume();
      } else this.manual.add(0);
      return live;
    }
    const index = this.columnAt(target);
    if (index < 0 || !following) return following;
    if (this.isAtLive(target)) {
      const wasHeld = this.manual.delete(index);
      if (wasHeld) {
        this.views[index]?.resume();
        if (this.reverse) this.dealReverse();
        else this.deal();
        this.paint();
      }
    } else this.manual.add(index);
    return true;
  }
  readerPositions(): { column: number; key: string; offset: number }[] {
    return this.views.flatMap((view, column) => {
      const position = view.readerPosition();
      return position ? [{ column, ...position }] : [];
    });
  }
  restoreReaders(positions: readonly { column: number; key: string; offset: number }[]): boolean {
    let restored = true;
    for (const position of positions) {
      const view = this.views[position.column];
      if (!view || !view.restoreReader(position)) restored = false;
      else this.manual.add(position.column);
    }
    return restored;
  }
  hasManualPause(): boolean {
    return this.manual.size > 0;
  }
  resume(): void {
    this.manual.clear();
    this.hovered = -1;
    for (const view of this.views) view.resume();
    if (this.count > 1) {
      if (this.reverse) this.dealReverse();
      else this.deal();
    }
  }
  isAtLive(target: EventTarget | null = this.root): boolean {
    const column = target instanceof HTMLElement && this.columns.includes(target) ? target : this.columns[this.active]!;
    return this.reverse ? column.scrollTop < 48 : column.scrollHeight - column.clientHeight - column.scrollTop < 48;
  }
  edgeKey(last: boolean): string | undefined {
    return this.items[last ? this.items.length - 1 : 0]?.key;
  }
  pausedByHover(target: EventTarget | null): boolean {
    const index = this.columns.findIndex((column) => column === target);
    return index >= 0 && (this.views[index]?.pausedByHover() ?? false);
  }
  allFollowing(): boolean {
    return (
      this.following &&
      !this.manual.size &&
      this.views.every((view, index) => index === this.hovered || view.isFollowing())
    );
  }
  moveKey(current: string | undefined, delta: number): string | undefined {
    const index = current ? this.items.findIndex((item) => item.key === current) : -1;
    return this.items[
      index < 0 ? (delta < 0 ? this.items.length - 1 : 0) : Math.max(0, Math.min(this.items.length - 1, index + delta))
    ]?.key;
  }
  reveal(key: string): boolean {
    this.following = false;
    this.hovered = -1;
    if (this.count === 1) return this.views[0]!.reveal(key);
    for (let i = 0; i < this.pages.length; i++) if (this.pages[i]!.includes(key)) return this.views[i]!.reveal(key);
    return this.views[0]!.reveal(key);
  }
  stop(): void {
    this.root.removeEventListener('pointerover', this.over);
    this.root.removeEventListener('pointerout', this.out);
    this.root.removeEventListener('wheel', this.scrollIntent);
    this.root.removeEventListener('touchstart', this.scrollIntent);
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.root.removeEventListener('logmetrics', this.refit);
    for (const view of this.views) view.stop();
  }
}
