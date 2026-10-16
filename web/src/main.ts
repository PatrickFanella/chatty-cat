import { PassivePanelSettings } from './passive-panel-settings';
import { mountPanel, panelAdapter, transientRoot } from './shell/static-panel';
import type { ProviderPanel } from './provider-preferences-ui';
import { ownedInterval, clearOwnedInterval } from './resource-timers';
import type { IRCRelayPanel } from './irc-relay-ui';
import type { ExtensionsPanel } from './extensions-ui';
import { extensionActions } from './extension-actions';
import { watchedWorkspace } from './watched-workspace';
import type { BrowserCompanionPanel } from './browser-companion-ui';
import type { DesktopPlaybackPanel } from './desktop-companion-ui';
import type { ChatContextPanel } from './chat-context-ui';
import type { DeviceSyncPanel } from './device-sync-ui';
import { recoverDeviceApply } from './device-sync';
import { BookmarkStore } from './bookmarks';
import { getLinkPreferences } from './link-preferences';
import type { UserHoldPanel } from './user-holds';
import { sharedContext } from './message-context';
import { CosmeticClient } from './cosmetics';
import { ProviderEventClient } from './provider-events';
import type { ProviderActivityPanel } from './provider-activity-ui';
import {
  restoreProviderPreferences,
  getProviderPreferences,
  selectProviderMetadata,
  reconcileProviderMetadata,
} from './provider-preferences';
import type { ModerationWorkspace } from './moderation-ui';
import type { UserNotesPanel } from './user-notes-ui';
import { getProfileScope, profileKey } from './account-profiles';
import type { PortableLogsPanel } from './portable-logs-ui';
import type { ComparisonPanel } from './comparison-ui';
import type { VodContextPanel } from './vod-context-ui';
import type { ThreadsPanel } from './threads-ui';
import { ThreadViews } from './threads';
import { loadRowPronouns } from './row-pronouns';
import { streamHeader } from './stream-header';
import type { BookmarksPanel } from './bookmarks-ui';
import type { DiscoveryPanel } from './discovery';
import { PresentationRuntime } from './presentation-runtime';
import { CustomThemeRuntime } from './custom-theme-runtime';
import { getPresentation } from './presentation';
import { LocalTargets, dispatchLocal } from './local-commands';
import { privacyEnabled } from './privacy';
import { RuleRuntime } from './rules-runtime';
import { SimilarMessages } from './similar';
import { loadCapacity } from './capacity';
import { RowCache } from './row-cache';
import { reconcileSplits } from './splits';
import { HotkeyRuntime } from './hotkeys-runtime';
import { ACTIONS, type ActionID } from './hotkeys';
import { FONT_SIZES } from './display-data';
import { InboxRuntime } from './inbox-runtime';
import { CommandRuntime } from './commands-runtime';
import type { CommandPanel } from './commands-ui';
import { PrivacyControls } from './privacy-ui';
import { WorkspaceStore, type ReaderPosition, type WorkspaceSnapshot } from './workspaces';
import type { WorkspacePanel } from './workspaces-ui';
import { restoreCompletionPreferences, setCompletionPreferences, completionDefaults } from './completion-preferences';
import { CompletionChatters } from './completion-chatters';
import type { ImageUploads } from './image-uploads';
import { ImageUploadRuntime } from './image-upload-runtime';
import { captureBundle, restoreBundle } from './settings-bundle';
import { NitterLinks } from './nitter';
import { GiphyTitles } from './giphy';
import { ErrorReport } from './error-report';
import { ChannelControls } from './channels';
import { StreamHistory } from './stream-history';
import { StatsLedger } from './stats-ledger';
import { SocialCards } from './social-cards';
import { RateTimeline } from './rate-timeline';
import { linkFingerprint } from './links';
import { PickerLighting } from './picker-lighting';
import { IdentityCards } from './identity-cards';
import { Pronouns } from './pronouns';
import { ChatRecovery } from './recovery';
import { PageCoverage } from './page-coverage';
import { LogKeyboard } from './log-keyboard';
import { WhisperRuntime } from './whispers-runtime';
import { PersonalChat, PersonalState } from './personal';
import type { UserInspector } from './inspector';
import type { Resources } from './resources';
import { SplitLog } from './split-log';
import { type LogItem } from './virtual-log';
import { Attention } from './attention';
import { AccountEmotes } from './account-emotes';
import type { AuthStatus } from './auth';
import { LinkPreview } from './preview';
import { LinkTools } from './link-tools';
import { mountLifecycle } from './lifecycle';
import type { VideoPanel } from './video';
import { TabSync } from './tab-sync';
import { DisplayRuntime, messageVisibility } from './display';
import type { StatsPanel } from './stats';
import { MessageArchive } from './archive';
import type { ArchiveSearch } from './archive-ui';
import { RoomStates } from './room';
import './style.css';
import './shell/shell.css';
import { startShell, type Shell } from './shell';
import { LazyPanels } from './shell/panels';
import { mountAuth } from './auth';
import { Composer } from './composer';
import { PickerModel } from './picker-model';
import type { EmotePicker } from './picker';
import { MessageNavigation } from './navigation';
import { tokenize, nativeEmoteTag } from './tokens';
import { ChatConnection } from './connection';
import { parseWorkspaceChannels, type ChatMessage } from './protocol';
import { messageRow, decoratePresentation } from './render';
import { MessageStore } from './store';
import { MetadataClient, type ChannelMetadata } from './metadata';

function panelTrigger(id: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  return button;
}
export async function startMain(): Promise<void> {
  const syncRecovery = await recoverDeviceApply(getProfileScope()).catch(
    () => 'Local sync recovery unavailable; existing data retained',
  );
  function element<T extends HTMLElement>(id: string, constructor: new () => T): T {
    const found = document.getElementById(id);
    if (!(found instanceof constructor)) throw new Error(`Missing UI element: ${id}`);
    return found;
  }

  const capacity = await loadCapacity();
  const localTargets = new LocalTargets();
  const liveObserved = new WeakSet<ChatMessage>();
  const localCleared = new Map<string, number>();
  const errorReport = new ErrorReport(document.body);
  const stopLifecycle = mountLifecycle(element('offline', HTMLElement), element('app-update', HTMLButtonElement));
  // Each built bundle gets its matching archive, bypassing stale edge copies.
  element('source-download', HTMLAnchorElement).href =
    '/source.tar.gz?build=' + encodeURIComponent(new URL(import.meta.url).pathname);
  const overlay =
    new URL(location.href).searchParams.has('overlay') && new URL(location.href).searchParams.get('overlay') !== '0';
  document.documentElement.dataset.overlay = String(overlay);
  const log = element('log', HTMLElement);
  let inboxPanel: InboxRuntime | undefined;
  let rulePanel: RuleRuntime | undefined;
  let inboxGeneration = 0;
  let syncSources: (() => void) | undefined;
  const pronouns = new Pronouns();
  const socialCards = new SocialCards(log);
  const nitterLinks = new NitterLinks(log);
  const giphyTitles = new GiphyTitles(log);
  const linkPreview = new LinkPreview(log, () => transientRoot('link-preview', 'Link preview'));
  const status = element('status', HTMLElement);
  const count = element('count', HTMLElement);
  const input = element('channel', HTMLInputElement);
  const form = element('channels', HTMLFormElement);
  const latest = element('latest', HTMLButtonElement);
  const theme = element('theme', HTMLButtonElement);
  const announcer = element('announcer', HTMLElement);
  const streamInfo = element('stream', HTMLElement);
  const animation = element('animation', HTMLButtonElement);
  const roomStates = new RoomStates();
  const personalState = new PersonalState();
  const roomInfo = element('room-state', HTMLElement);
  function renderRoom(): void {
    roomInfo.textContent = [...roomStates.labels(composer.target), ...personalState.labels(composer.target)].join(
      ' · ',
    );
    composer.setBlock(personalState.block(composer.target, roomStates.slow(composer.target)));
    roomInfo.hidden = !roomInfo.textContent || document.documentElement.dataset.cmodes === 'false';
  }
  const metadata = new Map<string, ChannelMetadata>();
  const fingerprints = new WeakMap<ChatMessage, string>();
  const rowsByMessage = new RowCache();
  let visualRevision = 0;
  let frozen = false;
  let borrowedFreeze = false;
  try {
    frozen = localStorage.getItem(profileKey('chatthing:v1:frozen')) === '1';
  } catch {
    /* optional storage */
  }
  animation.setAttribute('aria-pressed', String(frozen));
  const workspaceStore = new WorkspaceStore();
  const workspaceQuery = new URL(location.href).searchParams;
  const ephemeralPopout = workspaceQuery.get('popout') === '1';
  const bootWorkspace = ephemeralPopout
    ? undefined
    : (workspaceStore.get(workspaceQuery.get('workspace') ?? '') ?? workspaceStore.active);
  let currentWorkspaceID = bootWorkspace?.id ?? '';
  let pendingReaders: ReaderPosition[] | undefined = bootWorkspace?.readers.length ? bootWorkspace.readers : undefined;
  let historyReady = false;
  let workspaceFocus = bootWorkspace?.focus ?? 'log';
  let channels: string[];
  let channelNotice = '';
  try {
    channels =
      workspaceQuery.has('workspace') && bootWorkspace
        ? bootWorkspace.channels
        : workspaceQuery.has('channel')
          ? parseWorkspaceChannels(workspaceQuery.get('channel')!)
          : (bootWorkspace?.channels ?? ['hasanabi']);
  } catch {
    channels = bootWorkspace?.channels ?? ['hasanabi'];
    channelNotice = 'Invalid channel list. Use one to ' + capacity.workspaceChannels + ' Twitch channel names.';
  }
  if (bootWorkspace?.settings.extras.splits && bootWorkspace.channels.join(',') !== channels.join(',')) {
    const mapped = reconcileSplits(bootWorkspace.settings.extras.splits, channels, bootWorkspace.channels);
    if (mapped) bootWorkspace.settings.extras.splits = mapped;
    else {
      channels = [...bootWorkspace.channels];
      channelNotice = 'The saved layout has no room for that channel change. Close a pane or tab before retrying.';
      const url = new URL(location.href);
      url.searchParams.set('channel', channels.join(','));
      history.replaceState(null, '', url);
    }
  }
  const capacityNotice = document.createElement('span');
  capacityNotice.className = 'capacity-notice';
  capacityNotice.setAttribute('role', 'status');
  element('joined-channels', HTMLElement).append(capacityNotice);
  capacityNotice.textContent = channelNotice;
  input.value = channels.join(',');
  const capacityRefused = channels.length > capacity.workspaceChannels;
  if (capacityRefused) {
    capacityNotice.textContent =
      status.textContent =
      announcer.textContent =
        'This workspace has ' +
        channels.length +
        ' channels; the server allows ' +
        capacity.workspaceChannels +
        '. Edit Channels to continue.';
    status.dataset.state = 'reconnecting';
  }
  const store = new MessageStore(channels);
  const rateTimeline = new RateTimeline(element('rate', HTMLElement), channels);
  let videoPanel: VideoPanel | undefined;
  window.addEventListener('resize', scheduleRender);
  const statsLedger = new StatsLedger(channels, (channel) => metadata.get(channel)?.emotes ?? {});
  statsLedger.bootstrap(store.messages);
  const streamHistory = new StreamHistory(channels);
  let statsPanel: StatsPanel | undefined;
  const archive = new MessageArchive((message) => {
    (document.getElementById('archive-status') ?? announcer).textContent = message;
  });
  for (const message of store.messages) archive.add(message);
  const composer = new Composer(
    element('composer', HTMLFormElement),
    channels,
    (id, channel, text, reply) => {
      const action = /^\/me\s+(.+)$/i.exec(text);
      const shown = action ? '\x01ACTION ' + action[1]!.trim() + '\x01' : text;
      const ownTags = personalState.tags(channel);
      const message: ChatMessage = {
        id,
        channel,
        text: shown,
        command: 'PRIVMSG',
        login: selfLogin,
        timestamp: Date.now(),
        tags: {
          ...ownTags,
          'display-name': ownTags['display-name'] || selfLogin,
          emotes: nativeEmoteTag(shown, pickerModel.availableNative()),
          'local-echo': '1',
          ...(reply
            ? {
                'reply-parent-msg-id': reply.id,
                'reply-thread-parent-msg-id':
                  reply.tags['reply-thread-parent-msg-id'] || reply.tags['reply-parent-msg-id'] || reply.id,
                'reply-parent-user-login': reply.login,
              }
            : {}),
        },
      };
      personalState.accepted(channel);
      renderRoom();
      acceptEcho(message);
      tabSync.send(message);
      const codes = new Set(pickerModel.catalog(channel).map((item) => item.code));
      for (const word of text.split(/\s+/)) if (codes.has(word)) pickerModel.select(channel, word);
      picker?.refresh();
    },
    (result, text, requestID) => {
      if (result.whisper && result.recipient) {
        const match = /^\/w\s+\S+\s+(.+)$/i.exec(text.trim());
        if (match) whispers.echo(result.recipient, match[1]!, requestID);
      }
    },
  );
  const panePopout = workspaceQuery.get('pane') ?? '';
  const virtualLog = new SplitLog(
    log,
    element('splits-open', HTMLButtonElement),
    channels,
    {
      rules: () => rulePanel?.engine.rules.filter((r) => r.scope === 'pane') ?? [],
      canChange: () => !composer.sending,
      target: (channel) => composer.setTarget(channel),
      changed: () => {
        if (overlay) virtualLog.layout.enable(false);
        else if (virtualLog.layout.enabled) {
          follow = true;
          pendingReaders = undefined;
        }
        syncSources?.();
        scheduleRender();
      },
      popout: (pane) => {
        if (composer.sending) {
          announcer.textContent = 'Wait for the current send outcome before opening a pane';
          return;
        }
        try {
          saveWorkspace();
          const url = new URL(location.href);
          url.search = '';
          url.searchParams.set('workspace', currentWorkspaceID);
          url.searchParams.set('channel', channels.join(','));
          url.searchParams.set('pane', pane);
          url.searchParams.set('video', 'off');
          const opened = window.open(url.href, '_blank', 'popup,width=600,height=850');
          if (!opened) announcer.textContent = 'Allow popups to open this pane';
        } catch (error) {
          announcer.textContent = error instanceof Error ? error.message : 'Could not save the pane';
        }
      },
    },
    panePopout,
  );
  if (overlay) element('splits-open', HTMLButtonElement).hidden = true;
  const pickerModel = new PickerModel();
  let picker: EmotePicker | undefined;
  const passiveSettings = new PassivePanelSettings(
    pickerModel,
    channels,
    () => composer.target,
    (id) => {
      if (!lazyPanels) return false;
      void lazyPanels.open(id);
      return true;
    },
  );
  const pickerSaveTimer = ownedInterval('storage.picker', () => pickerModel.saveAll(), 15000);
  const statsSaveTimer = ownedInterval('storage.stats', () => statsLedger.save(), 30000);
  window.addEventListener('pagehide', () => {
    clearOwnedInterval(pickerSaveTimer);
    clearOwnedInterval(statsSaveTimer);
    pickerModel.saveAll();
    passiveSettings.stop();
  });
  let discoveryPanel: DiscoveryPanel | undefined;
  let archiveSearch: ArchiveSearch | undefined;
  let bookmarksPanel: BookmarksPanel | undefined;
  let threadsPanel: ThreadsPanel | undefined;
  function restoreSavedThreads(): void {
    if (threadsPanel || !lazyPanels || privacyEnabled()) return;
    try {
      const saved = new ThreadViews();
      saved.setScope(
        accountAuth === undefined ? undefined : accountAuth.authenticated ? accountAuth.userID : 'anonymous',
        currentWorkspaceID || channels.join(','),
      );
      if (saved.state.open) void lazyPanels.open('threads-panel');
    } catch {
      /* The editor reports invalid saved thread state when opened. */
    }
  }
  let vodContext: VodContextPanel | undefined;
  let comparisonPanel: ComparisonPanel | undefined;
  let portableLogs: PortableLogsPanel | undefined;
  let userNotesPanel: UserNotesPanel | undefined;
  let identityCards: IdentityCards | undefined;
  let inspector: UserInspector | undefined;
  let moderationPanel: ModerationWorkspace | undefined;
  let accountAuth: AuthStatus | undefined;
  let providerEvents: ProviderEventClient | undefined;
  let providerActivity: ProviderActivityPanel | undefined;
  let userHoldPanel: UserHoldPanel | undefined;
  let chatContextPanel: ChatContextPanel | undefined;
  let ircRelayPanel: IRCRelayPanel | undefined;
  let extensionsPanel: ExtensionsPanel | undefined;
  let browserCompanion: BrowserCompanionPanel | undefined;
  let desktopPlayback: DesktopPlaybackPanel | undefined;
  let deviceSyncPanel: DeviceSyncPanel | undefined;
  let suppressWorkspaceSave = false;
  let imageUploads: ImageUploads | undefined;
  const sharePicker = (event: Event): void => {
    if (event instanceof CustomEvent && event.detail instanceof URL) picker?.share(event.detail);
  };
  document.addEventListener('share-settings', sharePicker);
  let pickerLighting: PickerLighting | undefined;
  const accountEmotes = new AccountEmotes(
    (emotes) => {
      pickerModel.setAccount(emotes);
      refreshCandidates();
      picker?.refresh(true);
    },
    element('account-emotes', HTMLElement),
  );
  let selfLogin = '';
  function acceptEcho(message: ChatMessage): void {
    if (!channels.includes(message.channel) || !store.add(message)) return;
    archive.add(message);
    observe(message, true, true);
    scheduleRender();
  }
  const tabSync = new TabSync(acceptEcho);
  tabSync.setAccount(undefined);
  const logKeyboard = new LogKeyboard(
    log,
    virtualLog,
    composer,
    () => {
      if (!virtualLog.layout.enabled) follow = false;
      latest.hidden = false;
    },
    () => latest.click(),
  );
  const whispers = new WhisperRuntime(
    (message) => attention.whisper(message),
    (message, outgoing) => {
      localTargets.whisper(message.login);
      inboxPanel?.whisper(message, outgoing);
    },
  );
  const personalChat = new PersonalChat(
    channels,
    (event) => {
      if (event.type === 'message') {
        personalState.observe(event.message);
        if (event.message.command === 'ROOMSTATE') roomStates.observe(event.message);
        renderRoom();
      }
    },
    element('personal-status', HTMLElement),
    (login) => {
      personalState.reset(login);
      renderRoom();
    },
  );
  const personalTimer = ownedInterval('room.paint', renderRoom, 1000);
  const stopAuth = mountAuth(element('login', HTMLButtonElement), element('account', HTMLElement), (auth) => {
    providerEvents?.authChanged(auth);
    if (auth && getProfileScope() !== (auth.authenticated ? auth.userID : 'anonymous')) {
      providerActivity?.preferencesChanged();
      try {
        sessionStorage.setItem('chatthing:v1:last-profile', auth.authenticated ? auth.userID! : 'anonymous');
      } catch {
        /* Optional storage. */
      }
      moderationPanel?.setAuth(undefined);
      composer.setAuth(undefined);
      whispers.update(undefined);
      tabSync.setAccount(undefined);
      userNotesPanel?.setAccount(undefined);
      identityCards?.setAccount(undefined);
      inspector?.setAccount(undefined);
      location.reload();
      return;
    }
    moderationPanel?.setAuth(auth);
    tabSync.setAccount(auth?.authenticated ? auth.userID : undefined);
    userNotesPanel?.setAccount(auth?.authenticated ? auth.userID : undefined);
    identityCards?.setAccount(auth?.authenticated ? auth.userID : undefined);
    inspector?.setAccount(auth?.authenticated ? auth.userID : undefined);
    localTargets.account(auth?.authenticated ? (auth.userID ?? auth.login ?? '') : '');
    accountAuth = auth;
    providerActivity?.authChanged();
    userHoldPanel?.authChanged();
    chatContextPanel?.authChanged();
    deviceSyncPanel?.authChanged();
    desktopPlayback?.authChanged();
    browserCompanion?.authChanged();
    extensionsPanel?.authChanged();
    ircRelayPanel?.authChanged();
    portableLogs?.setAccount(auth === undefined ? undefined : auth.authenticated ? auth.userID : 'anonymous');
    comparisonPanel?.setAccount(auth === undefined ? undefined : auth.authenticated ? auth.userID : 'anonymous');
    vodContext?.setAccount(auth === undefined ? undefined : auth.authenticated ? auth.userID : 'anonymous');
    threadsPanel?.setScope(
      auth === undefined ? undefined : auth.authenticated ? auth.userID : 'anonymous',
      currentWorkspaceID || channels.join(','),
    );
    restoreSavedThreads();
    discoveryPanel?.setAuth(auth);
    archiveSearch?.setAccount(auth === undefined ? undefined : auth.authenticated ? auth.userID : 'anonymous');
    bookmarksPanel?.setAccount(auth === undefined ? undefined : auth.authenticated ? auth.userID : 'anonymous');
    if (
      inboxPanel?.setAccount(
        auth?.authenticated ? (auth.userID ?? '') : '',
        auth?.authenticated ? (auth.login ?? '') : '',
      )
    )
      void replayInbox();
    whispers.update(auth);
    personalChat.update(auth);
    accountEmotes.update(auth, composer.target);
    const oldLogin = selfLogin;
    selfLogin = auth?.authenticated ? (auth.login ?? '') : '';
    if (oldLogin !== selfLogin) {
      if (rulePanel) rulePanel.similarity = new SimilarMessages(rulePanel.similarity.options);
      visualRevision++;
      scheduleRender();
    }
    const wasEnabled = composer.canInsert;
    composer.setAuth(auth);
    imageUploads?.contextChanged();
    picker?.refresh(wasEnabled !== composer.canInsert);
  });
  log.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const id = event.target.closest<HTMLButtonElement>('button[data-reply]')?.dataset.reply;
    const channel = event.target.closest<HTMLElement>('.row')?.dataset.channel;
    const message = viewMessages().find((message) => message.id === id && message.channel === channel);
    if (message) {
      localTargets.reply(message);
      composer.selectReply(message);
    }
  });
  let renderQueued = false;
  let follow = !pendingReaders;
  let archiveView: ChatMessage[] | undefined;
  let paneArchive: ChatMessage[] | undefined;
  const paneArchiveMessages = new Map<string, ChatMessage>();
  function viewMessages(): readonly ChatMessage[] {
    return virtualLog.layout.enabled
      ? [...store.messages, ...paneArchiveMessages.values()]
      : (archiveView ?? store.messages);
  }
  let archiveGeneration = 0;
  element('composer', HTMLFormElement).addEventListener('composerresize', () => {
    if (follow) log.scrollTop = display.options.rev ? 0 : log.scrollHeight;
  });
  const linkedLookups = new Set<string>();
  const missingLinks = new Map<string, number>();
  const navigation = new MessageNavigation(
    log,
    () => {
      if (!virtualLog.layout.enabled) follow = false;
      latest.hidden = false;
    },
    (id) => {
      const message = viewMessages().find((item) => item.id === id);
      if (message) virtualLog.reveal(messageKey(message));
      if (
        (archiveView && message) ||
        linkedLookups.has(id) ||
        (!message && Date.now() - (missingLinks.get(id) ?? 0) < 5000)
      )
        return;
      linkedLookups.add(id);
      const generation = archiveGeneration;
      void (message ? Promise.resolve(message) : archive.get(id, channels))
        .then((found) => {
          if (found && generation === archiveGeneration && new URL(location.href).searchParams.get('mid') === id)
            return showArchived(found);
          if (!found) {
            missingLinks.set(id, Date.now());
            if (missingLinks.size > 100) missingLinks.delete(missingLinks.keys().next().value!);
          }
        })
        .catch(() => {
          missingLinks.set(id, Date.now());
        })
        .finally(() => {
          linkedLookups.delete(id);
        });
    },
  );
  async function showArchived(message: ChatMessage): Promise<void> {
    const generation = ++archiveGeneration;
    try {
      const context = await archive.search({
        text: '',
        channel: message.channel,
        before: message.timestamp + 30000,
        after: Math.max(0, message.timestamp - 30000),
        limit: 500,
      });
      if (generation !== archiveGeneration) return;
      if (!context.some((item) => item.id === message.id && item.channel === message.channel)) context.push(message);
      archiveView = context.sort((a, b) => a.timestamp - b.timestamp);
      if (!virtualLog.layout.enabled) follow = false;
      const url = new URL(location.href);
      if (message.id) url.searchParams.set('mid', message.id);
      history.pushState(null, '', url);
      render();
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
      (document.getElementById('archive-status') ?? announcer).textContent = 'Archived context unavailable';
    }
  }
  const channelControls = new ChannelControls(
    element('joined-channels', HTMLElement),
    element('composer', HTMLFormElement),
    element('send-channel', HTMLSelectElement),
    channels,
    capacity.workspaceChannels,
  );
  window.addEventListener('pagehide', () => channelControls.stop());

  const inspectRow = (event: MouseEvent): void => {
    if (
      inspector ||
      privacyEnabled() ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      !(event.target instanceof Element) ||
      !event.target.closest('a.name,a.mention')
    )
      return;
    event.preventDefault();
    void lazyPanels?.perform('user-inspector', () => inspector?.inspect(event), false);
  };
  log.addEventListener('click', inspectRow);
  window.addEventListener('pagehide', () => log.removeEventListener('click', inspectRow));
  const openRowPanel = (event: MouseEvent): void => {
    if (!(event.target instanceof Element) || privacyEnabled()) return;
    const thread = event.target.closest<HTMLButtonElement>('button[data-thread]');
    const bookmark = event.target.closest<HTMLButtonElement>('button[data-bookmark]');
    const button = thread ?? bookmark;
    if (!button || (thread ? threadsPanel : bookmarksPanel)) return;
    const channel = button.closest<HTMLElement>('.row')?.dataset.channel;
    const row = button.closest<HTMLElement>('.row');
    const found = viewMessages().find(
      (message) =>
        message.channel === channel &&
        (thread
          ? message.id === thread.dataset.thread
          : message.id === row?.dataset.id &&
            message.command === row.dataset.command &&
            message.login === row.dataset.login &&
            String(message.timestamp) === row.dataset.timestamp),
    );
    const message =
      found && row?.classList.contains('removed') ? { ...found, tags: { ...found.tags, deleted: '1' } } : found;
    if (!message) return;
    if (thread)
      void lazyPanels?.perform(
        'threads-panel',
        () => {
          void threadsPanel?.open(message);
        },
        false,
      );
    else
      void lazyPanels?.perform(
        'bookmarks-panel',
        () => {
          void bookmarksPanel?.capture(message);
        },
        false,
      );
  };
  log.addEventListener('click', openRowPanel);
  window.addEventListener('pagehide', () => log.removeEventListener('click', openRowPanel));
  const names = new Map<string, Map<string, true>>();
  const nativeCodes = new Map<string, Set<string>>();
  function ruleIDsFor(message: ChatMessage): string[] {
    return virtualLog.layout.enabled
      ? virtualLog.layout.tabs.flatMap((t) =>
          t.panes.filter((p) => p.channels.includes(message.channel)).flatMap((p) => p.rules ?? []),
        )
      : [];
  }
  function observe(message: ChatMessage, live = false, countStats = false): void {
    threadsPanel?.observe(message);
    if (live) {
      liveObserved.add(message);
      if (getPresentation().pulseSelf && message.login.toLowerCase() === selfLogin) {
        const form = element('composer', HTMLFormElement);
        form.classList.remove('composer-pulse');
        void form.offsetWidth;
        form.classList.add('composer-pulse');
      }
    }
    if (live && message.command === 'PRIVMSG') virtualLog.observe(message.channel, message.text, messageKey(message));
    const decision = rulePanel?.engine.observe(message, ruleIDsFor(message));
    const similar = rulePanel?.similarity.classify(message, selfLogin) ?? false;
    if (!decision?.hidden)
      inboxPanel?.observe(message, !!decision?.inbox && (!similar || !!rulePanel?.similarity.options.highlightSimilar));
    if (countStats) statsLedger.observe(message);
    else {
      statsLedger.attach(message);
      statsLedger.reconcile(message.channel);
    }
    rateTimeline.series.observe(message, live);
    if (roomStates.observe(message)) renderRoom();
    const used = pickerModel.observe(message, live);
    if (message.channel === composer.target) pickerLighting?.use(used);
    if (message.command !== 'PRIVMSG') return;
    const users = names.get(message.channel) ?? new Map<string, true>();
    if (/^[a-z0-9_]{1,25}$/i.test(message.login)) {
      const login = message.login.toLowerCase();
      if (!users.has(login) && getPresentation().findAllUsernames) visualRevision++;
      users.delete(login);
      users.set(login, true);
    }
    while (users.size > 1000) {
      const first = users.keys().next().value;
      if (first) users.delete(first);
      else break;
    }
    names.set(message.channel, users);
    const codes = nativeCodes.get(message.channel) ?? new Set<string>();
    for (const token of tokenize(message.text, message.tags.emotes ?? '', {}))
      if (token.type === 'emote') codes.add(token.emote.code);
    while (codes.size > 1000) {
      const first = codes.values().next().value;
      if (first) codes.delete(first);
      else break;
    }
    nativeCodes.set(message.channel, codes);
  }
  let completionChatters: CompletionChatters | undefined;
  function refreshCandidates(): void {
    composer.setCandidates(
      [...(names.get(composer.target)?.keys() ?? [])],
      [
        ...new Set([
          ...Object.keys(metadata.get(composer.target)?.emotes ?? {}),
          ...(nativeCodes.get(composer.target) ?? []),
          ...pickerModel
            .catalog(composer.target)
            .filter((item) => item.source === 'Twitch')
            .map((item) => item.code),
        ]),
      ],
    );
  }
  for (const message of store.messages) observe(message);
  refreshCandidates();
  element('send-channel', HTMLSelectElement).addEventListener('change', refreshCandidates);
  element('send-channel', HTMLSelectElement).addEventListener('change', renderRoom);
  log.addEventListener('click', refreshCandidates);
  element('send-channel', HTMLSelectElement).addEventListener('change', () => {
    virtualLog.updateTarget(composer.target);
    accountEmotes.update(accountAuth, composer.target);
    picker?.refresh(true);
  });
  log.addEventListener('click', () => {
    accountEmotes.update(accountAuth, composer.target);
    picker?.refresh();
  });

  function messageKey(message: ChatMessage): string {
    return (
      message.channel +
      ':' +
      (message.id ||
        [message.command, message.timestamp, message.login, message.text, message.tags['system-msg'] ?? ''].join(':'))
    );
  }
  let railRequest = '';
  function configureRail(mode: number): void {
    if (!shell || !lazyPanels || overlay) return;
    const effective = innerWidth > innerHeight && mode >= 4 ? mode : 0;
    const request = String(effective);
    if (railRequest === request) return;
    railRequest = request;
    const videoMode = new URL(location.href).searchParams.get('video') ?? '';
    const ids = effective
      ? [
          'emote-picker',
          ...(effective <= 5 && !['off', '0'].includes(videoMode) && !(effective === 4 && videoMode === 'float')
            ? ['video-panel']
            : []),
          ...(effective === 4 ? ['stats-panel'] : []),
        ]
      : [];
    void Promise.all(ids.map((id) => lazyPanels!.perform(id, () => {}, false))).then(() => {
      if (railRequest !== request || !shell || !document.getElementById('topbar')) return;
      if (ids.some((id) => !document.getElementById(id))) {
        railRequest = '';
        return;
      }
      const panels = [
        ...(videoPanel && document.getElementById('video-panel')
          ? [
              {
                name: 'video',
                root: document.getElementById('video-panel')!,
                show: (open: boolean) => videoPanel!.showRail(open),
              },
            ]
          : []),
        ...(picker && document.getElementById('emote-picker')
          ? [
              {
                name: 'emotes',
                root: document.getElementById('emote-picker')!,
                show: (open: boolean) => picker!.showRail(open),
              },
            ]
          : []),
        ...(statsPanel && document.getElementById('stats-panel')
          ? [
              {
                name: 'stats',
                root: document.getElementById('stats-panel')!,
                show: (open: boolean) => statsPanel!.showRail(open),
              },
            ]
          : []),
      ];
      shell.workbench.setRail(effective, panels);
    });
  }
  let shell: Shell | undefined;
  let lazyPanels: LazyPanels | undefined;
  function render(): void {
    renderQueued = false;
    configureRail(overlay ? 1 : display.options.split);
    document.documentElement.style.setProperty(
      '--composer-bottom',
      element('composer', HTMLFormElement).getBoundingClientRect().bottom + 'px',
    );
    store.setCap(display.options.scrollback);
    const messages = overlay
      ? (archiveView ?? store.messages).filter((message) => channels.slice(0, 6).includes(message.channel))
      : virtualLog.layout.enabled
        ? store.messages
        : (archiveView ?? store.messages);
    const makeItems = (messages: readonly ChatMessage[], isArchive = false): LogItem[] => {
      const cleared = new Map<string, number>();
      const deleted = new Set<string>();
      for (const message of messages) {
        if (message.command === 'CLEARMSG' && message.tags['target-msg-id'])
          deleted.add(message.channel + ':' + message.tags['target-msg-id']);
        if (message.command === 'CLEARCHAT') {
          const key = message.channel + ':' + message.text.toLowerCase();
          cleared.set(key, Math.max(cleared.get(key) ?? 0, message.timestamp));
        }
      }
      const items: LogItem[] = [];
      const seenLinks = new Set<string>();
      // Hidden-user stubs keep their place among visible messages, rather than
      // collecting at the live edge and disturbing scroll anchoring.
      for (const message of messages) {
        if (!isArchive && message.timestamp <= (localCleared.get(message.channel) ?? -1)) continue;
        if (['ROOMSTATE', 'USERSTATE', 'GLOBALUSERSTATE'].includes(message.command)) continue;
        if (
          (message.command === 'JOIN' && !getPresentation().showJoins) ||
          (message.command === 'PART' && !getPresentation().showParts)
        )
          continue;
        const visibility = messageVisibility(message, display.options, selfLogin);
        const rule = rulePanel?.engine.evaluate(message),
          similar = rulePanel?.similarity.classify(message, selfLogin) ?? false;
        if (rule?.hidden || (similar && rulePanel?.similarity.options.behavior === 'hide')) continue;
        if (visibility.blocked || (visibility.hiddenUser && display.options.hideMode === 'vanish')) continue;
        if (display.options.links) {
          let fingerprint = fingerprints.get(message);
          if (fingerprint === undefined) {
            fingerprint = linkFingerprint(message.text);
            fingerprints.set(message, fingerprint);
          }
          if (!fingerprint || seenLinks.has(fingerprint)) continue;
          if (seenLinks.size >= 20000) seenLinks.clear();
          seenLinks.add(fingerprint);
        }
        const key = messageKey(message);
        const removed =
          message.command === 'PRIVMSG' &&
          (message.tags.deleted === '1' ||
            message.tags.deleted === 'true' ||
            deleted.has(key) ||
            message.timestamp <= (cleared.get(message.channel + ':') ?? -1) ||
            message.timestamp <= (cleared.get(message.channel + ':' + message.login.toLowerCase()) ?? -1));
        const p = getPresentation();
        if (
          (p.hideModerated && removed) ||
          (p.hideModerationActions && message.command === 'CLEARCHAT') ||
          (p.hideDeletionActions && message.command === 'CLEARMSG')
        )
          continue;
        if (visibility.hiddenUser && display.options.hideMode === 'stub') {
          items.push({
            key,
            channel: message.channel,
            text: message.text,
            render: () => {
              const row = document.createElement('article');
              row.className = 'row notice';
              row.dataset.id = message.id;
              row.dataset.channel = message.channel;
              row.textContent = message.login + ': hidden message';
              return row;
            },
          });
          continue;
        }
        items.push({
          key,
          channel: message.channel,
          text: message.text,
          highlight: (scope) =>
            (visibility.highlight || !!rulePanel?.engine.evaluate(message, virtualLog.ruleIDs(scope)).highlight) &&
            (!similar || !!rulePanel?.similarity.options.highlightSimilar),
          visible: (ids) => !rulePanel?.engine.evaluate(message, ids).hidden,
          render: (scope = 'default') => {
            const row = rowsByMessage.get(message, scope, visualRevision * 2 + (removed ? 1 : 0), () => {
              const row = messageRow(
                message,
                metadata.get(message.channel),
                frozen || borrowedFreeze || (getPresentation().animateOnlyFocused && !document.hasFocus()),
                names.get(message.channel),
                [...metadata.values()].find((data) => data.broadcasterID === sharedContext(message)?.roomID),
              );
              decoratePresentation(row, message, removed, !liveObserved.has(message));
              if (message.command === 'PRIVMSG') loadRowPronouns(row, message.login, (login) => pronouns.get(login));
              return row;
            });
            const decision = rulePanel?.engine.evaluate(message, virtualLog.ruleIDs(scope));
            const highlight =
              (visibility.highlight || !!decision?.highlight) &&
              (!similar || !!rulePanel?.similarity.options.highlightSimilar);
            row.classList.toggle('keyword-match', highlight);
            row.classList.toggle('similar-message', similar);
            if (decision?.color && highlight) row.style.setProperty('--rule-color', decision.color);
            else row.style.removeProperty('--rule-color');
            row.classList.toggle('user-ghost', visibility.hiddenUser);
            row.classList.toggle('history-message', !liveObserved.has(message));
            row.classList.toggle('removed', removed);
            return row;
          },
        });
      }
      return items;
    };
    const items = makeItems(messages, !!archiveView && !virtualLog.layout.enabled);
    if (virtualLog.layout.enabled && archiveView && archiveView !== paneArchive) {
      paneArchive = archiveView;
      for (const message of archiveView) paneArchiveMessages.set(messageKey(message), message);
      const context = makeItems(archiveView, true);
      virtualLog.showContext(display.options.rev ? context.reverse() : context, archiveView.map(messageKey));
    }
    virtualLog.refreshContexts((keys) => {
      const messages = keys
        .map((key) => paneArchiveMessages.get(key))
        .filter((message): message is ChatMessage => !!message);
      const context = makeItems(messages, true);
      return display.options.rev ? context.reverse() : context;
    });
    virtualLog.set(
      display.options.rev ? items.reverse() : items,
      follow,
      visualRevision,
      display.options.rev,
      overlay ? 1 : display.options.split,
      display.options.pause,
    );
    if (paneArchiveMessages.size) {
      const keys = virtualLog.contextKeys();
      for (const key of paneArchiveMessages.keys()) if (!keys.has(key)) paneArchiveMessages.delete(key);
    }
    count.textContent = virtualLog.layout.enabled
      ? `${store.messages.length.toLocaleString()} messages${virtualLog.hasContexts() ? ' · Pane history open' : ''}`
      : archiveView
        ? `${archiveView.length} archived messages · Jump to live to return`
        : `${store.messages.length.toLocaleString()} messages`;
    latest.hidden = follow && virtualLog.allFollowing();
    if (pendingReaders) {
      const restored = virtualLog.restoreReaders(pendingReaders);
      if (restored || historyReady) {
        if (!restored) announcer.textContent = 'Some saved reader positions are no longer in retained history';
        pendingReaders = undefined;
      }
    }
    if (historyReady) virtualLog.finishReaderRestore();
    navigation.reveal();
  }

  const display = new DisplayRuntime(() => {
    visualRevision++;
    picker?.refresh(true);
    scheduleRender();
  });
  let hydratedCap = 0;
  let hydrationAbort = new AbortController();
  function hydrateHistory(): void {
    const cap = display.options.scrollback;
    if (cap === hydratedCap) return;
    hydratedCap = cap;
    hydrationAbort.abort();
    hydrationAbort = new AbortController();
    const signal = hydrationAbort.signal;
    void archive
      .recent(channels, cap, signal)
      .then(async (messages) => {
        if (signal.aborted) return;
        store.setCap(display.options.scrollback);
        store.restore(messages);
        for (let index = 0; index < messages.length; index += 500) {
          if (signal.aborted) return;
          for (const message of messages.slice(index, index + 500)) observe(message, false);
          if (messages.length > 500) await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        if (signal.aborted) return;
        historyReady = true;
        refreshCandidates();
        picker?.refresh();
        scheduleRender();
      })
      .catch(() => {
        if (!signal.aborted) {
          historyReady = true;
          (document.getElementById('archive-status') ?? announcer).textContent =
            'Saved history unavailable; live chat continues';
          scheduleRender();
        }
      });
  }
  hydrateHistory();
  display.addEventListener('change', hydrateHistory);
  window.addEventListener('storage', (event) => {
    if (event.key === profileKey('chatthing:v1:display')) hydrateHistory();
  });

  const attention = new Attention(
    element('missed-mentions', HTMLButtonElement),
    () => display.options,
    (id, channel) => {
      const message = store.messages.find((item) => item.id === id && item.channel === channel);
      if (message) void showArchived(message);
      else
        void archive
          .get(id, [channel])
          .then((found) => {
            if (found) void showArchived(found);
          })
          .catch(() => {});
    },
  );

  composer.configureModeration((text, channel) => {
    if (
      !/^\/(?:clip|marker|settitle|setgame|commercial|lowtrust|monitor|unmonitor|restrict|unrestrict|warn|shield|shieldoff|banid|untimeout)(?:\s|$)/i.test(
        text,
      )
    )
      return false;
    if (moderationPanel) return moderationPanel.reviewCommand(text, channel);
    void lazyPanels?.perform(
      'moderation-workspace',
      () => {
        try {
          moderationPanel?.reviewCommand(text, channel);
        } catch (error) {
          announcer.textContent = error instanceof Error ? error.message : 'Moderation review unavailable';
        }
      },
      false,
    );
    return true;
  });

  function noteEditor(id: string, login: string): HTMLElement | undefined {
    if (!accountAuth?.authenticated || privacyEnabled()) return;
    const placeholder = document.createElement('div');
    void lazyPanels?.perform(
      'user-notes',
      () => {
        if (!placeholder.isConnected) return;
        const editor = userNotesPanel?.editor(id, login);
        if (editor) placeholder.replaceChildren(editor);
      },
      false,
    );
    return placeholder;
  }

  identityCards = new IdentityCards(
    document.body,
    () => transientRoot('identity-preview', 'Identity preview'),
    () => store.messages,
    (login) =>
      display.options.pn
        ? pronouns.get(login).then((label) => (display.options.pn ? label : undefined))
        : Promise.resolve(undefined),
    (id, login) => noteEditor(id, login),
  );
  identityCards.setAccount(accountAuth?.authenticated ? accountAuth.userID : undefined);
  let resources: Resources | undefined;
  function zoomChat(delta: number): void {
    const index = FONT_SIZES.indexOf(display.options.size),
      size = FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, index + delta))];
    if (size) display.setOptions({ ...display.options, size });
  }
  const presentationRuntime = new PresentationRuntime(() => {
    visualRevision++;
    scheduleRender();
    renderRoom();
    const data = metadata.get(channels[0]!);
    if (data) paintStreamInfo(data);
  });
  const customThemeRuntime = new CustomThemeRuntime();
  const emojiStyleChanged = (): void => {
    visualRevision++;
    scheduleRender();
  };
  document.addEventListener('emojistylechange', emojiStyleChanged);
  window.addEventListener('pagehide', () => document.removeEventListener('emojistylechange', emojiStyleChanged));
  const themeChanged = (): void => {
    visualRevision++;
    picker?.refresh(true);
    scheduleRender();
  };
  document.addEventListener('customthemechange', themeChanged);
  window.addEventListener('pagehide', () => {
    document.removeEventListener('customthemechange', themeChanged);
    customThemeRuntime.stop();
  });
  rulePanel = new RuleRuntime(() => {
    visualRevision++;
    scheduleRender();
  });
  function channelStep(delta: number): void {
    const index = channels.indexOf(composer.target);
    virtualLog.focusChannel(channels[(index + delta + channels.length) % channels.length]!);
  }
  function reloadProviderMetadata(): boolean {
    const accepted = metadataClient.refresh();
    if (accepted) rawMetadata.clear();
    return accepted;
  }
  const hotkeyActions = {
    palette: () => shell?.palette.toggle(),
    shortcuts: () => {
      void lazyPanels?.open('shortcut-settings');
    },
    accounts: () => document.dispatchEvent(new Event('open-account-profiles')),
    compose: () => composer.focusTyping(''),
    workspace: () => {
      if (panePopout) throw new Error('Manage workspaces in the main view');
      void lazyPanels?.open('workspace-panel');
    },
    'desktop-playback': () => {
      void lazyPanels?.perform('desktop-playback-panel', () => desktopPlayback?.openReview('playback'));
    },
    'desktop-overlay': () => {
      void lazyPanels?.perform('desktop-playback-panel', () => desktopPlayback?.openReview('overlay'));
    },
    'channel-next': () => channelStep(1),
    'channel-prev': () => channelStep(-1),
    'pane-next': () => virtualLog.moveFocus('pane', 1),
    'pane-prev': () => virtualLog.moveFocus('pane', -1),
    'tab-next': () => virtualLog.moveFocus('tab', 1),
    'tab-prev': () => virtualLog.moveFocus('tab', -1),
    'pane-right': () => virtualLog.rearrange('pane', 1),
    'pane-left': () => virtualLog.rearrange('pane', -1),
    'tab-right': () => virtualLog.rearrange('tab', 1),
    'tab-left': () => virtualLog.rearrange('tab', -1),
    'reload-emotes': () => {
      announcer.textContent = reloadProviderMetadata()
        ? 'Provider metadata reload requested; server cache remains in effect.'
        : 'Wait 30 seconds between provider reloads.';
    },
    reconnect: () => connection.reconnect(),
    'zoom-in': () => zoomChat(1),
    'zoom-out': () => zoomChat(-1),
    pause: () => {
      if (virtualLog.layout.enabled) virtualLog.hold();
      else follow = false;
      latest.hidden = false;
    },
    live: () => latest.click(),
    history: () => {
      void lazyPanels?.perform('archive-search', () => archiveSearch?.show(composer.target), false);
    },
    'history-global': () => {
      void lazyPanels?.open('archive-search');
    },
    emotes: () => {
      void lazyPanels?.open('emote-picker');
    },
    video: () => {
      void lazyPanels?.open('video-panel');
    },
    stats: () => {
      void lazyPanels?.open('stats-panel');
    },
    settings: () => {
      void lazyPanels?.open('display-panel');
    },
    inbox: () => {
      void lazyPanels?.open('inbox-panel');
    },
    commands: () => {
      void lazyPanels?.open('commands-panel');
    },
  } satisfies Record<ActionID, () => void>;
  const paletteExtra = () => [
    ...(panePopout ? virtualLog.layout.activePane.channels : channels).map((channel) => ({
      id: 'channel:' + channel,
      label: 'Send channel: ' + channel,
      context: 'chat',
      run: () => virtualLog.focusChannel(channel),
    })),
    ...extensionActions(accountAuth, (selection) => {
      void lazyPanels?.perform('extensions-panel', () => extensionsPanel?.selectAction(selection), false);
    }),
    ...(panePopout ? [] : workspaceStore.all()).map((workspace) => ({
      id: 'workspace:' + workspace.id,
      label: 'Workspace: ' + workspace.name,
      context: 'workspace preview',
      run: () => {
        void lazyPanels?.perform('workspace-panel', () => workspacePanel?.previewSwitch(workspace.id), false);
      },
    })),
    ...(virtualLog.layout.enabled
      ? virtualLog.layout.tabs.flatMap((tab) => [
          { id: 'tab:' + tab.id, label: 'Tab: ' + tab.name, context: 'chat', run: () => virtualLog.selectTab(tab.id) },
          ...tab.panes.map((pane, index) => ({
            id: 'pane:' + pane.id,
            label: 'Pane: ' + tab.name + ' / ' + (index + 1) + ' ' + pane.channels.join(', '),
            context: 'chat',
            run: () => {
              virtualLog.selectTab(tab.id);
              virtualLog.selectPane(pane.id);
            },
          })),
        ])
      : []),
  ];
  const actionAvailable = (id: string): boolean =>
    id === 'desktop-playback' || id === 'desktop-overlay'
      ? !!accountAuth?.authenticated && !panePopout && !ephemeralPopout && !overlay && !composer.sending
      : ACTIONS.find((action) => action.id === id)?.context !== 'splits' || virtualLog.layout.enabled;
  const hotkeys = new HotkeyRuntime((id) => hotkeyActions[id](), actionAvailable);
  virtualLog.manageKeyboard();

  if (bootWorkspace) {
    display.setOptions(panePopout ? { ...bootWorkspace.settings.display, split: 1 } : bootWorkspace.settings.display);
    render();
    restoreBundle(bootWorkspace.settings);
    pendingReaders = bootWorkspace.readers.length ? bootWorkspace.readers : undefined;
    follow = !pendingReaders;
    render();
    hydrateHistory();
    composer.setTarget(
      panePopout && virtualLog.layout.enabled ? virtualLog.layout.activePane.target : bootWorkspace.target,
    );
  }
  if (['off', '0'].includes(workspaceQuery.get('video') ?? '')) videoPanel?.showRail(false);
  function captureWorkspace(): WorkspaceSnapshot {
    return {
      channels: [...channels],
      target: composer.target,
      focus: workspaceFocus,
      settings: captureBundle(display.options),
      readers: virtualLog.readerPositions(),
    };
  }
  function saveWorkspace(): void {
    if (suppressWorkspaceSave) return;
    if (composer.sending) throw new Error('Wait for the current send outcome before switching workspaces');
    if (currentWorkspaceID && !panePopout && !overlay && !ephemeralPopout && !capacityRefused)
      workspaceStore.update(currentWorkspaceID, captureWorkspace());
  }
  if (!currentWorkspaceID && !workspaceStore.error && !ephemeralPopout) {
    try {
      const initial = workspaceStore.create('Watching', captureWorkspace());
      workspaceStore.activate(initial.id);
      currentWorkspaceID = initial.id;
    } catch (error) {
      announcer.textContent = error instanceof Error ? error.message : 'Workspace storage unavailable';
    }
  }

  let workspacePanel: WorkspacePanel | undefined;
  async function replayInbox(): Promise<void> {
    const generation = ++inboxGeneration,
      panel = inboxPanel;
    if (!panel || !accountAuth?.authenticated) return;
    const messages = [...store.messages],
      login = accountAuth.login?.toLowerCase();
    for (const own of [true, false])
      for (let index = 0; index < messages.length; index += 500) {
        if (generation !== inboxGeneration) return;
        for (const message of messages.slice(index, index + 500))
          if ((message.login.toLowerCase() === login) === own) {
            const rule = rulePanel?.engine.evaluate(message, ruleIDsFor(message));
            if (!rule?.hidden) panel.observe(message, !!rule?.inbox);
          }
        if (messages.length > 500) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
  }
  inboxPanel = new InboxRuntime();
  if (accountAuth?.authenticated) {
    inboxPanel.setAccount(accountAuth.userID ?? '', accountAuth.login ?? '');
    void replayInbox();
  }
  let commandPanel: CommandPanel | undefined;
  const commandContext = () => {
    const selected = inspector?.selectedMessage,
      channel = selected?.channel ?? composer.target;
    const room =
      selected?.tags['room-id'] ??
      [...store.messages].reverse().find((message) => message.channel === channel && message.tags['room-id'])?.tags[
        'room-id'
      ] ??
      '';
    return {
      channel: {
        name: channel,
        id: room,
        title: metadata.get(channel)?.stream.title ?? '',
        game: metadata.get(channel)?.stream.game ?? '',
      },
      account: { name: accountAuth?.login ?? '', id: accountAuth?.userID ?? '' },
      message: selected
        ? { name: selected.login, id: selected.id, text: selected.text.replace(/^\x01ACTION (.*)\x01$/s, '$1') }
        : undefined,
      input: composer.draft,
    };
  };
  const commandRuntime = new CommandRuntime(
    composer,
    (command, invocation) => {
      const context = commandContext();
      void lazyPanels?.perform(
        'commands-panel',
        () => {
          const current = commandContext();
          if (current.account.id !== context.account.id || current.channel.name !== context.channel.name) return;
          commandPanel?.showPreview(command, invocation);
        },
        false,
      );
    },
    bootWorkspace?.settings.extras.commands,
  );

  completionChatters = new CompletionChatters(() => {
    const raw = metadata.get(composer.target)?.stream.viewers ?? '',
      viewers = /^(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)$/.test(raw) ? Number(raw.replaceAll(',', '')) : undefined;
    return { auth: accountAuth, channel: composer.target, viewers };
  }, refreshCandidates);
  composer.configureExtraNames(() => completionChatters?.names() ?? []);
  const linkTools = new LinkTools(
    log,
    () => {
      visualRevision++;
      scheduleRender();
    },
    !!panePopout || ephemeralPopout || overlay,
  );
  const completionPreferencesChanged = (): void => {
    visualRevision++;
    refreshCandidates();
    scheduleRender();
  };
  document.addEventListener('completionpreferenceschange', completionPreferencesChanged);
  document.addEventListener('privacychange', completionPreferencesChanged);
  try {
    restoreCompletionPreferences();
  } catch {
    announcer.textContent = 'Saved completion preferences could not be loaded; defaults are active.';
  }
  const uploadRuntime = new ImageUploadRuntime(
    () => ({ auth: accountAuth, channel: composer.target, canInsert: composer.canInsert }),
    !!panePopout || ephemeralPopout || overlay,
    () => !!imageUploads,
    (files) => {
      const channel = composer.target;
      void lazyPanels?.perform(
        'image-uploads-panel',
        () => {
          if (composer.target === channel) imageUploads?.files(files);
        },
        false,
      );
    },
  );

  element('send-channel', HTMLSelectElement).addEventListener('change', () => imageUploads?.contextChanged());
  const privacyControls = new PrivacyControls(workspaceStore, () => currentWorkspaceID);
  const openPrivacySettings = (): void => {
    void lazyPanels?.open('privacy-settings');
  };
  document.addEventListener('open-privacy-settings', openPrivacySettings);
  window.addEventListener('pagehide', () => document.removeEventListener('open-privacy-settings', openPrivacySettings));
  const rememberFocus = (event: FocusEvent): void => {
    if (
      event.target instanceof HTMLElement &&
      ['log', 'message', 'picker-open', 'archive-open', 'display-open', 'video-open'].includes(event.target.id)
    )
      workspaceFocus = event.target.id;
  };
  document.addEventListener('focusin', rememberFocus);
  window.addEventListener('pagehide', () => {
    try {
      saveWorkspace();
    } catch {
      /* status is reported before an intentional switch; pagehide cannot prevent navigation */
    }
    hotkeys.stop();
    document.removeEventListener('completionpreferenceschange', completionPreferencesChanged);
    document.removeEventListener('privacychange', completionPreferencesChanged);
    setCompletionPreferences(completionDefaults);
    completionChatters?.stop();
    uploadRuntime.stop();
    linkTools.stop();
    inboxGeneration++;
    inboxPanel?.stop();
    rulePanel?.stop();
    presentationRuntime.stop();
    commandRuntime.stop();
    privacyControls.stop();
    document.removeEventListener('focusin', rememberFocus);
  });
  if (bootWorkspace)
    requestAnimationFrame(() => {
      document.getElementById(bootWorkspace.focus)?.focus({ preventScroll: true });
    });
  render();
  function scheduleRender(): void {
    if (!renderQueued) {
      renderQueued = true;
      requestAnimationFrame(render);
    }
  }
  function paintStreamInfo(data: ChannelMetadata): void {
    const p = getPresentation();
    streamInfo.textContent = streamHeader(data.stream, p);
    if (data.lastVod) {
      const archiveLink = document.createElement('a');
      archiveLink.href = data.lastVod.url;
      archiveLink.target = '_blank';
      archiveLink.rel = 'noopener noreferrer';
      archiveLink.textContent = 'Latest archive · ' + new Date(data.lastVod.start).toLocaleDateString();
      archiveLink.title =
        data.lastVod.title +
        ' · ' +
        new Date(data.lastVod.start).toLocaleString() +
        ' → ' +
        new Date(data.lastVod.end).toLocaleString() +
        ' · ' +
        Math.round((Date.parse(data.lastVod.end) - Date.parse(data.lastVod.start)) / 60000) +
        ' minutes';
      streamInfo.append(' · ', archiveLink);
    }
    streamInfo.title = data.errors.length ? `Some metadata unavailable: ${data.errors.join(', ')}` : data.stream.title;
  }
  const rawMetadata = new Map<string, ChannelMetadata>();
  function applyProviderData(data: ChannelMetadata): void {
    data = selectProviderMetadata(data, getProviderPreferences());
    const previous = metadata.get(data.channel);
    if (
      JSON.stringify([previous?.emotes, previous?.badges, previous?.broadcasterID]) !==
      JSON.stringify([data.emotes, data.badges, data.broadcasterID])
    )
      visualRevision++;
    metadata.set(data.channel, data);
    statsLedger.reconcile(data.channel);
    streamHistory.observe(data);
    pickerModel.setSeeds(data.channel, data.emoteUse ?? {});
    pickerModel.setMetadata(data.channel, data.emotes);
    picker?.refresh();
    refreshCandidates();
    if (data.stream.uptime && !data.errors.includes('stream uptime'))
      attention.stream(
        data.channel,
        !/offline|not streaming|not live|not online|not found/i.test(data.stream.uptime),
        data.stream.title,
      );
    if (data.channel === channels[0]) paintStreamInfo(data);
    scheduleRender();
  }
  const metadataClient = new MetadataClient(
    channels,
    (data) => {
      const next = reconcileProviderMetadata(data, rawMetadata.get(data.channel), getProviderPreferences());
      rawMetadata.set(data.channel, next);
      applyProviderData(next);
      providerEvents?.metadataChanged();
    },
    (channel) => {
      if (channel === channels[0]) streamInfo.title = 'Stream metadata unavailable; chat continues';
    },
  );
  const cosmeticClient = new CosmeticClient(
    () => store.messages.slice(-100).map((message) => message.tags['user-id'] ?? ''),
    () => {
      visualRevision++;
      scheduleRender();
    },
    (_providers, detail) => {
      providerCosmeticNotice = detail;
      providerPanel?.cosmeticsStatus(detail);
    },
  );

  providerEvents = new ProviderEventClient(
    () =>
      liveSources().flatMap((channel) => {
        const data = rawMetadata.get(channel);
        return data ? [data] : [];
      }),
    () => {
      visualRevision++;
      scheduleRender();
    },
    (provider, channel) => metadataClient.requestProviderRefresh(provider, channel),
    (detail) => {
      providerEventsNotice = detail;
      providerPanel?.eventsStatus(detail);
    },
  );

  let providerPanel: ProviderPanel | undefined;
  let providerEventsNotice = '',
    providerCosmeticNotice = '';
  try {
    restoreProviderPreferences();
  } catch {
    announcer.textContent = 'Saved provider preferences unavailable; defaults are active';
  }

  metadataClient.start();
  cosmeticClient.start();
  providerEvents.start();
  const recovery = new ChatRecovery(
    channels[0]!,
    (message) => {
      message = chatContextPanel?.enrich(message) ?? message;
      if (store.add(message)) {
        archive.add(message);
        threadsPanel?.observe(message);
        scheduleRender();
      }
    },
    store.messages,
  );
  function liveSources(): string[] {
    return capacityRefused ? [] : overlay ? channels.slice(0, 6) : virtualLog.sources();
  }
  const pageCoverage = new PageCoverage(liveSources(), (message) => {
    message = chatContextPanel?.enrich(message) ?? message;
    if (store.add(message)) {
      archive.add(message);
      threadsPanel?.observe(message);
      scheduleRender();
    }
  });
  window.addEventListener('pagehide', () => pageCoverage.stop());
  window.addEventListener('pagehide', () => {
    nitterLinks.stop();
    giphyTitles.stop();
    channelControls.stop();
    streamHistory.save();
    errorReport.stop();
  });
  const connection = new ChatConnection(liveSources(), (event) => {
    if (event.type === 'status') {
      rateTimeline.series.status(event);
      if (liveSources().includes(channels[0]!)) recovery.status(event);
      pickerModel.connection(liveSources(), event.state);
      picker?.refresh();
      status.textContent = event.detail || event.state;
      status.dataset.state = event.state;
      return;
    }
    event.message = chatContextPanel?.enrich(event.message) ?? event.message;
    if (!store.add(event.message)) return;
    archive.add(event.message);
    observe(event.message, !event.replay, true);
    refreshCandidates();
    picker?.refresh();
    if (!event.replay && event.message.command === 'PRIVMSG') {
      const visibility = messageVisibility(event.message, display.options, selfLogin);
      const ids = ruleIDsFor(event.message);
      const rule = rulePanel?.engine.observe(event.message, ids),
        similar = rulePanel?.similarity.classify(event.message, selfLogin) ?? false;
      const native = visibility.highlight;
      const allowed =
        !visibility.blocked &&
        !visibility.hiddenUser &&
        !rule?.hidden &&
        (!similar || !!rulePanel?.similarity.options.highlightSimilar);
      attention.mention(event.message, (native || !!rule?.highlight) && allowed, event.replay, {
        sound: (native || !!rule?.sound) && (!rulePanel || rulePanel.alertsAllowed()),
        notify: (native || !!rule?.notify) && (!rulePanel || rulePanel.alertsAllowed()),
      });
      rulePanel?.counts();
      if (allowed) announcer.textContent = `${event.message.login}: ${event.message.text}`;
    }
    scheduleRender();
  });
  syncSources = () => {
    const sources = liveSources(),
      closed = channels.filter((channel) => !sources.includes(channel));
    pickerModel.connection(closed, 'reconnecting');
    rateTimeline.series.coverage.setSources(sources);
    connection.setChannels(sources);
    personalChat.setChannels(sources);
    metadataClient.setChannels(sources);
    providerEvents?.metadataChanged();
    pageCoverage.setChannels(sources);
  };
  const updateReadOptions = (): void => {
    const p = getPresentation();
    connection.setReadOptions({
      membership: p.showJoins || p.showParts,
      history: p.loadHistory,
      historyLimit: p.historyLimit,
    });
  };
  document.addEventListener('presentationchange', updateReadOptions);
  window.addEventListener('pagehide', () => document.removeEventListener('presentationchange', updateReadOptions));
  updateReadOptions();
  syncSources();
  connection.start();
  const usernameContext = (event: MouseEvent): void => {
    if (privacyEnabled() || composer.sending || !(event.target instanceof Element)) return;
    const name = event.target.closest<HTMLElement>('a.name,a.mention'),
      row = name?.closest<HTMLElement>('.row');
    if (!name || !row) return;
    const p = getPresentation(),
      modified = { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey }[
        p.rightClickModifier as 'shift' | 'ctrl' | 'alt' | 'meta'
      ],
      action = modified ? p.modifiedRightClick : p.rightClick;
    if (action === 'ignore') return;
    event.preventDefault();
    if (!composer.canInsert) {
      announcer.textContent = 'Log in to stage a mention or reply';
      return;
    }
    const message = viewMessages().find((m) => m.id === row.dataset.id && m.channel === row.dataset.channel);
    if (!message) return;
    if (action === 'reply') {
      localTargets.reply(message);
      composer.selectReply(message);
    } else composer.mention(name.dataset.mention || message.login, p.mentionAt, p.mentionComma);
  };
  log.addEventListener('contextmenu', usernameContext);
  window.addEventListener('pagehide', () => log.removeEventListener('contextmenu', usernameContext));
  composer.configureLocal((text) => {
    if (privacyEnabled()) throw new Error('Local commands are unavailable in privacy mode');
    return dispatchLocal(text, {
      channel: composer.target,
      uptime: metadata.get(composer.target)?.stream.uptime ?? '',
      targets: localTargets,
      playback: (channel) => {
        if (!desktopPlayback) throw new Error('Desktop playback setup unavailable');
        desktopPlayback.openReview('playback', channel);
      },
      open: (url) => {
        const opened = window.open('about:blank', '_blank');
        if (!opened) return false;
        opened.opener = null;
        opened.location.href = url;
        return true;
      },
      copy: async (value) => {
        await navigator.clipboard.writeText(value);
      },
      clear: (channel) => {
        localCleared.set(
          channel,
          store.messages.reduce(
            (cutoff, m) => (m.channel === channel ? Math.max(cutoff, m.timestamp) : cutoff),
            Date.now(),
          ),
        );
        visualRevision++;
        scheduleRender();
      },
      user: (login, channel) => {
        if (inspector) return inspector.openUser(login, channel);
        if (
          !viewMessages().some(
            (message) =>
              message.login.toLowerCase() === login.toLowerCase() &&
              message.channel === channel &&
              message.command === 'PRIVMSG',
          )
        )
          return false;
        void lazyPanels?.perform(
          'user-inspector',
          () => {
            inspector?.openUser(login, channel);
          },
          false,
        );
        return true;
      },
      ignore: (login, hide) => {
        const names = display.options.hidden
          .split(/[\s,]+/)
          .filter(Boolean)
          .filter((name) => name.toLowerCase() !== login);
        if (hide) names.push(login);
        display.setOptions({ ...display.options, hidden: names.join(',') });
      },
      connection: (connect) => {
        for (const stream of [connection, personalChat, whispers])
          if (connect) stream.reconnect();
          else stream.disconnect();
      },
      popout: (channel) => {
        const url = new URL(location.href);
        url.search = '';
        url.searchParams.set('channel', channel);
        url.searchParams.set('popout', '1');
        url.searchParams.set('video', 'off');
        return !!window.open(url.href, '_blank', 'popup,width=600,height=850');
      },
      reply: (message, value) => composer.stageReply(message, value),
      stage: (value) => {
        if (!composer.canInsert) throw new Error('Log in to stage a whisper');
        composer.prepare(value);
      },
      help: () => {
        void lazyPanels?.open('local-command-help');
      },
    });
  });

  log.addEventListener(
    'scroll',
    (event) => {
      if (virtualLog.hoverPaused(event.target)) return;
      if (archiveView && !virtualLog.layout.enabled) {
        follow = false;
        latest.hidden = false;
        return;
      }
      follow = virtualLog.trackScroll(event.target, follow);
      latest.hidden = follow && !virtualLog.hasManualPause();
    },
    { capture: true },
  );
  latest.addEventListener('click', () => {
    archiveGeneration++;
    archiveView = undefined;
    paneArchive = undefined;
    linkedLookups.clear();
    const url = new URL(location.href);
    url.searchParams.delete('mid');
    history.replaceState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
    follow = true;
    virtualLog.resume();
    render();
    log.scrollTop = display.options.rev ? 0 : log.scrollHeight;
    latest.hidden = virtualLog.allFollowing();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (composer.sending) throw new Error('Wait for the current send outcome before changing channels');
      const next = parseWorkspaceChannels(input.value, capacity.workspaceChannels);
      const url = new URL(location.href);
      url.searchParams.set('channel', next.join(','));
      url.searchParams.delete('workspace');
      url.searchParams.delete('mid');
      location.assign(url);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Invalid channels';
    }
  });
  theme.addEventListener('click', () => {
    display.toggleTone();
    const next = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    theme.setAttribute('aria-label', `Switch to ${next === 'dark' ? 'light' : 'dark'} theme`);
    visualRevision++;
    picker?.refresh(true);
    scheduleRender();
  });
  animation.addEventListener('click', () => {
    frozen = !frozen;
    animation.setAttribute('aria-pressed', String(frozen));
    try {
      localStorage.setItem(profileKey('chatthing:v1:frozen'), frozen ? '1' : '0');
    } catch {
      /* optional storage */
    }
    visualRevision++;
    scheduleRender();
  });
  const storeTimer = ownedInterval('storage.messages', () => store.save(), 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      store.save();
      statsLedger.save();
    }
  });
  window.addEventListener('pagehide', () => {
    store.save();
    hydrationAbort.abort();
    identityCards?.stop();
    pronouns.stop();
    logKeyboard.stop();
    virtualLog.stop();
    connection.stop();
    metadataClient.stop();
    providerEvents?.stop();
    cosmeticClient.stop();
    stopAuth();
    personalChat.stop();
    whispers.stop();
    clearOwnedInterval(personalTimer);
    clearOwnedInterval(storeTimer);
    accountEmotes.stop();
    composer.stop();
    navigation.stop();
    pickerLighting?.stop();
    document.removeEventListener('share-settings', sharePicker);
    archive.stop();
    statsLedger.save();
    rateTimeline.stop();
    display.stop();
    attention.stop();
    tabSync.stop();
    stopLifecycle();
    linkPreview.stop();
    socialCards.stop();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
  if (!overlay) {
    shell = startShell({
      actions: ACTIONS,
      run: (id) => hotkeyActions[id as ActionID](),
      available: actionAvailable,
      extra: () =>
        paletteExtra().map((entry) => ({
          id: entry.id,
          label: entry.label,
          context: entry.context,
          enabled: 'enabled' in entry ? (entry as { enabled?: boolean }).enabled : undefined,
          run: entry.run,
        })),
    });
    const panelStateChanged = (): void => {
      shell?.registry.dispatchEvent(new Event('change'));
    };
    document.addEventListener('panelstatechange', panelStateChanged);
    window.addEventListener('pagehide', () => document.removeEventListener('panelstatechange', panelStateChanged));
    lazyPanels = new LazyPanels(
      shell.registry,
      shell.workbench,
      () => getProfileScope(),
      () => !panePopout && !ephemeralPopout && !privacyEnabled(),
      (title) => {
        announcer.textContent = title + ' could not load. Try again.';
      },
    );
    lazyPanels.register({
      id: 'irc-relay-panel',
      title: 'IRC conversations',
      group: 'tools',
      keywords: 'network private relay',
      load: () =>
        import('./irc-relay-ui').then(({ IRCRelayPanel }) => () => {
          ircRelayPanel = new IRCRelayPanel(() => accountAuth);
          return ircRelayPanel;
        }),
    });
    lazyPanels.register({
      id: 'chatterino-import-panel',
      title: 'Import Chatterino',
      group: 'tools',
      keywords: 'settings layout workspace',
      load: () =>
        import('./chatterino-import-ui').then(
          ({ ChatterinoImportPanel }) =>
            () =>
              new ChatterinoImportPanel(workspaceStore, captureWorkspace),
        ),
    });
    lazyPanels.register({
      id: 'completion-preferences-panel',
      title: 'Completion',
      group: 'moderation',
      keywords: 'nicknames spellcheck suggestions',
      load: () =>
        import('./completion-preferences-ui').then(
          ({ CompletionPreferencesPanel }) =>
            () =>
              new CompletionPreferencesPanel(undefined, false, () => completionChatters!.read()),
        ),
    });
    lazyPanels.register({
      id: 'link-preferences-panel',
      title: 'Link preferences',
      group: 'moderation',
      keywords: 'preview thumbnails search double click',
      load: () =>
        import('./link-preferences-ui').then(
          ({ LinkPreferencesPanel }) =>
            () =>
              new LinkPreferencesPanel(),
        ),
    });
    lazyPanels.register({
      id: 'comparison-panel',
      title: 'Compare activity',
      group: 'chat',
      keywords: 'observed rates viewers archive',
      load: () =>
        import('./comparison-ui').then(({ ComparisonPanel }) => () => {
          comparisonPanel = new ComparisonPanel(
            channels,
            rateTimeline,
            streamHistory,
            archive,
            (message) => {
              void showArchived(message);
            },
            (message) => {
              void lazyPanels?.perform('vod-context', () => vodContext?.show(message), false);
            },
          );
          comparisonPanel.setAccount(
            accountAuth === undefined ? undefined : accountAuth.authenticated ? accountAuth.userID : 'anonymous',
          );
          return comparisonPanel;
        }),
    });
    lazyPanels.register({
      id: 'portable-logs',
      title: 'Export logs',
      group: 'chat',
      keywords: 'retained public archive recovery retention',
      load: () =>
        import('./portable-logs-ui').then(({ PortableLogsPanel }) => () => {
          portableLogs = new PortableLogsPanel(channels, archive, streamHistory);
          portableLogs.setAccount(
            accountAuth === undefined ? undefined : accountAuth.authenticated ? accountAuth.userID : 'anonymous',
          );
          return portableLogs;
        }),
    });
    lazyPanels.register({
      id: 'chat-context-panel',
      title: 'Public message context',
      group: 'moderation',
      load: () =>
        import('./chat-context-ui').then(({ ChatContextPanel }) => () => {
          chatContextPanel = new ChatContextPanel(
            () => accountAuth,
            () => channels,
            () => composer.target,
            () => {
              const changed = store.enrichPublic((message) => chatContextPanel?.enrich(message) ?? message);
              for (const message of changed) archive.add(message);
              if (changed.length) {
                visualRevision++;
                scheduleRender();
              }
              return changed.length;
            },
            !!panePopout || ephemeralPopout || overlay,
          );
          return chatContextPanel;
        }),
    });
    lazyPanels.register({
      id: 'provider-activity-panel',
      title: 'Provider activity',
      group: 'providers',
      load: () =>
        import('./provider-activity-ui').then(({ ProviderActivityPanel }) => () => {
          providerActivity = new ProviderActivityPanel(
            () => accountAuth,
            () => {
              if (!liveSources().includes(composer.target)) return;
              const data = rawMetadata.get(composer.target);
              return data?.broadcasterID ? { channel: composer.target, broadcasterID: data.broadcasterID } : undefined;
            },
            (auth, id) => providerEvents?.announceBTTV(auth, id) ?? false,
            !!panePopout || ephemeralPopout || overlay,
          );
          return providerActivity;
        }),
    });
    lazyPanels.register({
      id: 'browser-companion-panel',
      title: 'Browser companion',
      group: 'tools',
      load: () =>
        import('./browser-companion-ui').then(({ BrowserCompanionPanel }) => () => {
          browserCompanion = new BrowserCompanionPanel(
            () => accountAuth,
            () =>
              workspaceStore
                .all()
                .map((w) => ({ id: w.id, name: w.name, channels: w.channels, revision: JSON.stringify(w) })),
            () => currentWorkspaceID,
            (id, channel, revision, switching) => {
              if (composer.sending || panePopout || overlay || ephemeralPopout)
                throw new Error('Open watched channels from the main workspace after sending completes');
              let destination = workspaceStore.get(id);
              if (!destination || JSON.stringify(destination) !== revision)
                throw new Error('Destination workspace changed; review again');
              if (id !== currentWorkspaceID && !switching) throw new Error('Workspace switching is not enabled');
              saveWorkspace();
              destination = workspaceStore.get(id)!;
              const next = watchedWorkspace(destination, channel, capacity.workspaceChannels);
              workspaceStore.update(id, next);
              workspaceStore.activate(id);
              suppressWorkspaceSave = true;
              const url = new URL(location.href);
              url.search = '';
              url.searchParams.set('workspace', id);
              url.searchParams.set('channel', next.channels.join(','));
              location.assign(url.href);
            },
            !!panePopout || ephemeralPopout || overlay,
          );
          return browserCompanion;
        }),
    });
    lazyPanels.register({
      id: 'desktop-playback-panel',
      title: 'Desktop playback',
      group: 'tools',
      load: () =>
        import('./desktop-companion-ui').then(({ DesktopPlaybackPanel }) => () => {
          desktopPlayback = new DesktopPlaybackPanel(
            () => accountAuth,
            () => channels,
            () => composer.target,
            !!panePopout || ephemeralPopout || overlay,
          );
          return desktopPlayback;
        }),
    });
    lazyPanels.register({
      id: 'user-hold-panel',
      title: 'Own message feedback',
      group: 'account',
      load: () =>
        import('./user-holds').then(({ UserHoldPanel }) => () => {
          userHoldPanel = new UserHoldPanel(
            () => accountAuth,
            () => channels,
            () => composer.target,
            !!panePopout || ephemeralPopout || overlay,
          );
          return userHoldPanel;
        }),
    });
    lazyPanels.register({
      id: 'discovery-panel',
      title: 'Channels',
      group: 'chat',
      load: () =>
        import('./discovery').then(({ DiscoveryPanel }) => () => {
          discoveryPanel = new DiscoveryPanel(channels, (login) => {
            if (panePopout || overlay) throw new Error('Join channels from the parent workspace');
            if (composer.sending) throw new Error('Wait for the current send outcome before joining a channel');
            const next = parseWorkspaceChannels([...channels, login].join(','), capacity.workspaceChannels);
            if (!reconcileSplits(virtualLog.layout.snapshot(), next, channels))
              throw new Error('Close a pane or tab before adding another channel');
            input.value = next.join(',');
            form.requestSubmit();
          });
          discoveryPanel.setAuth(accountAuth);
          return discoveryPanel;
        }),
    });
    lazyPanels.register({
      id: 'user-notes',
      title: 'User notes',
      group: 'account',
      available: () => !!accountAuth?.authenticated,
      load: () =>
        import('./user-notes-ui').then(({ UserNotesPanel }) => () => {
          userNotesPanel = new UserNotesPanel();
          userNotesPanel.setAccount(accountAuth?.authenticated ? accountAuth.userID : undefined);
          return userNotesPanel;
        }),
    });
    lazyPanels.register({
      id: 'moderation-workspace',
      title: 'Moderation',
      group: 'moderation',
      available: () => !!accountAuth?.authenticated,
      load: () =>
        import('./moderation-ui').then(({ ModerationWorkspace }) => () => {
          moderationPanel = new ModerationWorkspace(channels, archive, () => currentWorkspaceID || channels.join(','));
          moderationPanel.setAuth(accountAuth);
          return moderationPanel;
        }),
    });
    lazyPanels.register({
      id: 'rules-panel',
      title: 'Rules',
      group: 'moderation',
      load: () =>
        import('./rules-ui').then(
          ({ RulePanel }) =>
            () =>
              new RulePanel(rulePanel!),
        ),
    });
    lazyPanels.register({
      id: 'presentation-panel',
      title: 'Presentation',
      group: 'view',
      load: () =>
        import('./presentation-ui').then(
          ({ PresentationPanel }) =>
            () =>
              new PresentationPanel(presentationRuntime),
        ),
    });
    lazyPanels.register({
      id: 'commands-panel',
      title: 'Commands',
      group: 'moderation',
      load: () =>
        import('./commands-ui').then(({ CommandPanel }) => () => {
          commandPanel = new CommandPanel(composer, commandContext, undefined, commandRuntime);
          return commandPanel;
        }),
    });
    lazyPanels.register({
      id: 'inbox-panel',
      title: 'Inbox',
      label: () => {
        const unread =
          inboxPanel!.model.unread('mentions') +
          inboxPanel!.model.unread('replies') +
          inboxPanel!.model.unread('whispers');
        return unread ? 'Inbox (' + unread + ')' : 'Inbox';
      },
      group: 'chat',
      load: () =>
        import('./inbox-ui').then(({ InboxPanel }) => () => {
          const view = new InboxPanel(
            channels,
            (message) => {
              void showArchived(message);
            },
            (login) => composer.prepareWhisper(login),
            inboxPanel!,
          );
          return view;
        }),
    });
    lazyPanels.register({
      id: 'threads-panel',
      title: 'Threads',
      group: 'chat',
      load: () =>
        import('./threads-ui').then(({ ThreadsPanel }) => () => {
          threadsPanel = new ThreadsPanel(
            log,
            viewMessages,
            archive,
            channels,
            (message) => {
              localTargets.reply(message);
              composer.selectReply(message);
            },
            (change) => {
              document.dispatchEvent(new Event('presentation-before-change'));
              change();
              render();
            },
          );
          threadsPanel.setScope(
            accountAuth === undefined ? undefined : accountAuth.authenticated ? accountAuth.userID : 'anonymous',
            currentWorkspaceID || channels.join(','),
          );
          return threadsPanel;
        }),
    });
    lazyPanels.register({
      id: 'bookmarks-panel',
      title: 'Bookmarks',
      group: 'chat',
      load: () =>
        import('./bookmarks-ui').then(({ BookmarksPanel }) => () => {
          bookmarksPanel = new BookmarksPanel(
            log,
            viewMessages,
            archive,
            (message) => {
              void showArchived(message);
            },
            (message) => {
              void lazyPanels?.perform('vod-context', () => vodContext?.show(message), false);
            },
          );
          bookmarksPanel.setAccount(
            accountAuth === undefined ? undefined : accountAuth.authenticated ? accountAuth.userID : 'anonymous',
          );
          return bookmarksPanel;
        }),
    });
    lazyPanels.register({
      id: 'provider-preferences-panel',
      title: 'Provider and badge preferences',
      group: 'providers',
      load: () =>
        import('./provider-preferences-ui').then(({ ProviderPanel }) => () => {
          providerPanel = new ProviderPanel(
            () => {
              providerActivity?.preferencesChanged();
              cosmeticClient.preferencesChanged();
              providerEvents?.preferencesChanged();
              for (const data of rawMetadata.values()) applyProviderData(data);
              visualRevision++;
              scheduleRender();
            },
            reloadProviderMetadata,
            !!panePopout || ephemeralPopout || overlay,
            () => providerEvents?.reconnect(),
          );
          providerPanel.eventsStatus(providerEventsNotice);
          providerPanel.cosmeticsStatus(providerCosmeticNotice);
          return providerPanel;
        }),
    });
    lazyPanels.register({
      id: 'extensions-panel',
      title: 'Web extensions',
      group: 'tools',
      load: () =>
        import('./extensions-ui').then(({ ExtensionsPanel }) => () => {
          extensionsPanel = new ExtensionsPanel(
            () => accountAuth,
            () => composer.target,
            (text) => {
              if (!composer.canInsert) throw new Error('Log in before staging extension output');
              composer.insert(text);
            },
            !!panePopout || ephemeralPopout || overlay,
          );
          return extensionsPanel;
        }),
    });
    lazyPanels.register({
      id: 'workspace-panel',
      title: 'Workspaces',
      group: 'view',
      load: () =>
        Promise.all([import('./workspaces-ui'), import('./panel-templates/workspace-panel.html?raw')]).then(
          ([{ WorkspacePanel }, markup]) =>
            () => {
              const root = mountPanel<HTMLDialogElement>(markup.default, 'workspace-panel');
              workspacePanel = new WorkspacePanel(
                root,
                panelTrigger('workspace-open'),
                workspaceStore,
                () => currentWorkspaceID,
                captureWorkspace,
                saveWorkspace,
                (workspace) => {
                  if (composer.sending)
                    throw new Error('Wait for the current send outcome before switching workspaces');
                  const url = new URL(location.href);
                  url.search = '';
                  url.searchParams.set('workspace', workspace.id);
                  url.searchParams.set('channel', workspace.channels.join(','));
                  if (overlay) url.searchParams.set('overlay', '1');
                  location.assign(url.href);
                },
                !!panePopout || ephemeralPopout,
              );
              return panelAdapter(
                'workspace-panel',
                'Workspaces',
                'view',
                root,
                () => workspacePanel!.open(),
                () => root.close(),
                () => workspacePanel!.stop(),
              );
            },
        ),
    });
    lazyPanels.register({
      id: 'archive-search',
      title: 'Search archive',
      group: 'chat',
      load: () =>
        Promise.all([
          import('./archive-ui'),
          import('./history-import'),
          import('./panel-templates/archive-search.html?raw'),
        ]).then(([{ ArchiveSearch }, { HistoryFiles }, markup]) => () => {
          const root = mountPanel<HTMLDialogElement>(markup.default, 'archive-search');
          archiveSearch = new ArchiveSearch(
            root,
            panelTrigger('archive-open'),
            archive,
            channels,
            (message) => {
              void showArchived(message);
            },
            (message) => {
              root.close();
              void lazyPanels?.perform(
                'bookmarks-panel',
                () => {
                  void bookmarksPanel?.capture(message);
                },
                false,
              );
            },
            (message) => {
              void lazyPanels?.perform('vod-context', () => vodContext?.show(message), false);
            },
          );
          archiveSearch.setAccount(
            accountAuth === undefined ? undefined : accountAuth.authenticated ? accountAuth.userID : 'anonymous',
          );
          const historyFiles = new HistoryFiles(
            root,
            () => channels[0]!,
            () => store.messages,
            async (messages) => {
              for (let index = 0; index < messages.length; index += 500) {
                for (const message of messages.slice(index, index + 500)) {
                  archive.add(message);
                  statsLedger.observe(message, message.timestamp);
                }
                await archive.flush();
              }
              store.restore(messages.filter((message) => channels.includes(message.channel)));
              store.save();
              statsLedger.save();
              scheduleRender();
            },
            () => {
              root.close();
              void lazyPanels?.open('portable-logs');
            },
          );

          return panelAdapter(
            'archive-search',
            'Search archive',
            'chat',
            root,
            () => archiveSearch!.show(),
            () => root.close(),
            () => {
              archiveSearch!.stop();
              historyFiles.stop();
            },
          );
        }),
    });
    lazyPanels.register({
      id: 'user-inspector',
      title: 'User context',
      group: 'chat',
      command: false,
      restorable: false,
      load: () =>
        Promise.all([import('./inspector'), import('./panel-templates/user-inspector.html?raw')]).then(
          ([{ UserInspector }, markup]) =>
            () => {
              const root = mountPanel<HTMLDialogElement>(markup.default, 'user-inspector');
              inspector = new UserInspector(
                root,
                log,
                viewMessages,
                () => accountAuth,
                (message) => {
                  localTargets.reply(message);
                  composer.selectReply(message);
                },
                (login) =>
                  display.options.pn
                    ? pronouns.get(login).then((label) => (display.options.pn ? label : undefined))
                    : Promise.resolve(undefined),
                (id, login) => noteEditor(id, login),
                (message) => {
                  void lazyPanels?.perform('moderation-workspace', () => moderationPanel?.show(message), false);
                },
              );
              inspector.setAccount(accountAuth?.authenticated ? accountAuth.userID : undefined);
              const commandAction = document.createElement('button');
              commandAction.type = 'button';
              commandAction.textContent = 'Custom message action';
              commandAction.addEventListener('click', () => {
                const selected = commandContext();
                const context = {
                  ...selected,
                  channel: { ...selected.channel },
                  message: selected.message ? { ...selected.message } : undefined,
                };
                void lazyPanels?.perform(
                  'commands-panel',
                  () => {
                    commandPanel?.messageAction(context);
                    root.close();
                  },
                  false,
                );
              });
              root.append(commandAction);
              return panelAdapter(
                'user-inspector',
                'User context',
                'chat',
                root,
                () => {},
                () => root.close(),
                () => inspector!.stop(),
              );
            },
        ),
    });
    lazyPanels.register({
      id: 'display-panel',
      title: 'Settings',
      group: 'view',
      load: () =>
        Promise.all([import('./display-ui'), import('./panel-templates/display-panel.html?raw')]).then(
          ([{ DisplaySettings }, markup]) =>
            () => {
              const root = mountPanel<HTMLDialogElement>(markup.default, 'display-panel');
              const view = new DisplaySettings(root, panelTrigger('display-open'), display);
              const displaySearch = document.createElement('input');
              displaySearch.type = 'search';
              displaySearch.placeholder = 'Search display settings';
              displaySearch.setAttribute('aria-label', 'Search display settings');
              element('display-panel', HTMLDialogElement).prepend(displaySearch);
              displaySearch.addEventListener('input', () => {
                for (const label of element('display-panel', HTMLDialogElement).querySelectorAll<HTMLLabelElement>(
                  'label',
                ))
                  label.hidden = !label.textContent?.toLowerCase().includes(displaySearch.value.toLowerCase());
              });

              element('display-panel', HTMLDialogElement).addEventListener('change', (event) => {
                if (event.target instanceof HTMLInputElement && event.target.name === 'notify' && event.target.checked)
                  void attention.permission();
              });

              element('alert-test', HTMLButtonElement).addEventListener('click', () => {
                void attention.test().then((result) => {
                  element('alert-test-status', HTMLElement).textContent = result;
                });
              });

              return panelAdapter(
                'display-panel',
                'Settings',
                'view',
                root,
                () => view.open(),
                () => view.close(),
                () => view.stop(),
              );
            },
        ),
    });
    lazyPanels.register({
      id: 'video-panel',
      title: 'Video',
      group: 'chat',
      load: () =>
        Promise.all([import('./video'), import('./panel-templates/video-panel.html?raw')]).then(
          ([{ VideoPanel }, markup]) =>
            () =>
              passiveSettings.handoff('video', () => {
                const root = mountPanel<HTMLElement>(markup.default, 'video-panel');
                videoPanel = new VideoPanel(root, panelTrigger('video-open'), channels);

                return panelAdapter(
                  'video-panel',
                  'Video',
                  'chat',
                  root,
                  () => videoPanel!.open(),
                  () => videoPanel!.close(),
                  () => {
                    videoPanel!.stop();
                  },
                );
              }),
        ),
    });
    lazyPanels.register({
      id: 'stats-panel',
      title: 'Stats',
      group: 'chat',
      load: () =>
        Promise.all([import('./stats'), import('./panel-templates/stats-panel.html?raw')]).then(
          ([{ StatsPanel }, markup]) =>
            () =>
              passiveSettings.handoff('stats', () => {
                const root = mountPanel<HTMLDialogElement>(markup.default, 'stats-panel');
                statsPanel = new StatsPanel(
                  root,
                  panelTrigger('stats-open'),
                  element('rate', HTMLElement),
                  () => store.messages,
                  (channel) => metadata.get(channel)?.emotes ?? {},
                  channels,
                  rateTimeline.series,
                  statsLedger,
                  (channel) => metadata.get(channel)?.emoteUse ?? {},
                  streamHistory,
                  (channel) => metadata.get(channel)?.badges ?? {},
                );

                return panelAdapter(
                  'stats-panel',
                  'Stats',
                  'chat',
                  root,
                  () => statsPanel!.open(),
                  () => statsPanel!.close(),
                  () => {
                    statsPanel!.stop();
                  },
                );
              }),
        ),
    });
    lazyPanels.register({
      id: 'emote-picker',
      title: 'Emotes',
      group: 'chat',
      load: () =>
        Promise.all([import('./picker'), import('./panel-templates/emote-picker.html?raw')]).then(
          ([{ EmotePicker }, markup]) =>
            () =>
              passiveSettings.handoff('picker', () => {
                const root = mountPanel<HTMLElement>(markup.default, 'emote-picker');
                picker = new EmotePicker(
                  root,
                  panelTrigger('picker-open'),
                  pickerModel,
                  () => composer.target,
                  () => composer.canInsert,
                  (code) => composer.insert(code),
                  (on) => {
                    borrowedFreeze = on;
                    document.documentElement.dataset.holdFreeze = String(on);
                    visualRevision++;
                    scheduleRender();
                  },
                  () => rateTimeline.series.observationGaps(),
                );
                pickerLighting = new PickerLighting(log, root);
                return panelAdapter(
                  'emote-picker',
                  'Emotes',
                  'chat',
                  root,
                  () => picker!.open(),
                  () => picker!.close(),
                  () => {
                    picker!.stop();
                    pickerLighting?.stop();
                  },
                );
              }),
        ),
    });
    lazyPanels.register({
      id: 'resources-panel',
      title: 'Help and resources',
      group: 'help',
      load: () =>
        Promise.all([import('./resources'), import('./panel-templates/resources-panel.html?raw')]).then(
          ([{ Resources }, markup]) =>
            () =>
              passiveSettings.handoff('resources', () => {
                const root = mountPanel<HTMLElement>(markup.default, 'resources-panel');
                resources = new Resources(root, panelTrigger('resources-open'), (name) => {
                  const id = (
                    {
                      'display-open': 'display-panel',
                      'stats-open': 'stats-panel',
                      'archive-open': 'archive-search',
                    } as Record<string, string>
                  )[name];
                  if (id) void lazyPanels?.open(id);
                });

                return panelAdapter(
                  'resources-panel',
                  'Help and resources',
                  'help',
                  root,
                  () => resources!.open(),
                  () => resources!.close(),
                  () => {
                    resources!.stop();
                  },
                );
              }),
        ),
    });
    lazyPanels.register({
      id: 'shortcut-settings',
      title: 'Shortcuts',
      group: 'help',
      load: () =>
        import('./shortcuts-ui').then(
          ({ ShortcutPanel }) =>
            () =>
              new ShortcutPanel(hotkeys),
        ),
    });
    lazyPanels.register({
      id: 'whisper-panel',
      title: 'Whispers',
      label: () => (whispers.unread ? 'Whispers (' + whispers.unread + ')' : 'Whispers'),
      group: 'chat',
      available: () => !!accountAuth?.authenticated,
      load: () =>
        Promise.all([import('./whispers-ui'), import('./panel-templates/whisper-panel.html?raw')]).then(
          ([{ WhisperPanel }, markup]) =>
            () => {
              const root = mountPanel<HTMLElement>(markup.default, 'whisper-panel');
              const view = new WhisperPanel(root, whispers, (login) => {
                localTargets.whisper(login);
                composer.prepareWhisper(login);
              });
              return panelAdapter(
                'whisper-panel',
                'Whispers',
                'chat',
                root,
                () => view.open(),
                () => view.close(),
                () => view.stop(),
              );
            },
        ),
    });
    lazyPanels.register({
      id: 'image-uploads-panel',
      title: 'Upload image',
      group: 'chat',
      available: () => uploadRuntime.enabled,
      load: async () => {
        await uploadRuntime.ready;
        const { ImageUploads } = await import('./image-uploads');
        return () => {
          imageUploads = new ImageUploads(
            () => ({ auth: accountAuth, channel: composer.target, canInsert: composer.canInsert }),
            (url) => composer.insert(url),
            !!panePopout || ephemeralPopout || overlay,
            undefined,
            uploadRuntime.config,
          );
          return imageUploads;
        };
      },
    });
    lazyPanels.register({
      id: 'privacy-settings',
      title: 'Privacy settings',
      group: 'view',
      load: () =>
        import('./privacy-settings-ui').then(
          ({ PrivacySettingsPanel }) =>
            () =>
              new PrivacySettingsPanel(privacyControls),
        ),
    });
    lazyPanels.register({
      id: 'account-profiles',
      title: 'Accounts',
      group: 'account',
      load: stopAuth.loadAccountsPanel,
    });
    const openAccounts = (): void => {
      void lazyPanels?.open('account-profiles');
    };
    document.addEventListener('open-account-profiles', openAccounts);
    window.addEventListener('pagehide', () => document.removeEventListener('open-account-profiles', openAccounts));
    lazyPanels.register({
      id: 'vod-context',
      title: 'VOD context',
      group: 'chat',
      command: false,
      restorable: false,
      load: () =>
        import('./vod-context-ui').then(({ VodContextPanel }) => () => {
          vodContext = new VodContextPanel((channel) => streamHistory.archives(channel));
          vodContext.setAccount(
            accountAuth === undefined ? undefined : accountAuth.authenticated ? accountAuth.userID : 'anonymous',
          );
          return panelAdapter(
            'vod-context',
            'VOD context',
            'chat',
            vodContext.root,
            () => {},
            () => vodContext!.close(),
            () => vodContext!.stop(),
          );
        }),
    });
    lazyPanels.register({
      id: 'local-command-help',
      title: 'Local command help',
      group: 'help',
      load: () => import('./local-help-ui').then(({ localHelpPanel }) => localHelpPanel),
    });
    lazyPanels.register({
      id: 'device-sync-panel',
      title: 'Device sync',
      group: 'tools',
      keywords: 'manual public snapshot recovery backup',
      load: () =>
        import('./device-sync-ui').then(({ DeviceSyncPanel }) => () => {
          deviceSyncPanel = new DeviceSyncPanel(
            () => accountAuth,
            () => {
              const bookmarks = new BookmarkStore();
              bookmarks.setAccount(accountAuth?.userID);
              return {
                activeWorkspace: currentWorkspaceID,
                workspaces: workspaceStore
                  .all()
                  .map((w) => (w.id === currentWorkspaceID ? { ...w, ...captureWorkspace() } : w)),
                preferences: {
                  display: display.options,
                  presentation: getPresentation(),
                  picker: pickerModel.options,
                  provider: getProviderPreferences(),
                  links: getLinkPreferences(),
                },
                bookmarks: bookmarks.list(),
              };
            },
            () => !composer.sending,
            () => {
              suppressWorkspaceSave = true;
              const next = new WorkspaceStore().active;
              const url = new URL(location.href);
              if (next) {
                url.searchParams.set('workspace', next.id);
                url.searchParams.delete('channel');
              }
              location.assign(url.href);
            },
            false,
            syncRecovery,
          );
          return deviceSyncPanel;
        }),
    });
    lazyPanels.register({
      id: 'custom-theme-panel',
      title: 'Custom themes',
      group: 'view',
      keywords: 'colors palette import contrast',
      load: () =>
        import('./custom-theme-ui').then(
          ({ CustomThemePanel }) =>
            () =>
              new CustomThemePanel(customThemeRuntime),
        ),
    });
    passiveSettings.startup();
    configureRail(display.options.split);
    for (const command of [
      {
        id: 'view:theme',
        label: 'Toggle light theme',
        group: 'view' as const,
        trigger: theme,
        run: () => theme.click(),
      },
      {
        id: 'view:freeze',
        label: 'Freeze emotes',
        group: 'view' as const,
        trigger: animation,
        run: () => animation.click(),
      },
      { id: 'view:header', label: 'Cycle header', group: 'view' as const, run: () => display.minimize() },
      { id: 'view:panes', label: 'Independent panes', group: 'view' as const, run: () => virtualLog.toggleLayout() },
      {
        id: 'chat:selection-search',
        label: 'Search selected chat text',
        group: 'chat' as const,
        available: () => getLinkPreferences().searchEnabled && !privacyEnabled(),
        run: () => linkTools.selection(),
      },
    ])
      shell.registry.register(command);
    restoreSavedThreads();
    const privacyToolbar = document.getElementById('privacy-toolbar');
    if (privacyToolbar) document.getElementById('topbar')?.append(privacyToolbar);
    lazyPanels.register({
      id: 'resource-readout',
      title: 'Resource readout',
      group: 'help',
      keywords: 'debug memory timers long tasks',
      load: () =>
        import('./resource-readout').then(
          ({ ResourceReadout }) =>
            () =>
              new ResourceReadout(() => ({
                mountedRows: log.querySelectorAll('[data-virtual-key]').length,
                rowCache: rowsByMessage.size,
                retainedMessages: store.messages.length,
              })),
        ),
    });
  }
  window.addEventListener('pagehide', () => {
    lazyPanels?.stop();
    shell?.stop();
  });
}
