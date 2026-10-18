// @vitest-environment happy-dom
import { StorageWorkerShim } from '../test-support/storage-worker-shim';
import { afterEach, expect, it, vi } from 'vitest';
import { StatisticsSummaryClient } from './stats-summary-client';
import { StatsPanel } from './stats';
import { summarize } from './stats-summary';
import type { ChatMessage } from './protocol';
import type { Emote } from './tokens';
const now = 120000;
const message: ChatMessage = {
  id: 'one',
  command: 'PRIVMSG',
  channel: 'one',
  login: 'alice',
  text: 'Kappa Kappa example.com/a glorp',
  timestamp: 60000,
  tags: { badges: 'subscriber/12' },
};
const catalog: Record<string, Emote> = {
  Kappa: { code: 'Kappa', url: '', staticUrl: '', source: 'BTTV', animated: false, zeroWidth: false },
};
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.replaceChildren();
});
it('returns the unchanged summary through structured clone with scoped ranks, gaps and native emotes', async () => {
  const rows = [
    message,
    message,
    { ...message, id: 'two', channel: 'two', login: 'bob', text: '猫 Kappa', tags: { emotes: '25:2-6' } },
    {
      ...message,
      id: 'gap-start',
      command: 'NOTICE',
      login: '',
      timestamp: 90000,
      tags: { 'client-notice': '1', 'gap-state': 'start', 'gap-start': '90000', 'gap-kind': 'page' },
    },
  ];
  const client = new StatisticsSummaryClient();
  try {
    const report = await client.report(rows, ['one', 'two'], () => catalog, {
      now,
      windowMs: 120000,
      channel: 'one',
      excluded: ['bob'],
      header: true,
      panel: true,
    });
    expect(report.header).toEqual(summarize(rows, now, 60000, '', new Set(['bob']), () => catalog));
    expect(report.panel).toEqual(summarize(rows, now, 120000, 'one', new Set(['bob']), () => catalog));
  } finally {
    await client.stop();
  }
});
it('rejects excess retained rows before creating a worker and never calculates a truncated report', async () => {
  const create = vi.fn();
  vi.stubGlobal('Worker', create);
  const client = new StatisticsSummaryClient();
  await expect(
    client.report(Array(100001).fill(message), ['one'], () => catalog, {
      now,
      windowMs: 60000,
      channel: '',
      excluded: [],
      header: false,
      panel: true,
    }),
  ).rejects.toThrow('capacity');
  expect(create).not.toHaveBeenCalled();
  await client.stop();
});
function setup() {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  document.body.innerHTML =
    '<button id="trigger"></button><div id="header"></div><dialog><button id="stats-close"></button><select id="stats-scope"><option value="60000">Minute</option></select><select id="stats-channel"><option value="">All</option></select><input id="stats-exclusions"><select id="stats-badge-order"><option value="versions">Versions</option></select><div id="stats-summary"></div><div id="stats-graph"></div><div id="stats-lists"></div></dialog>';
  const dialog = document.querySelector('dialog')!;
  // A timeline owns the header in the application, so closed panels start no report.
  const panel = new StatsPanel(
    dialog,
    document.querySelector('button')!,
    document.querySelector('#header')!,
    () => [message, { ...message, id: 'two', channel: 'two', login: 'bob' }],
    () => catalog,
    ['one', 'two'],
    { peaks: () => [] } as never,
  );
  return {
    panel,
    dialog,
    summary: document.querySelector('#stats-summary')!,
    lists: document.querySelector('#stats-lists')!,
    channel: document.querySelector('#stats-channel') as HTMLSelectElement,
  };
}
function delayReports() {
  const releases: (() => void)[] = [];
  let requests = 0;
  class Delayed extends StorageWorkerShim {
    override postMessage(value: unknown): void {
      if ((value as { operation?: string }).operation === 'statistics.summarize') {
        requests++;
        const captured = structuredClone(value);
        releases.push(() => super.postMessage(captured));
      } else super.postMessage(value);
    }
  }
  vi.stubGlobal('Worker', Delayed);
  return { releases, count: () => requests };
}
it('coalesces refreshes into one active calculation and discards obsolete filter results', async () => {
  const delayed = delayReports();
  const ui = setup();
  try {
    ui.panel.showRail(true);
    expect(delayed.count()).toBe(1);
    ui.channel.value = 'one';
    ui.dialog.dispatchEvent(new Event('change'));
    ui.channel.value = 'two';
    ui.dialog.dispatchEvent(new Event('change'));
    expect(delayed.count()).toBe(1);
    delayed.releases.shift()!();
    await vi.waitFor(() => expect(delayed.count()).toBe(2));
    expect(ui.summary.textContent).toBe('');
    expect(ui.lists.getAttribute('aria-busy')).toBe('true');
    delayed.releases.shift()!();
    await vi.waitFor(() => expect(ui.summary.textContent).toContain('1 messages'));
    expect(ui.lists.textContent).toContain('bob · 1');
    expect(ui.lists.textContent).not.toContain('alice · 1');
    expect(ui.lists.hasAttribute('aria-busy')).toBe(false);
  } finally {
    ui.panel.stop();
  }
});
it('does not paint a closed or disposed panel when a delayed result arrives', async () => {
  const delayed = delayReports();
  const ui = setup();
  ui.panel.showRail(true);
  ui.panel.showRail(false);
  delayed.releases.shift()!();
  await vi.waitFor(() => expect(ui.lists.hasAttribute('aria-busy')).toBe(false));
  expect(ui.summary.textContent).toBe('');
  expect(delayed.count()).toBe(1);
  ui.panel.showRail(true);
  ui.panel.stop();
  delayed.releases.shift()!();
  await Promise.resolve();
  await Promise.resolve();
  expect(ui.summary.textContent).toBe('');
});
it('shows worker failure instead of retaining a misleading old result or falling back to page calculation', async () => {
  class Failed extends StorageWorkerShim {
    override postMessage(value: unknown): void {
      if ((value as { operation?: string }).operation === 'statistics.summarize')
        queueMicrotask(() => this.dispatchEvent(new Event('error')));
      else super.postMessage(value);
    }
  }
  vi.stubGlobal('Worker', Failed);
  const ui = setup();
  try {
    ui.lists.textContent = 'Old ranking';
    ui.panel.showRail(true);
    await vi.waitFor(() => expect(ui.summary.textContent).toContain('Retained statistics unavailable'));
    expect(ui.lists.textContent).toBe('');
    expect(ui.lists.hasAttribute('aria-busy')).toBe(false);
  } finally {
    ui.panel.stop();
  }
});

it('accepts a slow result across clock refreshes and schedules only one follow-up', async () => {
  const delayed = delayReports();
  const ui = setup();
  try {
    ui.panel.showRail(true);
    const refresh = () => (ui.panel as unknown as { paint(): void }).paint();
    refresh();
    refresh();
    refresh();
    expect(delayed.count()).toBe(1);
    delayed.releases.shift()!();
    await vi.waitFor(() => expect(delayed.count()).toBe(2));
    expect(ui.summary.textContent).toContain('2 messages');
    delayed.releases.shift()!();
    await vi.waitFor(() => expect(ui.lists.hasAttribute('aria-busy')).toBe(false));
    expect(delayed.count()).toBe(2);
  } finally {
    ui.panel.stop();
  }
});

it('keeps a reopened view valid when the previous close event is delivered late', async () => {
  const delayed = delayReports();
  const ui = setup();
  try {
    ui.panel.showRail(true);
    ui.panel.showRail(false);
    ui.panel.showRail(true);
    ui.dialog.dispatchEvent(new Event('close'));
    delayed.releases.shift()!();
    await vi.waitFor(() => expect(delayed.count()).toBe(2));
    delayed.releases.shift()!();
    await vi.waitFor(() => expect(ui.summary.textContent).toContain('2 messages'));
    expect(ui.dialog.open).toBe(true);
  } finally {
    ui.panel.stop();
  }
});
