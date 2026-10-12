export class ResourceAuthors {
  private sections: HTMLElement | null;
  private original: Node[];
  private info = 0;
  private sort = 'area';
  constructor(private root: HTMLElement) {
    this.sections = root.querySelector('#resources-author-sections');
    for (const control of root.querySelectorAll<HTMLAnchorElement>('a[data-ainfo],a[data-asort]')) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = control.textContent;
      button.title = control.title; Object.assign(button.dataset, control.dataset); control.replaceWith(button);
    }
    for (const row of this.sections?.querySelectorAll<HTMLElement>('.linkcols > i') ?? []) {
      const name = row.querySelector<HTMLAnchorElement>('a[data-b]'); if (!name) continue;
      const date = document.createElement('span'); date.className = 'author-life';
      const year = (value: string): string => Number(value) < 0 ? Math.abs(Number(value)) + ' BCE' : value;
      date.textContent = ' (' + year(name.dataset.b!) + (name.dataset.d ? '–' + year(name.dataset.d) : '') + ')'; name.after(date);
      for (const node of [...row.childNodes]) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const text = node.textContent ?? '', match = text.match(/ \(([^()]*?)(?: · ([^()]*))?\)/); if (!match || match.index === undefined) continue;
        const before = document.createTextNode(text.slice(0, match.index)), after = document.createTextNode(text.slice(match.index + match[0].length));
        const work = document.createElement('span'); work.className = 'author-work'; work.textContent = ' (' + match[1] + ')';
        const dates = document.createElement('span'); dates.className = 'author-dates'; dates.textContent = match[2] ? ' (' + match[2] + ')' : '';
        node.replaceWith(before, work, dates, after); this.link(work, name.dataset.w); break;
      }
      const theme = row.querySelector<HTMLElement>('.ag'); if (theme) this.link(theme, name.dataset.g);
    }
    this.original = [...this.sections?.childNodes ?? []]; root.addEventListener('click', this.click);
    this.paint();
  }
  private link(node: HTMLElement, href: string | undefined): void { if (!href) return; try { const url = new URL(href); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return; const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = node.textContent; node.replaceChildren(link); } catch { /* optional curated source */ } }
  state(): { info: number; sort: string } { return { info: this.info, sort: this.sort }; }
  restore(value: unknown): void { if (!value || typeof value !== 'object') return; const data = value as Record<string, unknown>; if (typeof data.info === 'number' && Number.isInteger(data.info) && data.info >= 0 && data.info <= 3) this.info = data.info; if (typeof data.sort === 'string' && ['area', 'birth', 'activity'].includes(data.sort)) this.sort = data.sort; this.paint(); }
  private paint(): void {
    this.root.dataset.authorInfo = String(this.info);
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-ainfo],[data-asort]')) button.setAttribute('aria-pressed', String(button.dataset.ainfo === String(this.info) || button.dataset.asort === this.sort));
    if (!this.sections) return;
    this.sections.replaceChildren(...this.original);
    if (this.sort === 'area') return;
    const names = new Set<string>(), rows: HTMLElement[] = [];
    for (const row of this.sections.querySelectorAll<HTMLElement>('.linkcols > i')) {
      const name = row.querySelector<HTMLAnchorElement>('a[data-b]'); if (!name || names.has(name.textContent ?? '')) continue; names.add(name.textContent ?? '');
      const copy = row.cloneNode(true) as HTMLElement; for (const head of copy.querySelectorAll(':scope > b')) head.remove(); rows.push(copy);
    }
    const stamp = (row: HTMLElement, key: 'b' | 'd'): number => Number(row.querySelector<HTMLElement>('a[data-b]')?.dataset[key]) || (key === 'd' ? 9999 : 0);
    rows.sort((a, b) => stamp(a, this.sort === 'birth' ? 'b' : 'd') - stamp(b, this.sort === 'birth' ? 'b' : 'd') || stamp(a, 'b') - stamp(b, 'b'));
    const list = document.createElement('span'); list.className = 'linkcols'; list.append(...rows); this.sections.replaceChildren(list);
  }
  private click = (event: MouseEvent): void => { if (!(event.target instanceof Element)) return; const button = event.target.closest<HTMLButtonElement>('button[data-ainfo],button[data-asort]'); if (!button) return; this.restore({ info: button.dataset.ainfo === undefined ? this.info : Number(button.dataset.ainfo), sort: button.dataset.asort ?? this.sort }); };
  stop(): void { this.root.removeEventListener('click', this.click); }
}
