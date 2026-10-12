export interface LogItem { key: string; render: () => HTMLElement }

// Variable-height rows retain their measured heights while outside the DOM.
// Only the viewport and a small overscan are mounted, even with 100k records.
export class VirtualLog {
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
  private following = false;
  private reverse = false;
  private allowFollow = false;
  private hoverHeld = false;
  private pauseOnText = false;
  private manuallyPaused = false;
  private wheelDuringHold = false;

  private leading=this.spacer(0);
  private trailing=this.spacer(0);
  constructor(private log: HTMLElement) {
    log.addEventListener('mouseover', this.hover); log.addEventListener('mouseleave', this.leave); log.addEventListener('wheel', this.wheel, { passive: true }); log.addEventListener('touchstart', this.wheel, { passive: true });
    log.addEventListener('scroll', this.scroll, { passive: true }); window.addEventListener('resize', this.schedule);
    if (typeof ResizeObserver !== 'undefined') this.observer = new ResizeObserver(entries => {
      let changed = false;
      for (const entry of entries) {
        const node = entry.target as HTMLElement, key = node.dataset.virtualKey;
        const height = entry.borderBoxSize[0]?.blockSize ?? node.getBoundingClientRect().height;
        if (key && height > 0 && Math.abs((this.heights.get(key) ?? 32) - height) > .5) { this.heights.set(key, height); changed = true; }
      }
      if (changed) { const anchor = this.anchor(); this.prefix(); this.restore(anchor); this.schedule(); this.log.dispatchEvent(new Event('logmetrics',{bubbles:true})); }
    });
  }
  set(items: readonly LogItem[], following: boolean, revision = 0, reverse = false, pauseOnText = false): void {
    const anchor = this.anchor(); this.allowFollow = following;this.reverse=reverse;this.pauseOnText=pauseOnText;if(!pauseOnText)this.hoverHeld=false;this.following=following&&!this.manuallyPaused&&!this.hoverHeld;
    if (revision !== this.revision) { this.heights.clear(); this.revision = revision; }
    this.items = items; this.indexes = new Map(items.map((item, index) => [item.key, index]));
    for (const key of this.heights.keys()) if (!this.indexes.has(key)) this.heights.delete(key);
    this.prefix(); this.restore(anchor); this.paint(); this.restore(anchor);
  }
  private prefix(): void {
    this.offsets = new Float64Array(this.items.length + 1);
    for (let i = 0; i < this.items.length; i++) this.offsets[i + 1] = (this.offsets[i] ?? 0) + (this.heights.get(this.items[i]!.key) ?? 32);
  }
  private indexAt(offset: number): number {
    let low = 0, high = this.items.length;
    while (low < high) { const mid = (low + high) >>> 1; if ((this.offsets[mid + 1] ?? 0) <= offset) low = mid + 1; else high = mid; }
    return Math.min(low, Math.max(0, this.items.length - 1));
  }
  private anchor(): { key: string; offset: number } | undefined {
    const edge = this.log.getBoundingClientRect().top + this.log.clientTop + (parseFloat(getComputedStyle(this.log).paddingTop) || 0);
    for (const row of this.log.children) {
      if (!(row instanceof HTMLElement) || !row.dataset.virtualKey) continue;
      const rect = row.getBoundingClientRect();
      if (rect.height > 0 && rect.bottom > edge) return { key: row.dataset.virtualKey, offset: edge - rect.top };
    }
    const index = this.indexAt(this.log.scrollTop), item = this.items[index];
    return item ? { key: item.key, offset: this.log.scrollTop - (this.offsets[index] ?? 0) } : undefined;
  }
  private restore(anchor: { key: string; offset: number } | undefined): void {
    if (this.following) this.log.scrollTop = this.reverse?0:Math.max(0, (this.offsets.at(-1) ?? 0) - this.log.clientHeight);
    else if (anchor) { const index = this.indexes.get(anchor.key); if (index !== undefined) this.log.scrollTop = (this.offsets[index] ?? 0) + anchor.offset; }
  }
  private scroll = (): void => { if(!this.pausedByHover())this.manuallyPaused=!(this.reverse?this.log.scrollTop<48:this.log.scrollHeight-this.log.clientHeight-this.log.scrollTop<48);this.following=this.allowFollow&&!this.manuallyPaused&&!this.hoverHeld;this.schedule(); };
  private hover = (event:MouseEvent):void => {const row=event.target instanceof Element?event.target.closest('.row'):null;const held=this.pauseOnText&&!!row&&this.log.contains(row);if(held===this.hoverHeld)return;this.hoverHeld=held;this.wheelDuringHold=false;this.following=this.allowFollow&&!this.manuallyPaused&&!held;if(this.following)this.restore(undefined);this.schedule();};
  private leave = ():void => {this.hoverHeld=false;this.wheelDuringHold=false;this.following=this.allowFollow&&!this.manuallyPaused;if(this.following)this.restore(undefined);this.schedule();};
  private wheel = ():void => {this.wheelDuringHold=true;};
  pausedByHover():boolean {return this.hoverHeld&&!this.wheelDuringHold;}
  isFollowing():boolean {return this.allowFollow&&!this.manuallyPaused;}
  resume():void {this.manuallyPaused=false;this.following=this.allowFollow&&!this.hoverHeld;if(this.following)this.restore(undefined);this.schedule();}
  private schedule = (): void => {
    if (!this.frame && !this.stopped) this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  };
  private spacer(height: number): HTMLElement {
    const node = document.createElement('div'); node.className = 'log-spacer'; node.setAttribute('aria-hidden', 'true'); node.style.height = Math.max(0, height) + 'px'; return node;
  }
  private paint(): void {
    const focused=document.activeElement instanceof HTMLElement&&this.log.contains(document.activeElement)?document.activeElement:undefined;
    if (this.stopped) return;
    const total = this.offsets.at(-1) ?? 0, height = this.log.clientHeight || 800;
    const top = this.following ? this.reverse?0:Math.max(0, total - height) : this.log.scrollTop;
    this.start = Math.max(0, this.indexAt(Math.max(0, top - 500)));
    this.end = Math.min(this.items.length, this.indexAt(top + height + 500) + 1);
    const rows: HTMLElement[] = [];
    for (let i = this.start; i < this.end; i++) {
      const item = this.items[i]!; const row = item.render(); row.dataset.virtualKey = item.key;
      row.dataset.position = String(i + 1); row.style.setProperty('--row-parity', String(i % 2)); rows.push(row);
    }
    this.observer?.disconnect();
    this.leading.style.height=Math.max(0,this.offsets[this.start]??0)+'px';
    this.trailing.style.height=Math.max(0,total-(this.offsets[this.end]??0))+'px';
    const desired=[this.leading,...rows,this.trailing],keep=new Set<Node>(desired);
    for(const node of [...this.log.childNodes])if(!keep.has(node))node.remove();
    let cursor=this.log.firstChild;
    for(const node of desired){if(node===cursor)cursor=cursor.nextSibling;else this.log.insertBefore(node,cursor);}
    for (const row of rows) this.observer?.observe(row);
    if (this.following) this.log.scrollTop = this.reverse?0:this.log.scrollHeight;
    this.log.dispatchEvent(new Event('virtualpaint',{bubbles:true}));
    if(focused?.isConnected)focused.focus({preventScroll:true});
  }
  measuredHeight(key:string):number|undefined {return this.heights.get(key);}
  edgeKey(last:boolean):string|undefined { return this.items[last?this.items.length-1:0]?.key; }
  moveKey(current:string|undefined,delta:number):string|undefined { const index=current?this.indexes.get(current):undefined;return this.items[index===undefined?(delta<0?this.items.length-1:0):Math.max(0,Math.min(this.items.length-1,index+delta))]?.key; }
  reveal(key: string): boolean {
    const index = this.indexes.get(key); if (index === undefined) return false;
    this.following = false; this.allowFollow = false; this.log.scrollTop = Math.max(0, (this.offsets[index] ?? 0) - this.log.clientHeight / 2); this.paint(); return true;
  }
  stop(): void { this.stopped = true; cancelAnimationFrame(this.frame); this.observer?.disconnect(); this.log.removeEventListener('mouseover',this.hover);this.log.removeEventListener('mouseleave',this.leave);this.log.removeEventListener('wheel',this.wheel);this.log.removeEventListener('touchstart',this.wheel);this.log.removeEventListener('scroll', this.scroll); window.removeEventListener('resize', this.schedule); }
}
