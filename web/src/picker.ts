import {capturePicker,animatePicker} from './picker-motion';
import { AGE_SECONDS, ageLabel, crossedAges } from './picker-order';
import { FloatingPanel } from './floating';
import { PickerModel, pickerURL, SOURCES, type PickerItem } from './picker-model';

function get<T extends HTMLElement>(root: HTMLElement, id: string, ctor: new () => T): T {
  const node = root.querySelector('#' + id); if (!(node instanceof ctor)) throw new Error('Missing picker control: ' + id); return node;
}
export class EmotePicker {
  private readonly search: HTMLInputElement;
  private readonly grid: HTMLElement;
  private readonly recent: HTMLElement;
  private readonly count: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly more: HTMLButtonElement;
  private readonly settings: HTMLElement;
  private movement:Animation[]=[];
  private held = false;
  private gridHeld=false;
  private borrowed=false;
  private ageObserver:ResizeObserver;
  private ageHistory=new Map<string,{last:number;age:number}>();
  private ageCrossed=new Map<string,Set<number>>();
  private dirty = false;
  private page = 200;
  private nextAgeRefresh = Infinity;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly floating: FloatingPanel;
  private readonly saveTimer: ReturnType<typeof setInterval>;
  constructor(private readonly root: HTMLElement, private readonly trigger: HTMLButtonElement,
    private readonly model: PickerModel, private readonly channel: () => string,
    private readonly canInsert: () => boolean, private readonly insert: (code: string) => void, private readonly temporaryFreeze:(on:boolean)=>void=()=>{}) {
    this.search = get(root, 'picker-search', HTMLInputElement); this.grid = get(root, 'picker-grid', HTMLElement);
    this.ageObserver=new ResizeObserver(()=>this.paintAgeRows());this.ageObserver.observe(this.grid);
    this.recent = get(root, 'picker-recent', HTMLElement); this.count = get(root, 'picker-count', HTMLElement);
    this.tabs = get(root, 'picker-tabs', HTMLElement); this.more = get(root, 'picker-more', HTMLButtonElement);
    this.settings = get(root, 'picker-settings', HTMLElement);
    for (const source of SOURCES) {
      const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = source;
      checkbox.checked = model.options.enabled.includes(source); label.append(checkbox, source); this.tabs.append(label);
    }
    get(root, 'picker-sort', HTMLSelectElement).value = model.options.sort;
    get(root, 'picker-animation', HTMLSelectElement).value = model.options.animation;
    get(root, 'picker-zoom', HTMLSelectElement).value = String(model.options.zoom);
    get(root,'picker-ageRows',HTMLSelectElement).value=String(model.options.ageRows);
    for (const key of ['mixed', 'names', 'hold', 'holdPlus', 'frozen', 'seenOnly', 'ages'] as const) get(root, 'picker-' + key, HTMLInputElement).checked = model.options[key];
    this.grid.addEventListener('pointerenter',this.gridEnter);this.grid.addEventListener('pointerleave',this.gridLeave);
    trigger.addEventListener('click', this.toggle); root.addEventListener('click', this.click);
    document.addEventListener('keydown', this.key, true); root.addEventListener('pointerenter', this.enter); root.addEventListener('pointerleave', this.leave);
    get(root,'picker-reset-order',HTMLButtonElement).addEventListener('click',this.resetOrder);
    get(root,'picker-sort',HTMLSelectElement).addEventListener('auxclick',this.resetMiddle);
    this.tabs.addEventListener('change', this.change); this.settings.addEventListener('change', this.change);
    this.search.addEventListener('input', this.searchChange); this.search.addEventListener('keydown', this.searchKey); this.more.addEventListener('click', this.showMore);
    this.timer = setInterval(() => { if ((this.dirty || Date.now() >= this.nextAgeRefresh) && (!this.held || !this.model.options.hold)) this.refresh(true); }, 1000);
    this.saveTimer = setInterval(() => this.model.saveAll(), 15000);
    this.floating = new FloatingPanel(root, get(root, 'picker-handle', HTMLElement), get(root, 'picker-pin', HTMLButtonElement), 'chatthing:v1:picker:geometry');
    const query=new URL(location.href).searchParams;const geometry=parsePickerGeometry(query.get('epgeo'));if(geometry)this.floating.configure(geometry,query.get('epgeo')?.includes(',')??false);
    if(query.has('epopen'))this.floating.reopen=query.get('epopen')!=='0';
    if (this.floating.reopen) this.open();
  }
  refresh(force = false): void {
    if (!force) { this.dirty = true; return; }
    if (this.root.hidden || (!force && this.held && this.model.options.hold)) { this.dirty = true; return; }
    this.dirty = false;
    const items = this.model.query(this.channel(), this.search.value);
    const displayed = items.slice(0, this.page);
    const oldTop = this.grid.scrollTop;
    const positions=capturePicker(this.root,this.model.options.ageRows);
    for(const animation of this.movement)animation.cancel();
    this.grid.replaceChildren();
    let source = '';
    const channel=this.channel(),crossed=this.ageCrossed.get(channel)??new Set<number>();this.ageCrossed.set(channel,crossed);
    const nowAge=Date.now();for(const item of displayed){const last=this.model.lastUse(channel,item.code);if(!last)continue;const key=channel+'/'+item.code,age=Math.max(0,nowAge-last),old=this.ageHistory.get(key);if(old?.last===last)for(const seconds of crossedAges(old.age,age))crossed.add(seconds);this.ageHistory.delete(key);this.ageHistory.set(key,{last,age});}while(this.ageHistory.size>10000){const first=this.ageHistory.keys().next().value;if(first)this.ageHistory.delete(first);else break;}
    const oldestAge=Math.max(0,...displayed.map(item=>this.model.lastUse(channel,item.code)).filter(Boolean).map(last=>Math.max(0,nowAge-last)));
    const freshness=new Map<string,number>();for(const item of items)freshness.set(item.source,Math.max(freshness.get(item.source)??0,this.model.lastUse(channel,item.code)));

    let previousAge = 0; const now = Date.now(); this.nextAgeRefresh = Infinity;
    for (const item of this.model.options.mixed ? displayed : displayed.sort((a, b) => (this.model.options.sort==='use'?(freshness.get(b.source)??0)-(freshness.get(a.source)??0):0)||SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source))) {
      if (!this.model.options.mixed && item.source !== source) {
        previousAge = 0; source = item.source; const heading = document.createElement('h3'); heading.textContent = source; this.grid.append(heading);
      }
      const last = this.model.lastUse(this.channel(), item.code);
      const age = last ? Math.max(0, now - last) : Infinity;
      if (last && this.model.options.ages && this.model.options.sort === 'use') {
        const next = AGE_SECONDS.find(seconds => last + seconds * 1000 > now);
        if (next !== undefined) this.nextAgeRefresh = Math.min(this.nextAgeRefresh, last + next * 1000);
      }
      if (this.model.options.ages && this.model.options.sort === 'use') {
        for (const seconds of crossedAges(previousAge, age)) {
          const marker = document.createElement('span'); marker.className = 'picker-age';marker.dataset.age=String(seconds);marker.classList.toggle('soon',seconds*1000>oldestAge);marker.classList.toggle('crossed',crossed.has(seconds));marker.title=seconds*1000>oldestAge?'No used emote has reached this age yet':crossed.has(seconds)?'An emote crossed this age while this picker was open':'Emotes below were last used over '+ageLabel(seconds)+' ago'; marker.textContent = ageLabel(seconds); this.grid.append(marker);
        }
        previousAge = age;
      }
      this.grid.append(this.cell(item));
    }
    if(this.model.options.ages&&this.model.options.sort==='use'&&displayed.length){const printed=new Set([...this.grid.querySelectorAll<HTMLElement>('.picker-age')].map(marker=>Number(marker.dataset.age)));for(const seconds of AGE_SECONDS)if(seconds*1000>oldestAge&&!printed.has(seconds)){const marker=document.createElement('span');marker.className='picker-age soon';marker.dataset.age=String(seconds);marker.textContent=ageLabel(seconds);marker.title='No used emote has reached this age yet';this.grid.append(marker);}}
    this.root.dataset.ageRows=String(this.model.options.sort==='use'?this.model.options.ageRows:0);this.paintAgeRows();
    this.grid.scrollTop = oldTop;
    this.recent.replaceChildren();
    if (!this.search.value.trim()) for (const item of this.model.recent(this.channel())) this.recent.append(this.cell(item));
    this.recent.hidden = this.recent.childElementCount === 0;
    this.count.textContent = `${Math.min(items.length, this.page)} of ${items.length} · #${this.channel()}${this.canInsert() ? '' : ' · Sign in to insert'}`;
    this.more.hidden = items.length <= this.page;
    this.root.classList.toggle('show-names', this.model.options.names);
    this.root.style.setProperty('--picker-cell', 64 * this.model.options.zoom + 'px');
    this.movement=animatePicker(this.root,this.model.options.ageRows,positions);
  }
  private paintAgeRows():void {if(this.model.options.ageRows!==2||this.model.options.sort!=='use')return;const markers=[...this.grid.querySelectorAll<HTMLElement>('.picker-age')];for(let pass=0;pass<5;pass++){const ends=new Set<HTMLElement>();let previous:HTMLElement|undefined;for(const marker of markers){if(previous&&previous.offsetTop!==marker.offsetTop)ends.add(previous);previous=marker;}if(previous)ends.add(previous);let changed=false;for(const marker of markers){const end=ends.has(marker);if(marker.classList.contains('row-end')!==end){marker.classList.toggle('row-end',end);changed=true;}}if(!changed)break;}}
  private cell(item: PickerItem): HTMLButtonElement {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.insert = item.code;
    button.disabled = !this.canInsert(); button.title = `${item.code} · ${item.source}${item.emote?.zeroWidth ? ' · overlay' : ''}`;
    button.setAttribute('aria-label', item.source === 'Emoji' ? item.keywords : item.code);
    if (item.emote) {
      const emote = item.emote;
      const tone = (value: string): string => emote.source === 'Twitch' ? value.replace(/\/(dark|light)\//, document.documentElement.dataset.theme === 'light' ? '/light/' : '/dark/') : value;
      const image = document.createElement('img');image.dataset.emoteCode=item.code;image.dataset.emoteSource=item.source; image.alt = item.code;
      image.src = tone((this.model.options.frozen||this.borrowed) && emote.staticUrl ? emote.staticUrl : emote.url);
      image.loading = 'lazy'; image.decoding = 'async';
      image.dataset.playUrl=tone(emote.url);if(emote.staticUrl)image.dataset.stillUrl=tone(emote.staticUrl);
      let usedStatic = (this.model.options.frozen||this.borrowed) && !!emote.staticUrl;
      image.addEventListener('error', () => { if (emote.staticUrl && !usedStatic) { usedStatic = true; image.src = tone(emote.staticUrl); } else image.replaceWith(document.createTextNode(item.code)); }); button.append(image);
    } else { const emoji = document.createElement('span'); emoji.className = 'picker-emoji'; emoji.textContent = item.code; button.append(emoji); }
    const name = document.createElement('span'); name.className = 'picker-name'; name.textContent = item.code; button.append(name); return button;
  }
  share(url:URL):void {pickerURL(this.model.options,url);url.searchParams.set('epopen',this.root.hidden?'0':'1');const box=this.floating.geometry();if(box)url.searchParams.set('epgeo',Math.round(box.width)+'x'+Math.round(box.height)+(this.floating.pinned?','+Math.round(box.left)+','+Math.round(box.top):''));else url.searchParams.delete('epgeo');}
  showRail(open:boolean):void {this.root.hidden=!open;this.trigger.setAttribute('aria-expanded',String(open));if(open)this.refresh(true);else {this.gridLeave();this.model.save(this.channel());}}
  private open(): void { this.root.hidden = false; this.floating.opened(); this.trigger.setAttribute('aria-expanded', 'true'); this.page = 200; this.refresh(true); this.search.focus(); }
  private toggle = (): void => { if (!this.root.hidden) this.close(); else this.open(); };
  private close(): void { this.root.hidden = true; this.floating.closed(); this.trigger.setAttribute('aria-expanded', 'false'); this.held = false;this.gridLeave(); this.model.save(this.channel()); this.trigger.focus(); }
  private key = (event: KeyboardEvent): void => { if (!this.root.hidden && !event.isComposing && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); } };
  private click = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('#picker-close')) { this.close(); return; }
    const code = event.target.closest<HTMLButtonElement>('button[data-insert]')?.dataset.insert;
    if (code && this.canInsert()) { this.insert(code); this.model.select(this.channel(), code); this.dirty = true; }
  };
  private resetOrder=():void=>{const channel=this.channel();this.model.resetOrder(channel);this.ageCrossed.delete(channel);for(const key of this.ageHistory.keys())if(key.startsWith(channel+'/'))this.ageHistory.delete(key);this.refresh(true);};
  private resetMiddle=(event:MouseEvent):void=>{if(event.button===1){event.preventDefault();this.resetOrder();}};
  private change = (): void => {
    const options = this.model.options;options.ageRows=Number(get(this.root,'picker-ageRows',HTMLSelectElement).value)||0;
    options.enabled = [...this.tabs.querySelectorAll<HTMLInputElement>('input:checked')].flatMap((input) => SOURCES.includes(input.value as typeof SOURCES[number]) ? [input.value as typeof SOURCES[number]] : []);
    const sort = get(this.root, 'picker-sort', HTMLSelectElement).value; options.sort = sort === 'az' ? 'az' : 'use';
    const animation = get(this.root, 'picker-animation', HTMLSelectElement).value; options.animation = animation === 'animated' || animation === 'still' ? animation : 'all';
    const zoom = Number(get(this.root, 'picker-zoom', HTMLSelectElement).value);
    options.zoom = [.5, .75, 1, 4 / 3, 1.5, 5 / 3, 2].includes(zoom) ? zoom : 1;
    for (const key of ['mixed', 'names', 'hold', 'holdPlus', 'frozen', 'seenOnly', 'ages'] as const) options[key] = get(this.root, 'picker-' + key, HTMLInputElement).checked;
    this.reconcileFreeze();this.page = 200; this.model.save(this.channel()); this.refresh(true);
  };
  private reconcileFreeze():void {const on=this.gridHeld&&this.model.options.hold&&this.model.options.holdPlus&&this.model.options.animation!=='still';if(on===this.borrowed)return;this.borrowed=on;this.root.dataset.holdFreeze=String(on);for(const image of this.root.querySelectorAll<HTMLImageElement>('img[data-play-url]'))image.src=(this.model.options.frozen||on?image.dataset.stillUrl:undefined)||image.dataset.playUrl!;this.temporaryFreeze(on);}
  private gridEnter=():void=>{this.gridHeld=true;this.reconcileFreeze();};
  private gridLeave=():void=>{this.gridHeld=false;this.reconcileFreeze();};
  private enter = (): void => { this.held = this.model.options.hold; };
  private leave = (): void => { this.held = false; if (this.dirty) this.refresh(true); };
  private searchKey = (event: KeyboardEvent): void => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); this.grid.querySelector<HTMLButtonElement>('button[data-insert]:not(:disabled)')?.click(); } };
  private searchChange = (): void => { this.page = 200; this.grid.scrollTop = 0; this.refresh(true); };
  private showMore = (): void => { this.page += 200; this.refresh(true); };
  stop(): void {
    for(const animation of this.movement)animation.cancel();this.movement=[];
    get(this.root,'picker-reset-order',HTMLButtonElement).removeEventListener('click',this.resetOrder);
    get(this.root,'picker-sort',HTMLSelectElement).removeEventListener('auxclick',this.resetMiddle);
    this.ageObserver.disconnect();this.gridLeave();this.grid.removeEventListener('pointerenter',this.gridEnter);this.grid.removeEventListener('pointerleave',this.gridLeave);
    clearInterval(this.timer); clearInterval(this.saveTimer); this.floating.stop(); this.model.saveAll();
    this.trigger.removeEventListener('click', this.toggle); this.root.removeEventListener('click', this.click); document.removeEventListener('keydown', this.key, true);
    this.root.removeEventListener('pointerenter', this.enter); this.root.removeEventListener('pointerleave', this.leave);
    this.tabs.removeEventListener('change', this.change); this.settings.removeEventListener('change', this.change); this.search.removeEventListener('input', this.searchChange); this.search.removeEventListener('keydown', this.searchKey); this.more.removeEventListener('click', this.showMore);
  }
}

export function parsePickerGeometry(value:string|null):{width:number;height:number;left:number;top:number}|undefined {
 if(!value)return undefined;const match=/^(\d{1,5})x(\d{1,5})(?:,(-?\d{1,5}),(-?\d{1,5}))?$/.exec(value);if(!match)return undefined;const width=Number(match[1]),height=Number(match[2])||600;if(width<260||height<200||width>10000||height>10000)return undefined;return {width,height,left:match[3]===undefined?12:Number(match[3]),top:match[4]===undefined?16:Number(match[4])};
}
