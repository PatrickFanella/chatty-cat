import './style.css';
import './overlay.css';
import { ChatConnection } from './connection';
import { MessageStore } from './store';
import { VirtualLog, type LogItem } from './virtual-log';
import { overlayRow } from './overlay-row';
import { DisplayRuntime, messageVisibility } from './display';
import { PresentationRuntime } from './presentation-runtime';
import { CustomThemeRuntime } from './custom-theme-runtime';
import { getPresentation } from './presentation';
import { parseChannels, type ChatMessage } from './protocol';
import { parseMetadata, type ChannelMetadata } from './metadata';
import { restoreProviderPreferences, selectProviderMetadata, getProviderPreferences } from './provider-preferences';
import { profileKey } from './account-profiles';
import { privacyEnabled } from './privacy';

// Read-only public renderer: no account/session API, databases, shell, panels or storage clocks.
export function mountOverlay(log: HTMLElement, channels: string[]): () => void {
  let stopped = false,
    frame = 0,
    revision = 0;
  const metadata = new Map<string, ChannelMetadata>(),
    live = new WeakSet<ChatMessage>();
  const cached = new WeakMap<ChatMessage, { revision: number; removed: boolean; row: HTMLElement }>();
  const abort = new AbortController();
  const schedule = () => {
    if (!frame && !stopped && !document.hidden)
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint();
      });
  };
  const display = new DisplayRuntime(() => {
    revision++;
    schedule();
  });
  const presentation = new PresentationRuntime(() => {
    revision++;
    schedule();
  });
  const theme = new CustomThemeRuntime();
  restoreProviderPreferences();
  const store = new MessageStore(channels, Math.min(20000, display.options.scrollback), false);
  const virtual = new VirtualLog(log, 'overlay');
  let frozen = false;
  try {
    frozen = localStorage.getItem(profileKey('chatthing:v1:frozen')) === '1';
  } catch {
    /* Optional public display preference. */
  }
  function paint(): void {
    if (stopped || document.hidden) return;
    if (privacyEnabled()) {
      virtual.set([], true, revision);
      return;
    }
    const deleted = new Set<string>(),
      cleared = new Map<string, number>();
    for (const message of store.messages) {
      if (message.command === 'CLEARMSG') deleted.add(message.channel + ':' + message.tags['target-msg-id']);
      if (message.command === 'CLEARCHAT') {
        const key = message.channel + ':' + message.text.toLowerCase();
        cleared.set(key, Math.max(cleared.get(key) ?? -1, message.timestamp));
      }
    }
    const p = getPresentation(),
      items: LogItem[] = [];
    for (const message of store.messages) {
      if (!['PRIVMSG', 'USERNOTICE', 'NOTICE', 'CLEARCHAT', 'CLEARMSG'].includes(message.command)) continue;
      const visibility = messageVisibility(message, display.options);
      if (visibility.blocked || (visibility.hiddenUser && display.options.hideMode === 'vanish')) continue;
      const key = message.channel + ':' + message.id;
      const removed =
        message.command === 'PRIVMSG' &&
        (message.tags.deleted === '1' ||
          message.tags.deleted === 'true' ||
          deleted.has(key) ||
          message.timestamp <= (cleared.get(message.channel + ':') ?? -1) ||
          message.timestamp <= (cleared.get(message.channel + ':' + message.login.toLowerCase()) ?? -1));
      if (
        (p.hideModerated && removed) ||
        (p.hideModerationActions && message.command === 'CLEARCHAT') ||
        (p.hideDeletionActions && message.command === 'CLEARMSG')
      )
        continue;
      items.push({
        key,
        channel: message.channel,
        render: () => {
          const old = cached.get(message);
          if (old && old.revision === revision && old.removed === removed) return old.row;
          let row: HTMLElement;
          if (visibility.hiddenUser && display.options.hideMode === 'stub') {
            row = document.createElement('article');
            row.className = 'row notice';
            row.textContent = message.login + ': hidden message';
          } else {
            row = overlayRow(
              message,
              metadata.get(message.channel),
              frozen || (p.animateOnlyFocused && !document.hasFocus()),
              removed,
              !live.has(message),
            );
            row.classList.toggle('keyword-match', visibility.highlight);
            row.classList.toggle('user-ghost', visibility.hiddenUser);
          }
          cached.set(message, { revision, removed, row });
          return row;
        },
      });
    }
    virtual.set(
      display.options.rev ? items.reverse() : items,
      true,
      revision,
      display.options.rev,
      p.pauseHoverSeconds > 0,
    );
  }
  const connection = new ChatConnection(channels, (event) => {
    if (event.type === 'status') {
      log.dataset.connection = event.state;
      log.setAttribute('aria-label', 'Chat overlay · ' + event.state);
      return;
    }
    const message = event.message;
    if (!channels.includes(message.channel)) return;
    if (!event.replay) live.add(message);
    store.add(message);
    schedule();
  });
  connection.setReadOptions({
    membership: false,
    history: presentation.options.loadHistory,
    historyLimit: presentation.options.historyLimit,
  });
  connection.start();
  for (const channel of channels)
    void fetch('/api/channels/' + encodeURIComponent(channel), { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((value) => {
        if (stopped) return;
        const data = parseMetadata(value);
        if (data && channels.includes(data.channel)) {
          metadata.set(data.channel, selectProviderMetadata(data, getProviderPreferences()));
          revision++;
          schedule();
        }
      })
      .catch(() => {});
  const changed = () => {
    revision++;
    store.setCap(Math.min(20000, display.options.scrollback));
    schedule();
  };
  document.addEventListener('privacychange', changed);
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('customthemechange', changed);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    abort.abort();
    connection.stop();
    virtual.stop();
    display.stop();
    presentation.stop();
    theme.stop();
    document.removeEventListener('privacychange', changed);
    document.removeEventListener('visibilitychange', schedule);
    document.removeEventListener('customthemechange', changed);
    window.removeEventListener('pagehide', stop);
  };
  window.addEventListener('pagehide', stop);
  schedule();
  return stop;
}
if (typeof document !== 'undefined' && document.querySelector('#log') && location.pathname.endsWith('/overlay.html')) {
  try {
    mountOverlay(
      document.querySelector<HTMLElement>('#log')!,
      parseChannels(new URL(location.href).searchParams.get('channel') ?? ''),
    );
  } catch {
    document.querySelector('#log')!.textContent = 'Add one to six channel names with ?channel=one,two';
  }
}
