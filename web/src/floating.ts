export interface Box { left: number; top: number; width: number; height: number }
export function fitBox(box: Box, width: number, height: number): Box {
  const w = Math.max(1, Math.min(box.width, width - 24));
  const h = Math.max(1, Math.min(box.height, height - 32));
  return { width: w, height: h, left: Math.max(12, Math.min(box.left, width - w - 12)), top: Math.max(16, Math.min(box.top, height - h - 16)) };
}
export interface FloatingState {box?:Box;pinned:boolean;open:boolean}
export class FloatingPanel {
  pinned = false;
  reopen = false;
  private box: Box | undefined;
  private drag: { pointer: number; x: number; y: number; box: Box } | undefined;
  private observer: ResizeObserver;
  constructor(private root: HTMLElement, private handle: HTMLElement, private pin: HTMLButtonElement, private key: string) {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (value && typeof value === 'object') {
        const d = value as Record<string, unknown>;
        this.pinned = d.pinned === true; this.reopen = this.pinned && d.open === true;
        if (['left', 'top', 'width', 'height'].every(k => typeof d[k] === 'number' && Number.isFinite(d[k]))) {
          const b = d as unknown as Box;
          if (b.width >= 260 && b.height >= 200) this.box = fitBox(b, innerWidth, innerHeight);
        }
      }
    } catch { /* optional storage */ }
    this.apply(); this.updatePin();
    this.handle.addEventListener('pointerdown', this.down); this.handle.addEventListener('pointermove', this.move);
    this.handle.addEventListener('pointerup', this.drop); this.handle.addEventListener('pointercancel', this.drop);
    this.handle.addEventListener('keydown', this.keyboard); this.pin.addEventListener('click', this.togglePin);
    window.addEventListener('resize', this.resize);
    this.observer = new ResizeObserver(() => { if (!root.hidden && root.dataset.rail!=='true') { this.capture(); this.apply(); this.save(); } });
    this.observer.observe(root);
  }
  state():FloatingState {if(!this.root.hidden&&this.root.dataset.rail!=='true')this.capture();return {...(this.box?{box:{...this.box}}:{}),pinned:this.pinned,open:!this.root.hidden};}
  restore(value:unknown):boolean {if(!value||typeof value!=='object')return false;const data=value as Record<string,unknown>;if(typeof data.pinned!=='boolean'||typeof data.open!=='boolean')return false;let box:Box|undefined;
   if(data.box!==undefined){if(!data.box||typeof data.box!=='object')return false;const raw=data.box as Record<string,unknown>;if(!['left','top','width','height'].every(key=>typeof raw[key]==='number'&&Number.isFinite(raw[key]))||Number(raw.width)<=0||Number(raw.height)<=0||Number(raw.width)>10000||Number(raw.height)>10000)return false;box=fitBox({left:Number(raw.left),top:Number(raw.top),width:Number(raw.width),height:Number(raw.height)},innerWidth,innerHeight);}
   this.box=box;this.pinned=data.pinned;this.reopen=data.open;if(!box){this.root.style.width='';this.root.style.height='';}this.apply();this.updatePin();this.save();return true;
  }
  geometry():Box|undefined {return this.box?{...this.box}:undefined;}
  configure(box:Box,pinned:boolean):void {this.box=fitBox(box,innerWidth,innerHeight);this.pinned=pinned;this.apply();this.updatePin();this.save();}
  opened(): void { if(this.root.dataset.rail==='true')return; this.reopen = true; this.apply(); this.save(); }
  closed(): void { if(this.root.dataset.rail==='true')return; this.reopen = false; this.save(); }
  private capture(): void {
    const r = this.root.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) this.box = fitBox(r, innerWidth, innerHeight);
  }
  private apply(): void {
    if (this.box) {
      this.box = fitBox(this.box, innerWidth, innerHeight);
      this.root.style.width = this.box.width + 'px'; this.root.style.height = this.box.height + 'px';
    }
    this.root.style.left = this.pinned && this.box ? this.box.left + 'px' : '';
    this.root.style.top = this.pinned && this.box ? this.box.top + 'px' : '';
    this.root.style.right = this.pinned && this.box ? 'auto' : '';
    this.root.style.bottom = this.pinned && this.box ? 'auto' : '';
  }
  private updatePin(): void { this.root.dataset.pinned=String(this.pinned); this.pin.setAttribute('aria-pressed', String(this.pinned)); this.pin.textContent = this.pinned ? 'Unpin' : 'Pin'; }
  private save(): void { try { localStorage.setItem(this.key, JSON.stringify({ ...this.box, pinned: this.pinned, open: this.reopen })); } catch { /* optional storage */ } }
  private togglePin = (): void => { if(this.root.dataset.rail==='true')return; this.capture(); this.pinned = !this.pinned; this.apply(); this.updatePin(); this.save(); };
  private down = (e: PointerEvent): void => {
    if (e.button !== 0 || this.root.hidden || this.root.dataset.rail==='true') return;
    e.preventDefault(); this.capture(); if (!this.box) return;
    this.drag = { pointer: e.pointerId, x: e.clientX, y: e.clientY, box: { ...this.box } };
    try { this.handle.setPointerCapture(e.pointerId); } catch { /* unsupported capture */ }
  };
  private move = (e: PointerEvent): void => {
    const d = this.drag; if (!d || e.pointerId !== d.pointer) return;
    this.pinned = true; this.box = fitBox({ ...d.box, left: d.box.left + e.clientX - d.x, top: d.box.top + e.clientY - d.y }, innerWidth, innerHeight);
    this.apply(); this.updatePin();
  };
  private drop = (e: PointerEvent): void => { if (e.pointerId !== this.drag?.pointer) return; this.drag = undefined; this.save(); };
  private keyboard = (e: KeyboardEvent): void => { if(this.root.dataset.rail==='true')return;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = delta[e.key]; if (!move) return; e.preventDefault(); this.capture(); if (!this.box) return;
    const step = e.shiftKey ? 40 : 10; this.pinned = true;
    this.box = fitBox({ ...this.box, left: this.box.left + move[0] * step, top: this.box.top + move[1] * step }, innerWidth, innerHeight);
    this.apply(); this.updatePin(); this.save();
  };
  private resize = (): void => { if(this.root.dataset.rail==='true')return; this.apply(); this.save(); };
  stop(): void {
    this.save(); this.observer.disconnect(); window.removeEventListener('resize', this.resize);
    this.handle.removeEventListener('pointerdown', this.down); this.handle.removeEventListener('pointermove', this.move);
    this.handle.removeEventListener('pointerup', this.drop); this.handle.removeEventListener('pointercancel', this.drop);
    this.handle.removeEventListener('keydown', this.keyboard); this.pin.removeEventListener('click', this.togglePin);
  }
}
