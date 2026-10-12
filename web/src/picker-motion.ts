type Positions = Map<HTMLElement, Map<string, DOMRect[]>>;

function cells(root: HTMLElement, ages: boolean): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(ages ? 'button[data-insert], .picker-age[data-age]' : 'button[data-insert]')];
}
function key(node: HTMLElement): string {
  return node.dataset.insert !== undefined ? 'i' + node.dataset.insert : 'a' + node.dataset.age;
}

// Separate regions prevent a recent copy from borrowing its grid copy's position.
export class PickerMotion {
  private active = new Set<Animation>();
  capture(roots: HTMLElement[], ages: boolean): Positions {
    const positions: Positions = new Map();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { this.stop(); return positions; }
    for (const root of roots) {
      const region = new Map<string, DOMRect[]>();
      for (const node of cells(root, ages)) {
        const copies = region.get(key(node)) ?? [];
        copies.push(node.getBoundingClientRect()); region.set(key(node), copies);
      }
      positions.set(root, region);
    }
    this.stop();
    return positions;
  }
  play(roots: HTMLElement[], before: Positions, ages: boolean): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { this.stop(); return; }
    const movers: { node: HTMLElement; dx: number; dy: number }[] = [];
    for (const root of roots) for (const node of cells(root, ages)) {
      const previous = before.get(root)?.get(key(node))?.shift();
      if (!previous || !previous.width || !previous.height) continue;
      const next = node.getBoundingClientRect();
      if (!next.width || !next.height) continue;
      const dx = previous.left - next.left, dy = previous.top - next.top;
      if (dx || dy) movers.push({ node, dx, dy });
    }
    // Finish layout reads before starting animation writes.
    for (const { node, dx, dy } of movers) {
      if (typeof node.animate !== 'function') continue;
      const animation = node.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }], { duration: 350, easing: 'ease' });
      this.active.add(animation);
      animation.onfinish = animation.oncancel = () => this.active.delete(animation);
    }
  }
  stop(): void {
    for (const animation of this.active) animation.cancel();
    this.active.clear();
  }
}
