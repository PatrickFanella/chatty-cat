import { EMOJIS } from './emoji';
const emojiSet = new Set(EMOJIS);
/** Keep transient picker feedback separate from the recorded use order. */
export class PickerLighting {
  private colours = new Map<string, { hue: number; until: number }>();
  private hue = 0;
  private frame = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private observer: MutationObserver;
  constructor(
    private log: HTMLElement,
    private picker: HTMLElement,
  ) {
    log.addEventListener('virtualpaint', this.schedule);
    log.addEventListener('scroll', this.schedule, true);
    this.observer = new MutationObserver(this.schedule);
    this.observer.observe(picker, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }
  use(codes: readonly string[]): void {
    if (this.picker.hidden || !codes.length) return;
    for (const code of new Set(codes)) {
      this.colours.delete(code);
      this.colours.set(code, { hue: (this.hue = (this.hue + 5) % 360), until: Date.now() + 3600 });
    }
    while (this.colours.size > 1024) {
      const first = this.colours.keys().next().value;
      if (first) this.colours.delete(first);
      else break;
    }
    this.schedule();
    clearTimeout(this.timer);
    this.timer = setTimeout(this.expire, 3600);
  }
  private expire = (): void => {
    this.timer = undefined;
    this.schedule();
    const next = Math.min(
      ...[...this.colours.values()].map((value) => value.until).filter((until) => until > Date.now()),
    );
    if (Number.isFinite(next)) this.timer = setTimeout(this.expire, Math.max(1, next - Date.now()));
  };
  private schedule = (): void => {
    if (!this.frame) this.frame = requestAnimationFrame(this.paint);
  };
  private paint = (): void => {
    this.frame = 0;
    if (this.picker.hidden) return;
    const visible = new Set<string>();
    const viewport = this.log.getBoundingClientRect();
    for (const row of this.log.querySelectorAll<HTMLElement>('.row')) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom <= viewport.top || rect.top >= viewport.bottom) continue;
      for (const image of row.querySelectorAll<HTMLImageElement>('img.emote'))
        if (image.dataset.emoteCode) visible.add(image.dataset.emoteCode);
      for (const word of (row.querySelector('.message')?.textContent ?? '').split(/\s+/))
        if (emojiSet.has(word)) visible.add(word);
    }
    for (const [code, value] of this.colours)
      if (value.until <= Date.now() && !visible.has(code)) this.colours.delete(code);
    for (const cell of this.picker.querySelectorAll<HTMLElement>('button[data-insert]')) {
      const code = cell.dataset.insert!,
        colour = this.colours.get(code);
      cell.classList.toggle('picker-lit', visible.has(code));
      cell.classList.toggle('picker-flash', !!colour && colour.until > Date.now());
      cell.style.setProperty('--use-colour', colour ? 'hsl(' + colour.hue + ' 65% 55%)' : 'var(--accent)');
    }
  };
  stop(): void {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.timer);
    this.observer.disconnect();
    this.log.removeEventListener('virtualpaint', this.schedule);
    this.log.removeEventListener('scroll', this.schedule, true);
    this.colours.clear();
  }
}
