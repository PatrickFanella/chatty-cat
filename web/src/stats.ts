import { showPanel } from './shell/open-panel';
import { clockTask, stopClockTask } from './shell/clock';
import { StatisticsStorageControls } from './stats-storage-ui';
import { profileKey } from './account-profiles';
import { privacyEnabled } from './privacy';
import { badgeGroups, renderBadgeReference } from './stats-badges';
import type { ChannelMetadata } from './metadata';
import { registerSettings } from './settings-bundle';
import { type StatsLedger, type StatKind } from './stats-ledger';
import type { RateSeries } from './rate-timeline';
import type { StreamHistory } from './stream-history';
import type { ChatMessage } from './protocol';
import type { Emote } from './tokens';
import type { Stats } from './stats-summary';
import { StatisticsSummaryClient } from './stats-summary-client';
export { summarize, type Rank, type Stats } from './stats-summary';
export function rateGraph(
  buckets: readonly number[],
  label: string,
  gaps: readonly boolean[] = [],
  unit = 'messages',
  pageGaps: readonly boolean[] = [],
): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 300 40');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  if (gaps.some(Boolean)) svg.setAttribute('aria-label', label + ' · Observation gaps; counts may be incomplete');
  gaps.slice(0, buckets.length).forEach((gap, i) => {
    if (!gap) return;
    const band = document.createElementNS(ns, 'rect');
    band.classList.add('graph-gap');
    if (pageGaps[i]) band.classList.add('graph-page-gap');
    band.setAttribute('x', String((i * 300) / buckets.length));
    band.setAttribute('y', '0');
    band.setAttribute('width', String(300 / buckets.length));
    band.setAttribute('height', '40');
    band.setAttribute('fill', pageGaps[i] ? '#a474df' : '#e65b6c');
    band.setAttribute('opacity', '.35');
    const title = document.createElementNS(ns, 'title');
    title.textContent = pageGaps[i]
      ? 'Page closed or inactive; available backfill may be incomplete'
      : 'Connection interrupted; available backfill may be incomplete';
    band.append(title);
    svg.append(band);
  });
  const peak = Math.max(1, ...buckets);
  buckets.forEach((count, i) => {
    const bar = document.createElementNS(ns, 'rect');
    const height = (count / peak) * 36;
    bar.setAttribute('x', String((i * 300) / buckets.length));
    bar.setAttribute('y', String(40 - height));
    bar.setAttribute('width', String(Math.max(1, 300 / buckets.length - 1)));
    bar.setAttribute('height', String(height));
    bar.setAttribute('fill', 'currentColor');
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${count} ${unit}`;
    bar.append(title);
    svg.append(bar);
  });
  return svg;
}
export class StatsPanel {
  private summaryWorker = new StatisticsSummaryClient();
  private revision = 0;
  private calculating = false;
  private repaint = false;
  private stopped = false;
  private channels: readonly string[];
  private bundleDispose: () => void;
  private storageControls: StatisticsStorageControls | undefined;
  private timer: ReturnType<typeof clockTask> | undefined;
  private scope: HTMLSelectElement;
  private channel: HTMLSelectElement;
  private exclusions: HTMLInputElement;
  private badgeOrder: HTMLSelectElement;
  constructor(
    private dialog: HTMLDialogElement,
    private trigger: HTMLButtonElement,
    private header: HTMLElement,
    private messages: () => readonly ChatMessage[],
    private emotes: (channel: string) => Record<string, Emote>,
    channels: string[],
    private timeline?: RateSeries,
    private ledger?: StatsLedger,
    private seeds: (channel: string) => Record<string, number> = () => ({}),
    private streams?: StreamHistory,
    private badges: (channel: string) => ChannelMetadata['badges'] = () => ({}),
  ) {
    this.channels = [...channels];
    if (ledger && typeof indexedDB !== 'undefined') this.storageControls = new StatisticsStorageControls(dialog);
    this.badgeOrder = dialog.querySelector<HTMLSelectElement>('#stats-badge-order')!;
    this.scope = dialog.querySelector<HTMLSelectElement>('#stats-scope')!;
    this.channel = dialog.querySelector<HTMLSelectElement>('#stats-channel')!;
    this.exclusions = dialog.querySelector<HTMLInputElement>('#stats-exclusions')!;
    for (const channel of channels) {
      const option = document.createElement('option');
      option.value = channel;
      option.textContent = '#' + channel;
      this.channel.append(option);
    }
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(profileKey('chatthing:v1:stats')) ?? 'null');
      if (saved && typeof saved === 'object') {
        const data = saved as Record<string, unknown>;
        if (data.badgeOrder === 'versions' || data.badgeOrder === 'name') this.badgeOrder.value = data.badgeOrder;
        if (
          typeof data.channel === 'string' &&
          [...this.channel.options].some((option) => option.value === data.channel)
        )
          this.channel.value = data.channel;
        if (typeof data.excluded === 'string') this.exclusions.value = data.excluded.slice(0, 500);
        if (data.windows && typeof data.windows === 'object')
          for (const select of dialog.querySelectorAll<HTMLSelectElement>('[data-stat-kind]')) {
            const value = (data.windows as Record<string, unknown>)[select.dataset.statKind!];
            if (typeof value === 'string' && [...select.options].some((option) => option.value === value))
              select.value = value;
          }
        if (typeof data.scope === 'string' && [...this.scope.options].some((o) => o.value === data.scope))
          this.scope.value = data.scope;
      }
    } catch {
      /* optional storage */
    }
    trigger.addEventListener('click', this.open);
    dialog.querySelector('#stats-close')?.addEventListener('click', this.close);
    dialog.addEventListener('close', this.closed);
    dialog.addEventListener('change', this.change);
    this.bundleDispose = registerSettings(
      'stats',
      () => ({
        open: this.dialog.open,
        badgeOrder: this.badgeOrder.value,
        scope: this.scope.value,
        channel: this.channel.value,
        excluded: this.exclusions.value,
        windows: Object.fromEntries(
          [...this.dialog.querySelectorAll<HTMLSelectElement>('[data-stat-kind]')].map((select) => [
            select.dataset.statKind,
            select.value,
          ]),
        ),
      }),
      (value) => {
        if (!value || typeof value !== 'object') return;
        const data = value as Record<string, unknown>;
        if (data.badgeOrder === 'versions' || data.badgeOrder === 'name') this.badgeOrder.value = data.badgeOrder;
        for (const [select, key] of [
          [this.scope, 'scope'],
          [this.channel, 'channel'],
        ] as const) {
          if (typeof data[key] === 'string' && [...select.options].some((option) => option.value === data[key]))
            select.value = data[key];
        }
        if (typeof data.excluded === 'string') this.exclusions.value = data.excluded.slice(0, 500);
        if (data.windows && typeof data.windows === 'object')
          for (const select of this.dialog.querySelectorAll<HTMLSelectElement>('[data-stat-kind]')) {
            const choice = (data.windows as Record<string, unknown>)[select.dataset.statKind!];
            if (typeof choice === 'string' && [...select.options].some((option) => option.value === choice))
              select.value = choice;
          }
        this.change();
        if (this.dialog.dataset.rail !== 'true') {
          if (data.open === true && !this.dialog.open) this.open();
          else if (data.open === false && this.dialog.open) this.dialog.close();
        }
      },
    );
    this.paint();
  }
  private syncTimer(): void {
    if (!this.dialog.open) {
      stopClockTask(this.timer);
      this.timer = undefined;
      return;
    }
    this.timer ??= clockTask('stats.paint', () => this.paint(), 5000, { active: () => this.dialog.open });
  }
  float(): void {
    this.dialog.close();
    this.open();
  }
  showRail(open: boolean): void {
    if (open) {
      this.revision++;
      if (this.dialog.open) this.dialog.close();
      this.dialog.setAttribute('open', '');
      this.paint();
    } else {
      this.revision++;
      this.dialog.close();
    }
    this.syncTimer();
  }
  open = (): void => {
    if (privacyEnabled()) return;
    this.revision++;
    showPanel(this.dialog);
    this.syncTimer();
    this.paint();
  };
  close = (): void => this.dialog.close();
  private closed = (): void => {
    if (this.dialog.open) return;
    this.revision++;
    this.syncTimer();
    this.trigger.focus();
  };
  private change = (): void => {
    this.revision++;
    try {
      localStorage.setItem(
        profileKey('chatthing:v1:stats'),
        JSON.stringify({
          badgeOrder: this.badgeOrder.value,
          scope: this.scope.value,
          channel: this.channel.value,
          excluded: this.exclusions.value,
          windows: Object.fromEntries(
            [...this.dialog.querySelectorAll<HTMLSelectElement>('[data-stat-kind]')].map((select) => [
              select.dataset.statKind,
              select.value,
            ]),
          ),
        }),
      );
    } catch {
      /* optional storage */
    }
    this.paint();
  };
  private paint = (): void => {
    if (this.stopped) return;
    const revision = this.revision;
    if (this.calculating) {
      this.repaint = true;
      return;
    }
    const panel = this.dialog.open;
    if (!panel && this.timeline) return;
    const now = Date.now();
    const excluded = new Set(
      this.exclusions.value
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean),
    );
    this.calculating = true;
    this.repaint = false;
    if (panel) this.dialog.querySelector('#stats-lists')?.setAttribute('aria-busy', 'true');
    void this.summaryWorker
      .report(this.messages(), this.channels, this.emotes, {
        now,
        windowMs: Number(this.scope.value),
        channel: this.channel.value,
        excluded: [...excluded],
        header: !this.timeline,
        panel,
      })
      .then((report) => {
        if (this.stopped || revision !== this.revision || panel !== this.dialog.open) return;
        const stats = report.header;
        if (stats) {
          this.header.replaceChildren(
            rateGraph(stats.buckets, `Last minute: ${stats.messages} messages from ${stats.chatters} chatters`),
          );
          this.header.title = `${stats.messages}/min · ${stats.chatters} chatters`;
        }
        if (report.panel) this.render(now, excluded, report.panel);
      })
      .catch(() => {
        if (this.stopped || revision !== this.revision || panel !== this.dialog.open) return;
        if (!this.timeline) {
          this.header.replaceChildren();
          this.header.title = 'Retained statistics unavailable';
        }
        if (panel) {
          this.dialog.querySelector('#stats-summary')!.textContent =
            'Retained statistics unavailable. Reload to try again.';
          this.dialog.querySelector('#stats-graph')!.replaceChildren();
          this.dialog.querySelector('#stats-lists')!.replaceChildren();
        }
      })
      .finally(() => {
        this.calculating = false;
        this.dialog.querySelector('#stats-lists')?.removeAttribute('aria-busy');
        if (this.repaint && !this.stopped) this.paint();
      });
  };
  private render(now: number, excluded: ReadonlySet<string>, data: Stats): void {
    const windowMs = Number(this.scope.value);
    const summary = this.dialog.querySelector<HTMLElement>('#stats-summary')!;
    summary.textContent = `${data.messages.toLocaleString()} messages · ${data.glorps.toLocaleString()} glorp/F · ${data.chatters.toLocaleString()} chatters · ${data.perMinute.toFixed(1)}/min · peak minute ${data.peakPerMinute}`;
    const graph = this.dialog.querySelector<HTMLElement>('#stats-graph')!;
    graph.replaceChildren(
      rateGraph(data.buckets, 'Message count over the selected time window', data.gaps, 'messages', data.pageGaps),
    );
    const body = this.dialog.querySelector<HTMLElement>('#stats-lists')!;
    // Keep keyboard focus stable while an expanded badge reference is being read.
    if (body.contains(document.activeElement)) return;
    const expanded = new Set(
      [...body.querySelectorAll<HTMLDetailsElement>('details[open][data-badge-set]')].map(
        (details) => details.dataset.badgeSet!,
      ),
    );
    body.replaceChildren();
    if (this.streams) {
      const channels = this.channel.value
        ? [this.channel.value]
        : [...this.channel.options].map((option) => option.value).filter(Boolean);
      for (const channel of channels) {
        const section = document.createElement('section'),
          heading = document.createElement('h3');
        heading.textContent = 'Stream history · #' + channel;
        section.append(heading);
        const samples = this.streams.samples(channel, now - windowMs),
          peak = this.streams.peak(channel, now - windowMs);
        if (peak) {
          const value = document.createElement('p');
          value.textContent = `Peak observed viewers: ${peak.viewers.toLocaleString()} at ${new Date(peak.at).toLocaleString()}`;
          section.append(value);
        }
        const list = document.createElement('ol');
        for (const sample of samples.slice(-30).reverse()) {
          const item = document.createElement('li');
          item.textContent =
            new Date(sample.at).toLocaleString() +
            ' · ' +
            (sample.live ? 'Live' : 'Observed offline') +
            (sample.viewers === null ? '' : ' · ' + sample.viewers.toLocaleString() + ' viewers') +
            (sample.title ? ' · ' + sample.title : '');
          list.append(item);
        }
        if (!samples.length) {
          const item = document.createElement('li');
          item.textContent = 'No stream observations in this window';
          list.append(item);
        }
        section.append(list);
        for (const vod of this.streams.archives(channel)) {
          const link = document.createElement('a');
          link.href = vod.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent =
            (vod.title || 'Archive') +
            ' · ' +
            new Date(vod.start).toLocaleString() +
            ' → ' +
            new Date(vod.end).toLocaleString();
          const item = document.createElement('p');
          item.append(link);
          section.append(item);
        }
        body.append(section);
      }
      if (this.streams.storageFailed) {
        const note = document.createElement('p');
        note.textContent = 'Stream history could not be saved in this browser';
        body.append(note);
      }
    }
    if (this.timeline) {
      for (const kind of ['rate', 'glorps'] as const) {
        const section = document.createElement('section'),
          heading = document.createElement('h3');
        heading.textContent =
          kind === 'rate' ? 'Observed message bursts (last 24 hours)' : 'Observed glorp/F spikes (last 24 hours)';
        section.append(heading);
        const list = document.createElement('ol');
        for (const peak of this.timeline.peaks(now, this.channel.value, 86400, kind)) {
          const item = document.createElement('li'),
            time = document.createElement('span');
          time.textContent = new Date(peak.second * 1000).toLocaleString();
          item.append(
            (kind === 'rate' ? peak.rate.toFixed(1) + ' msgs/s' : peak.glorps + ' glorp/F per second') + ' · ',
            time,
          );
          if (this.channel.value) {
            const link = document.createElement('a');
            const url = new URL('https://tv.supa.sh/logs');
            url.searchParams.set('c', this.channel.value);
            url.searchParams.set('d', new Date(peak.second * 1000).toISOString().slice(0, 10));
            link.href = url.href;
            link.textContent = ' · day in chat logs';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            item.append(link);
          }
          list.append(item);
        }
        if (!list.childElementCount) {
          const item = document.createElement('li');
          item.textContent = 'None observed';
          list.append(item);
        }
        section.append(list);
        body.append(section);
      }
    }
    if (this.ledger) {
      const note = document.createElement('p');
      note.textContent =
        (this.ledger.storageRestoreUnavailable
          ? 'Saved totals could not be restored; showing this session only. Reload before saving counts.'
          : this.ledger.storageLoading
            ? 'Loading saved observed totals…'
            : 'Observed totals since ' + new Date(this.ledger.since).toLocaleString()) +
        (this.ledger.limited ? ' · Aggregate capacity reached; some new keys or buckets were omitted' : '') +
        (this.ledger.storageFailed && !this.ledger.storageRestoreUnavailable
          ? ' · Counts could not be saved in this browser'
          : '');
      body.append(note);
      for (const kind of ['users', 'emotes', 'badges', 'links'] as StatKind[]) {
        const control = this.dialog.querySelector<HTMLSelectElement>('[data-stat-kind="' + kind + '"]');
        const hours = Number(control?.value ?? (kind === 'users' ? '24' : '3'));
        let rows = this.ledger.ranks(
          kind,
          Number.isFinite(hours) ? hours : 0,
          this.channel.value,
          new Set([...excluded, 'fossabot', 'blammobot']),
          now,
        );
        if (kind === 'emotes' && control?.value === 'se') {
          const totals = new Map<string, number>();
          for (const channel of this.channel.value
            ? [this.channel.value]
            : [...this.channel.options].map((option) => option.value).filter(Boolean))
            for (const [name, count] of Object.entries(this.seeds(channel)))
              totals.set(name, (totals.get(name) ?? 0) + count);
          rows = [...totals]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            .slice(0, 50);
        }
        const section = document.createElement('section'),
          heading = document.createElement('h3');
        heading.textContent = {
          users: 'Top chatters',
          emotes: 'Top emotes',
          badges: 'Badge versions',
          links: 'Top links',
        }[kind];
        section.append(heading);
        const list = document.createElement('ol');
        for (const row of rows) {
          const item = document.createElement('li');
          if (kind === 'links') {
            const link = document.createElement('a');
            link.href = row.name;
            link.textContent = row.name;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            item.append(link, ' · ' + row.count.toLocaleString());
          } else item.textContent = row.name + ' · ' + row.count.toLocaleString();
          list.append(item);
        }
        if (!rows.length) {
          const item = document.createElement('li');
          item.textContent = 'None recorded';
          list.append(item);
        }
        section.append(list);
        body.append(section);
      }
    }
    if (this.ledger) {
      for (const unit of ['hours', 'days'] as const) {
        const section = document.createElement('section'),
          heading = document.createElement('h3');
        heading.textContent = unit === 'hours' ? 'Hourly messages (7 days, UTC)' : 'Daily messages (31 days, UTC)';
        section.append(heading);
        const list = document.createElement('ol');
        for (const row of this.ledger.buckets(unit, this.channel.value, excluded, now)) {
          const item = document.createElement('li');
          item.textContent =
            new Date(row.at).toISOString().slice(0, unit === 'hours' ? 13 : 10) +
            (unit === 'hours' ? ':00' : '') +
            ' · ' +
            row.count.toLocaleString();
          list.append(item);
        }
        if (!list.childElementCount) {
          const item = document.createElement('li');
          item.textContent = 'None recorded';
          list.append(item);
        }
        section.append(list);
        body.append(section);
      }
    }
    const badgeChannels = this.channel.value
      ? [this.channel.value]
      : [...this.channel.options].map((option) => option.value).filter(Boolean);
    const badgeHours = Number(this.dialog.querySelector<HTMLSelectElement>('[data-stat-kind="badges"]')?.value ?? 3);
    body.append(
      renderBadgeReference(
        badgeGroups(
          badgeChannels.map((channel) => this.badges(channel)),
          this.ledger?.ranks(
            'badges',
            Number.isFinite(badgeHours) ? badgeHours : 0,
            this.channel.value,
            excluded,
            now,
            20000,
          ) ?? [],
          this.badgeOrder.value === 'name' ? 'name' : 'versions',
        ),
        expanded,
      ),
    );
    for (const [title, rows] of [
      ['Users', data.users],
      ['Top glorpers', data.glorpers],
      ['Emotes', data.emotes],
      ['Badges', data.badges],
      ['Link domains', data.links],
      ['Hours', data.hours],
      ['Days', data.days],
    ] as const) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = this.ledger ? title + ' (retained rows)' : title;
      section.append(heading);
      const list = document.createElement('ol');
      for (const row of rows) {
        const item = document.createElement('li');
        item.textContent = `${row.name} · ${row.count.toLocaleString()}`;
        list.append(item);
      }
      section.append(list);
      body.append(section);
    }
  }
  stop(): void {
    this.stopped = true;
    this.revision++;
    this.dialog.querySelector('#stats-lists')?.removeAttribute('aria-busy');
    void this.summaryWorker.stop().catch(() => {});
    this.storageControls?.stop();
    this.bundleDispose();
    stopClockTask(this.timer);
    this.trigger.removeEventListener('click', this.open);
    this.dialog.querySelector('#stats-close')?.removeEventListener('click', this.close);
    this.dialog.removeEventListener('close', this.closed);
    this.dialog.removeEventListener('change', this.change);
  }
}
