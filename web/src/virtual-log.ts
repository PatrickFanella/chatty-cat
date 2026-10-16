import { getPresentation } from './presentation';
import { privacyEnabled } from './privacy';
import { pauseEmoteAnimations } from './emote-animation';
export interface LogItem {
  key: string;
  channel?: string;
  text?: string;
  highlight?: (scope: string) => boolean;
  visible?: (rules: readonly string[]) => boolean;
  render: (scope?: string) => HTMLElement;
}

// Variable-height rows retain their measured heights while outside the DOM.
// Only the viewport and a small overscan are mounted, even with 100k records.
export class VirtualLog {
  private pendingAnchor: { key: string; offset: number } | undefined;
  private beforePresentation = (): void => {
    this.pendingAnchor = this.readerPosition();
  };
  private items: readonly LogItem[] = [];
  private indexes = new Map<string, number>();
  private heights = new Map<string, number>();
  private offsets = new Float64Array(1);
  private start = 0;
  private end = 0;
  private frame = 0;
  private revision = -1;
  private stopped = false;
  private observer: ResizeObserver | undefined;
  private intersection: IntersectionObserver | undefined;
  private visibleRows = new Map<HTMLElement, boolean>();
  private visibility = (): void => {
    for (const [row, visible] of this.visibleRows) pauseEmoteAnimations(row, document.hidden || !visible);
  };
  private following = false;
  private reverse = false;
  private allowFollow = false;
  private hoverHeld = false;
  private pauseOnText = false;
  private manuallyPaused = false;
  private wheelDuringHold = false;

  private markerTrack = document.createElement('nav');
  private marked: { key: string; index: number }[] = [];
  private modifierHeld = false;
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
  private smoothTimer: ReturnType<typeof setTimeout> | undefined;
  private autoScrolling = false;
  private leading = this.spacer(0);
  private trailing = this.spacer(0);
  constructor(
    private log: HTMLElement,
    private scope = 'default',
  ) {
    document.addEventListener('presentation-before-change', this.beforePresentation);
    document.addEventListener('visibilitychange', this.visibility);
    if (typeof IntersectionObserver !== 'undefined')
      this.intersection = new IntersectionObserver(
        (entries) => {
          if (this.stopped) return;
          for (const entry of entries) {
            const row = entry.target as HTMLElement;
            if (!this.visibleRows.has(row)) continue;
            this.visibleRows.set(row, entry.isIntersecting);
            pauseEmoteAnimations(row, document.hidden || !entry.isIntersecting);
          }
        },
        { root: log, rootMargin: '150px 0px' },
      );
    this.markerTrack.className = 'scroll-markers';
    this.markerTrack.setAttribute('aria-label', 'Highlight positions');
    document.body.append(this.markerTrack);
    window.addEventListener('keydown', this.modifier);
    window.addEventListener('keyup', this.modifier);
    window.addEventListener('blur', this.releaseModifier);
    log.addEventListener('mouseover', this.hover);
    log.addEventListener('mouseleave', this.leave);
    log.addEventListener('wheel', this.wheel, { passive: false });
    log.addEventListener('touchstart', this.wheel, { passive: true });
    log.addEventListener('scroll', this.scroll, { passive: true });
    window.addEventListener('resize', this.schedule);
    if (typeof ResizeObserver !== 'undefined')
      this.observer = new ResizeObserver((entries) => {
        let changed = false;
        for (const entry of entries) {
          const node = entry.target as HTMLElement,
            key = node.dataset.virtualKey;
          const height =
            entry.borderBoxSize[0]?.blockSize ?? node.getBoundingClientRect().height / getPresentation().uiScale;
          if (key && height > 0 && Math.abs((this.heights.get(key) ?? 32) - height) > 0.5) {
            this.heights.set(key, height);
            node.style.containIntrinsicSize = `auto none auto ${height}px`;
            changed = true;
          }
        }
        if (changed) {
          const anchor = this.anchor();
          this.pendingAnchor = anchor;
          this.prefix();
          this.restore(anchor);
          this.schedule();
          this.log.dispatchEvent(new Event('logmetrics', { bubbles: true }));
        }
      });
  }
  set(items: readonly LogItem[], following: boolean, revision = 0, reverse = false, pauseOnText = false): void {
    const anchor = this.pendingAnchor ?? this.anchor();
    this.pendingAnchor = undefined;
    this.allowFollow = following;
    this.reverse = reverse;
    this.pauseOnText = pauseOnText;
    if (!pauseOnText && getPresentation().pauseHoverSeconds === 0) {
      this.hoverHeld = false;
      clearTimeout(this.hoverTimer);
      this.hoverTimer = undefined;
    }
    this.following = following && !this.manuallyPaused && !this.hoverHeld && !this.modifierHeld;
    if (revision !== this.revision) {
      this.heights.clear();
      this.revision = revision;
    }
    this.items = items;
    this.marked = [];
    if (getPresentation().markers)
      for (let i = items.length - 1; i >= 0 && this.marked.length < 50; i--)
        if (items[i]?.highlight?.(this.scope)) this.marked.push({ key: items[i]!.key, index: i });
    this.indexes = new Map(items.map((item, index) => [item.key, index]));
    for (const key of this.heights.keys()) if (!this.indexes.has(key)) this.heights.delete(key);
    this.prefix();
    this.restore(anchor);
    this.paint();
    // Measure the new rows before restoring a held reader after a style revision.
    // Waiting for ResizeObserver would capture an anchor from estimated positions.
    let measured = false;
    for (const node of this.log.children) {
      if (!(node instanceof HTMLElement) || !node.dataset.virtualKey) continue;
      const height = node.getBoundingClientRect().height / getPresentation().uiScale;
      if (height > 0 && Math.abs((this.heights.get(node.dataset.virtualKey) ?? 32) - height) > 0.5) {
        this.heights.set(node.dataset.virtualKey, height);
        node.style.containIntrinsicSize = `auto none auto ${height}px`;
        measured = true;
      }
    }
    if (measured) {
      this.prefix();
      this.restore(anchor);
      this.paint();
    }
    this.restore(anchor);
    if (anchor && !this.following) {
      const row = [...this.log.children].find(
        (node) => node instanceof HTMLElement && node.dataset.virtualKey === anchor.key,
      );
      if (row instanceof HTMLElement) {
        const rect = row.getBoundingClientRect(),
          edge = this.log.getBoundingClientRect().top;
        if (rect.height > 0) this.log.scrollTop += (anchor.offset - (edge - rect.top)) / getPresentation().uiScale;
      }
    }
  }
  private prefix(): void {
    this.offsets = new Float64Array(this.items.length + 1);
    for (let i = 0; i < this.items.length; i++)
      this.offsets[i + 1] = (this.offsets[i] ?? 0) + (this.heights.get(this.items[i]!.key) ?? 32);
  }
  private indexAt(offset: number): number {
    let low = 0,
      high = this.items.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if ((this.offsets[mid + 1] ?? 0) <= offset) low = mid + 1;
      else high = mid;
    }
    return Math.min(low, Math.max(0, this.items.length - 1));
  }
  private anchor(): { key: string; offset: number } | undefined {
    const edge = this.log.getBoundingClientRect().top;
    for (const row of this.log.children) {
      if (!(row instanceof HTMLElement) || !row.dataset.virtualKey) continue;
      const rect = row.getBoundingClientRect();
      if (rect.height > 0 && rect.bottom > edge) return { key: row.dataset.virtualKey, offset: edge - rect.top };
    }
    const index = this.indexAt(this.log.scrollTop),
      item = this.items[index];
    return item ? { key: item.key, offset: this.log.scrollTop - (this.offsets[index] ?? 0) } : undefined;
  }
  readerPosition(): { key: string; offset: number } | undefined {
    return this.following ? undefined : this.anchor();
  }
  restoreReader(position: { key: string; offset: number }): boolean {
    if (!this.indexes.has(position.key)) return false;
    this.manuallyPaused = true;
    this.following = false;
    this.restore(position);
    this.paint();
    this.restore(position, true);
    return true;
  }
  private restore(anchor: { key: string; offset: number } | undefined, alignDOM = false): void {
    if (this.following) {
      const target = this.reverse ? 0 : Math.max(0, (this.offsets.at(-1) ?? 0) - this.log.clientHeight);
      if (!this.canSmooth(target)) this.log.scrollTop = target;
    } else if (anchor) {
      const index = this.indexes.get(anchor.key);
      if (index !== undefined) {
        this.log.scrollTop = (this.offsets[index] ?? 0) + anchor.offset / getPresentation().uiScale;
        if (alignDOM) {
          const row = [...this.log.children].find(
            (node) => node instanceof HTMLElement && node.dataset.virtualKey === anchor.key,
          );
          if (row && row.getBoundingClientRect().height > 0)
            this.log.scrollTop +=
              (anchor.offset - (this.log.getBoundingClientRect().top - row.getBoundingClientRect().top)) /
              getPresentation().uiScale;
        }
      }
    }
  }
  private scroll = (): void => {
    if (this.autoScrolling) {
      this.schedule();
      return;
    }
    if (!this.autoScrolling && !this.pausedByHover())
      this.manuallyPaused = !(this.reverse
        ? this.log.scrollTop < 48
        : this.log.scrollHeight - this.log.clientHeight - this.log.scrollTop < 48);
    this.following = this.allowFollow && !this.manuallyPaused && !this.hoverHeld && !this.modifierHeld;
    this.schedule();
  };
  private holdHover(held: boolean): void {
    this.hoverHeld = held;
    this.wheelDuringHold = false;
    this.following = this.allowFollow && !this.manuallyPaused && !held && !this.modifierHeld;
    if (this.following) this.restore(undefined);
    this.schedule();
  }
  private hover = (event: MouseEvent): void => {
    const row = event.target instanceof Element ? event.target.closest('.row') : null;
    const p = getPresentation(),
      held = (this.pauseOnText || p.pauseHoverSeconds > 0) && !!row && this.log.contains(row);
    if (!held) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = undefined;
      this.holdHover(false);
    } else if (!this.hoverHeld && !this.hoverTimer) {
      if (p.pauseHoverSeconds > 0)
        this.hoverTimer = setTimeout(() => {
          this.hoverTimer = undefined;
          this.holdHover(true);
        }, p.pauseHoverSeconds * 1000);
      else this.holdHover(true);
    }
  };
  private leave = (): void => {
    clearTimeout(this.hoverTimer);
    this.hoverTimer = undefined;
    this.holdHover(false);
  };
  private modifier = (event: KeyboardEvent): void => {
    if (
      event.type === 'keydown' &&
      (event.isComposing || (event.target instanceof Element && event.target.closest('input,textarea,select')))
    )
      return;
    const key = getPresentation().pauseModifier,
      held =
        { shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey }[
          key as 'shift' | 'alt' | 'ctrl' | 'meta'
        ] ?? false;
    if (this.modifierHeld === held) return;
    this.modifierHeld = held;
    this.wheelDuringHold = false;
    this.following = this.allowFollow && !this.manuallyPaused && !this.hoverHeld && !held;
    this.schedule();
  };
  private releaseModifier = (): void => {
    this.modifierHeld = false;
    this.leave();
  };
  private wheel = (event: Event): void => {
    this.wheelDuringHold = true;
    this.autoScrolling = false;
    clearTimeout(this.smoothTimer);
    if (!(event instanceof WheelEvent) || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const p = getPresentation();
    if (p.scrollMultiplier === 1 && !p.smoothScroll) return;
    event.preventDefault();
    const delta =
      event.deltaY *
      (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.log.clientHeight : 1) *
      p.scrollMultiplier;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.log.scrollBy({ top: delta, behavior: p.smoothScroll && !reduced ? 'smooth' : 'auto' });
  };
  private canSmooth(target: number): boolean {
    return (
      getPresentation().smoothNew &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches &&
      Math.abs(target - this.log.scrollTop) <= 128 &&
      typeof this.log.scrollTo === 'function'
    );
  }
  private paintMarkers(): void {
    const rect = this.log.getBoundingClientRect();
    this.markerTrack.hidden =
      !getPresentation().markers ||
      !this.marked.length ||
      !this.log.isConnected ||
      rect.height <= 0 ||
      privacyEnabled();
    if (this.markerTrack.hidden) return;
    Object.assign(this.markerTrack.style, {
      top: rect.top / getPresentation().uiScale + 'px',
      left: rect.right / getPresentation().uiScale - 10 + 'px',
      height: rect.height / getPresentation().uiScale + 'px',
    });
    this.markerTrack.replaceChildren();
    const total = Math.max(1, this.offsets.at(-1) ?? 1);
    for (const { key, index } of this.marked) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = 'Jump to highlighted message';
      button.setAttribute('aria-label', 'Jump to highlighted message ' + (index + 1));
      button.style.top = String((100 * (this.offsets[index] ?? 0)) / total) + '%';
      button.addEventListener('click', () => {
        this.reveal(key);
        this.log.focus({ preventScroll: true });
      });
      this.markerTrack.append(button);
    }
  }
  pausedByHover(): boolean {
    return (this.hoverHeld || this.modifierHeld) && !this.wheelDuringHold;
  }
  isFollowing(): boolean {
    return this.allowFollow && !this.manuallyPaused;
  }
  resume(): void {
    this.manuallyPaused = false;
    this.following = this.allowFollow && !this.hoverHeld && !this.modifierHeld;
    if (this.following) this.restore(undefined);
    this.schedule();
  }
  hold(): void {
    this.manuallyPaused = true;
    this.following = false;
    this.schedule();
  }
  private schedule = (): void => {
    if (!this.frame && !this.stopped)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.paint();
      });
  };
  private spacer(height: number): HTMLElement {
    const node = document.createElement('div');
    node.className = 'log-spacer';
    node.setAttribute('aria-hidden', 'true');
    node.style.height = Math.max(0, height) + 'px';
    return node;
  }
  private release(node: Node): void {
    if (!(node instanceof HTMLElement)) return;
    this.intersection?.unobserve(node);
    this.visibleRows.delete(node);
    pauseEmoteAnimations(node, true);
    for (const media of node.querySelectorAll('video,audio'))
      if (media instanceof HTMLMediaElement) {
        media.pause();
        media.removeAttribute('src');
        media.querySelectorAll('source').forEach((source) => source.remove());
        media.closest('.social-card')?.remove();
        media.remove();
      }
    node.querySelectorAll('iframe,.youtube-inline-player').forEach((frame) => frame.remove());
    node.querySelectorAll('[data-youtube]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  }
  private paint(): void {
    const focused =
      document.activeElement instanceof HTMLElement && this.log.contains(document.activeElement)
        ? document.activeElement
        : undefined;
    if (this.stopped) return;
    const total = this.offsets.at(-1) ?? 0,
      height = this.log.clientHeight || 800;
    const top = this.following ? (this.reverse ? 0 : Math.max(0, total - height)) : this.log.scrollTop;
    this.start = Math.max(0, this.indexAt(Math.max(0, top - 500)));
    this.end = Math.min(this.items.length, this.indexAt(top + height + 500) + 1);
    const rows: HTMLElement[] = [];
    for (let i = this.start; i < this.end; i++) {
      const item = this.items[i]!;
      const row = item.render(this.scope);
      row.dataset.virtualKey = item.key;
      row.classList.toggle('last-message', i === (this.reverse ? 0 : this.items.length - 1));
      row.dataset.position = String(i + 1);
      row.style.setProperty('--row-parity', String(i % 2));
      row.style.contentVisibility = 'auto';
      row.style.containIntrinsicSize = `auto none auto ${this.heights.get(item.key) ?? 32}px`;
      if (!this.visibleRows.has(row)) {
        this.visibleRows.set(row, !this.intersection);
        this.intersection?.observe(row);
      }
      pauseEmoteAnimations(row, document.hidden || !this.visibleRows.get(row));
      rows.push(row);
    }
    this.observer?.disconnect();
    this.leading.style.height = Math.max(0, this.offsets[this.start] ?? 0) + 'px';
    this.trailing.style.height = Math.max(0, total - (this.offsets[this.end] ?? 0)) + 'px';
    const desired = [this.leading, ...rows, this.trailing],
      keep = new Set<Node>(desired);
    for (const node of [...this.log.childNodes])
      if (!keep.has(node)) {
        this.release(node);
        node.remove();
      }
    let cursor = this.log.firstChild;
    for (const node of desired) {
      if (node === cursor) cursor = cursor.nextSibling;
      else this.log.insertBefore(node, cursor);
    }
    for (const row of rows) this.observer?.observe(row);
    if (this.following) {
      const target = this.reverse ? 0 : Math.max(0, this.log.scrollHeight - this.log.clientHeight);
      if (this.canSmooth(target) && Math.abs(target - this.log.scrollTop) > 1) {
        if (!this.autoScrolling) {
          this.autoScrolling = true;
          this.log.scrollTo({ top: target, behavior: 'smooth' });
          this.smoothTimer = setTimeout(() => {
            this.autoScrolling = false;
            this.schedule();
          }, 350);
        }
      } else if (!this.autoScrolling) this.log.scrollTop = target;
    }
    this.paintMarkers();
    if (this.pendingAnchor) {
      this.restore(this.pendingAnchor, true);
      this.pendingAnchor = undefined;
    }
    this.log.dispatchEvent(new Event('virtualpaint', { bubbles: true }));
    if (focused?.isConnected) focused.focus({ preventScroll: true });
  }
  measuredHeight(key: string): number | undefined {
    return this.heights.get(key);
  }
  edgeKey(last: boolean): string | undefined {
    return this.items[last ? this.items.length - 1 : 0]?.key;
  }
  moveKey(current: string | undefined, delta: number): string | undefined {
    const index = current ? this.indexes.get(current) : undefined;
    return this.items[
      index === undefined
        ? delta < 0
          ? this.items.length - 1
          : 0
        : Math.max(0, Math.min(this.items.length - 1, index + delta))
    ]?.key;
  }
  reveal(key: string): boolean {
    const index = this.indexes.get(key);
    if (index === undefined) return false;
    this.manuallyPaused = true;
    this.following = false;
    this.allowFollow = false;
    this.log.scrollTop = Math.max(0, (this.offsets[index] ?? 0) - this.log.clientHeight / 2);
    this.paint();
    return true;
  }
  stop(): void {
    this.stopped = true;
    document.removeEventListener('presentation-before-change', this.beforePresentation);
    document.removeEventListener('visibilitychange', this.visibility);
    clearTimeout(this.hoverTimer);
    clearTimeout(this.smoothTimer);
    window.removeEventListener('keydown', this.modifier);
    window.removeEventListener('keyup', this.modifier);
    window.removeEventListener('blur', this.releaseModifier);
    this.markerTrack.remove();
    for (const node of this.log.children) this.release(node);
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.intersection?.disconnect();
    this.visibleRows.clear();
    this.log.removeEventListener('mouseover', this.hover);
    this.log.removeEventListener('mouseleave', this.leave);
    this.log.removeEventListener('wheel', this.wheel);
    this.log.removeEventListener('touchstart', this.wheel);
    this.log.removeEventListener('scroll', this.scroll);
    window.removeEventListener('resize', this.schedule);
  }
}
