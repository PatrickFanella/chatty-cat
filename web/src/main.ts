import {SocialCards} from './social-cards';
import { RateTimeline } from './rate-timeline';
import { linkFingerprint } from './links';
import { PickerLighting } from './picker-lighting';
import { IdentityCards } from './identity-cards';
import { Pronouns } from './pronouns';
import { PanelRail } from './rail';
import { ChatRecovery } from './recovery';
import { LogKeyboard } from './log-keyboard';
import { Whispers } from './whispers';
import { PersonalChat, PersonalState } from './personal';
import { UserInspector } from './inspector';
import { Resources } from './resources';
import { ColumnLog } from './column-log';
import { type LogItem } from './virtual-log';
import { Attention } from './attention';
import { AccountEmotes } from './account-emotes';
import type { AuthStatus } from './auth';
import { LinkPreview } from './preview';
import { mountLifecycle } from './lifecycle';
import { VideoPanel } from './video';
import { TabSync } from './tab-sync';
import { DisplaySettings, messageVisibility } from './display';
import { StatsPanel } from './stats';
import { MessageArchive } from './archive';
import { ArchiveSearch } from './archive-ui';
import { RoomStates } from './room';
import './style.css';
import { mountAuth } from './auth';
import { Composer } from './composer';
import { PickerModel } from './picker-model';
import { EmotePicker } from './picker';
import { MessageNavigation } from './navigation';
import { tokenize, nativeEmoteTag } from './tokens';
import { ChatConnection } from './connection';
import { parseChannels, type ChatMessage } from './protocol';
import { messageRow } from './render';
import { MessageStore } from './store';
import { MetadataClient, type ChannelMetadata } from './metadata';

function element<T extends HTMLElement>(id: string, constructor: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof constructor)) throw new Error(`Missing UI element: ${id}`);
  return found;
}

const stopLifecycle = mountLifecycle(element('offline', HTMLElement), element('app-update', HTMLButtonElement));
const overlay=new URL(location.href).searchParams.has('overlay')&&new URL(location.href).searchParams.get('overlay')!=='0';
document.documentElement.dataset.overlay=String(overlay);
const log = element('log', HTMLElement);
let rail:PanelRail|undefined;
const virtualLog = new ColumnLog(log);
const pronouns = new Pronouns();
const socialCards=new SocialCards(log);
const linkPreview = new LinkPreview(log, element('link-preview', HTMLElement));
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
function renderRoom(): void { roomInfo.textContent = [...roomStates.labels(composer.target), ...personalState.labels(composer.target)].join(' · '); composer.setBlock(personalState.block(composer.target, roomStates.slow(composer.target))); roomInfo.hidden = !roomInfo.textContent || document.documentElement.dataset.cmodes === 'false'; }
const metadata = new Map<string, ChannelMetadata>();
const fingerprints=new WeakMap<ChatMessage,string>();
const rowsByMessage = new WeakMap<ChatMessage, { revision: number; row: HTMLElement }>();
let visualRevision = 0;
let frozen = false;
let borrowedFreeze=false;
try { frozen = localStorage.getItem('chatthing:v1:frozen') === '1'; } catch { /* optional storage */ }
animation.setAttribute('aria-pressed', String(frozen));
let channels: string[];
try { channels = parseChannels(new URL(location.href).searchParams.get('channel') || 'hasanabi'); }
catch { channels = ['hasanabi']; }
input.value = channels.join(',');
const store = new MessageStore(channels);
const rateTimeline=new RateTimeline(element('rate',HTMLElement),channels);
const videoPanel = new VideoPanel(element('video-panel', HTMLElement), element('video-open', HTMLButtonElement), channels);
rail=new PanelRail(log,[{name:'video',root:element('video-panel',HTMLElement),show:open=>videoPanel.showRail(open),float:()=>videoPanel.float(),isOpen:()=>!element('video-panel',HTMLElement).hidden},{name:'emotes',root:element('emote-picker',HTMLElement),show:open=>picker.showRail(open),isOpen:()=>!element('emote-picker',HTMLElement).hidden},{name:'stats',root:element('stats-panel',HTMLDialogElement),show:open=>statsPanel.showRail(open),float:()=>statsPanel.float(),isOpen:()=>element('stats-panel',HTMLDialogElement).open}]);
window.addEventListener('resize',scheduleRender);
const statsPanel = new StatsPanel(element('stats-panel', HTMLDialogElement), element('stats-open', HTMLButtonElement), element('rate', HTMLElement), () => store.messages, channel => metadata.get(channel)?.emotes ?? {}, channels,rateTimeline.series);
const archive = new MessageArchive((message) => { element('archive-status', HTMLElement).textContent = message; });
for (const message of store.messages) archive.add(message);
const composer = new Composer(element('composer', HTMLFormElement), channels, (id, channel, text) => {
  const action = /^\/me\s+(.+)$/i.exec(text);
  const shown = action ? '\x01ACTION ' + action[1]!.trim() + '\x01' : text;
  const ownTags = personalState.tags(channel);
  const message: ChatMessage = { id, channel, text: shown, command: 'PRIVMSG', login: selfLogin, timestamp: Date.now(), tags: { ...ownTags, 'display-name': ownTags['display-name'] || selfLogin, 'emotes': nativeEmoteTag(shown, pickerModel.availableNative()), 'local-echo': '1' } };
  personalState.accepted(channel); renderRoom(); acceptEcho(message); tabSync.send(message);
  const codes = new Set(pickerModel.catalog(channel).map((item) => item.code));
  for (const word of text.split(/\s+/)) if (codes.has(word)) pickerModel.select(channel, word);
  picker.refresh();
}, (result, text, requestID) => { if (result.whisper && result.recipient) { const match = /^\/w\s+\S+\s+(.+)$/i.exec(text.trim()); if (match) whispers.echo(result.recipient, match[1]!, requestID); } });
const pickerModel = new PickerModel();
const picker = new EmotePicker(element('emote-picker', HTMLElement), element('picker-open', HTMLButtonElement), pickerModel, () => composer.target, () => composer.canInsert, (code) => composer.insert(code), on=>{borrowedFreeze=on;document.documentElement.dataset.holdFreeze=String(on);visualRevision++;scheduleRender();});
let accountAuth: AuthStatus | undefined;
const sharePicker=(event:Event):void=>{if(event instanceof CustomEvent&&event.detail instanceof URL)picker.share(event.detail);};document.addEventListener('share-settings',sharePicker);
const pickerLighting=new PickerLighting(log,element('emote-picker',HTMLElement));
const accountEmotes = new AccountEmotes(emotes => { pickerModel.setAccount(emotes); refreshCandidates(); picker.refresh(true); }, element('account-emotes', HTMLElement));
let selfLogin = '';
function acceptEcho(message: ChatMessage): void { if (!channels.includes(message.channel) || !store.add(message)) return; archive.add(message); observe(message, true); scheduleRender(); }
const tabSync = new TabSync(acceptEcho);
const logKeyboard = new LogKeyboard(log,virtualLog,composer,()=>{follow=false;latest.hidden=false;},()=>latest.click());
const whispers = new Whispers(element('whisper-panel', HTMLElement), element('whisper-open', HTMLButtonElement), login => composer.prepareWhisper(login), message => attention.whisper(message));
const personalChat = new PersonalChat(channels, event => { if (event.type === 'message') { personalState.observe(event.message); if (event.message.command === 'ROOMSTATE') roomStates.observe(event.message); renderRoom(); } }, element('personal-status', HTMLElement), login => { personalState.reset(login); renderRoom(); });
const personalTimer = setInterval(renderRoom, 1000);
const stopAuth = mountAuth(element('login', HTMLButtonElement), element('account', HTMLElement), (auth) => { accountAuth = auth; whispers.update(auth); personalChat.update(auth); accountEmotes.update(auth, composer.target); const oldLogin = selfLogin; selfLogin = auth?.authenticated ? auth.login ?? '' : ''; if (oldLogin !== selfLogin) scheduleRender(); const wasEnabled = composer.canInsert; composer.setAuth(auth); picker.refresh(wasEnabled !== composer.canInsert); });
log.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const id = event.target.closest<HTMLButtonElement>('button[data-reply]')?.dataset.reply;
  const channel = event.target.closest<HTMLElement>('.row')?.dataset.channel;
  const message = store.messages.find((message) => message.id === id && message.channel === channel);
  if (message) composer.selectReply(message);
});
let renderQueued = false;
let follow = true;
let archiveView: ChatMessage[] | undefined;
let archiveGeneration = 0;
element('composer', HTMLFormElement).addEventListener('composerresize', () => { if (follow) log.scrollTop = display.options.rev?0:log.scrollHeight; });
const navigation = new MessageNavigation(log, () => { follow = false; latest.hidden = false; }, id => { const message = (archiveView ?? store.messages).find(item => item.id === id); if (message) virtualLog.reveal(messageKey(message)); });
async function showArchived(message: ChatMessage): Promise<void> {
  const generation = ++archiveGeneration;
  try {
    const context = await archive.search({ text: '', channel: message.channel, before: message.timestamp + 30000, after: Math.max(0, message.timestamp - 30000), limit: 500 });
    if (generation !== archiveGeneration) return;
    if (!context.some(item => item.id === message.id && item.channel === message.channel)) context.push(message);
    archiveView = context.sort((a, b) => a.timestamp - b.timestamp); follow = false;
    const url = new URL(location.href); if (message.id) url.searchParams.set('mid', message.id); history.pushState(null, '', url);
    render(); window.dispatchEvent(new PopStateEvent('popstate'));
  } catch { element('archive-status', HTMLElement).textContent = 'Archived context unavailable'; }
}
const archiveSearch = new ArchiveSearch(element('archive-search', HTMLDialogElement), element('archive-open', HTMLButtonElement), archive, channels, (message) => { void showArchived(message); });
const initialID = new URL(location.href).searchParams.get('mid');
if (initialID && !store.messages.some(message => message.id === initialID)) void archive.get(initialID, channels).then(message => { if (message) void showArchived(message); }).catch(() => {});
const names = new Map<string, Map<string, true>>();
const nativeCodes = new Map<string, Set<string>>();
function observe(message: ChatMessage, live = false): void {
  rateTimeline.series.observe(message,live);
  if (roomStates.observe(message)) renderRoom();
  const used=pickerModel.observe(message, live);if(message.channel===composer.target)pickerLighting.use(used);
  if (message.command !== 'PRIVMSG') return;
  const users = names.get(message.channel) ?? new Map<string, true>();
  if (message.login) { users.delete(message.login); users.set(message.login, true); }
  while (users.size > 1000) { const first = users.keys().next().value; if (first) users.delete(first); else break; }
  names.set(message.channel, users);
  const codes = nativeCodes.get(message.channel) ?? new Set<string>();
  for (const token of tokenize(message.text, message.tags.emotes ?? '', {})) if (token.type === 'emote') codes.add(token.emote.code);
  while (codes.size > 1000) { const first = codes.values().next().value; if (first) codes.delete(first); else break; }
  nativeCodes.set(message.channel, codes);
}
function refreshCandidates(): void {
  composer.setCandidates([...(names.get(composer.target)?.keys() ?? [])],
    [...new Set([...Object.keys(metadata.get(composer.target)?.emotes ?? {}), ...(nativeCodes.get(composer.target) ?? []), ...pickerModel.catalog(composer.target).filter(item => item.source === "Twitch").map(item => item.code)])]);
}
for (const message of store.messages) observe(message);
refreshCandidates();
element('send-channel', HTMLSelectElement).addEventListener('change', refreshCandidates);
element('send-channel', HTMLSelectElement).addEventListener('change', renderRoom);
log.addEventListener('click', refreshCandidates);
element('send-channel', HTMLSelectElement).addEventListener('change', () => { accountEmotes.update(accountAuth, composer.target); picker.refresh(true); });
log.addEventListener('click', () => { accountEmotes.update(accountAuth, composer.target); picker.refresh(); });


function messageKey(message: ChatMessage): string { return message.channel + ':' + (message.id || [message.command, message.timestamp, message.login, message.text, message.tags['system-msg'] ?? ''].join(':')); }
function render(): void {
  renderQueued = false;
  rail?.set(overlay?1:display.options.split);
  document.documentElement.style.setProperty('--composer-bottom',element('composer',HTMLFormElement).getBoundingClientRect().bottom+'px');
  store.setCap(display.options.scrollback);
  const messages = archiveView ?? store.messages;
  const cleared = new Map<string, number>();
  const deleted = new Set<string>();
  for (const message of messages) {
    if (message.command === 'CLEARMSG' && message.tags['target-msg-id']) deleted.add(message.channel + ':' + message.tags['target-msg-id']);
    if (message.command === 'CLEARCHAT') { const key = message.channel + ':' + message.text.toLowerCase(); cleared.set(key, Math.max(cleared.get(key) ?? 0, message.timestamp)); }
  }
  const items: LogItem[] = [];const seenLinks=new Set<string>();
  // Hidden-user stubs keep their place among visible messages, rather than
  // collecting at the live edge and disturbing scroll anchoring.
  for (const message of messages) {
    if (['ROOMSTATE', 'USERSTATE', 'GLOBALUSERSTATE'].includes(message.command)) continue;
    const visibility = messageVisibility(message, display.options, selfLogin);
    if (visibility.blocked || (visibility.hiddenUser && display.options.hideMode === 'vanish')) continue;
    if(display.options.links){let fingerprint=fingerprints.get(message);if(fingerprint===undefined){fingerprint=linkFingerprint(message.text);fingerprints.set(message,fingerprint);}if(!fingerprint||seenLinks.has(fingerprint))continue;if(seenLinks.size>=20000)seenLinks.clear();seenLinks.add(fingerprint);}
    const key = messageKey(message);
    if (visibility.hiddenUser && display.options.hideMode === 'stub') {
      items.push({ key, render: () => { const row = document.createElement('article'); row.className = 'row notice'; row.dataset.id = message.id; row.dataset.channel = message.channel; row.textContent = message.login + ': hidden message'; return row; } }); continue;
    }
    items.push({ key, render: () => {
      const previous = rowsByMessage.get(message);
      const row = previous?.revision === visualRevision ? previous.row : messageRow(message, metadata.get(message.channel), frozen||borrowedFreeze);
      rowsByMessage.set(message, { revision: visualRevision, row });
      row.classList.toggle('keyword-match', visibility.highlight); row.classList.toggle('user-ghost', visibility.hiddenUser);
      const removed = message.command === 'PRIVMSG' && (deleted.has(key) || message.timestamp <= (cleared.get(message.channel + ':') ?? -1) || message.timestamp <= (cleared.get(message.channel + ':' + message.login.toLowerCase()) ?? -1));
      row.classList.toggle('removed', removed); return row;
    } });
  }
  virtualLog.set(display.options.rev?items.reverse():items, follow, visualRevision, display.options.rev, overlay?1:display.options.split,display.options.pause);
  count.textContent = archiveView ? `${archiveView.length} archived messages · Jump to live to return` : `${store.messages.length.toLocaleString()} messages`;
  latest.hidden = follow;
  navigation.reveal();
}

const display = new DisplaySettings(element('display-panel', HTMLDialogElement), element('display-open', HTMLButtonElement), () => { visualRevision++; picker.refresh(true); scheduleRender(); });
let hydratedCap = 0;
let hydrationAbort = new AbortController();
function hydrateHistory(): void {
  const cap = display.options.scrollback; if (cap === hydratedCap) return; hydratedCap = cap;
  hydrationAbort.abort(); hydrationAbort = new AbortController(); const signal = hydrationAbort.signal;
  void archive.recent(channels, cap, signal).then(messages => {
    if (signal.aborted) return; store.setCap(display.options.scrollback); store.restore(messages);
    for (const message of messages) observe(message, false); refreshCandidates(); picker.refresh(); scheduleRender();
  }).catch(() => { if (!signal.aborted) element('archive-status', HTMLElement).textContent = 'Saved history unavailable; live chat continues'; });
}
hydrateHistory();
element('display-panel', HTMLDialogElement).addEventListener('change', hydrateHistory);
window.addEventListener('storage', event => { if (event.key === 'chatthing:v1:display') hydrateHistory(); });

const attention = new Attention(element('missed-mentions', HTMLButtonElement), () => display.options, (id, channel) => {
  const message = store.messages.find(item => item.id === id && item.channel === channel);
  if (message) void showArchived(message); else void archive.get(id, [channel]).then(found => { if (found) void showArchived(found); }).catch(() => {});
});
element('display-panel', HTMLDialogElement).addEventListener('change', event => { if (event.target instanceof HTMLInputElement && event.target.name === 'notify' && event.target.checked) void attention.permission(); });

const inspector = new UserInspector(element('user-inspector', HTMLDialogElement), log, () => archiveView ?? store.messages, () => accountAuth, message => composer.selectReply(message), login=>display.options.pn?pronouns.get(login).then(label=>display.options.pn?label:undefined):Promise.resolve(undefined));
const identityCards=new IdentityCards(document.body,element('identity-preview',HTMLElement),()=>store.messages,login=>display.options.pn?pronouns.get(login).then(label=>display.options.pn?label:undefined):Promise.resolve(undefined));
const resources = new Resources(element('resources-panel', HTMLElement), element('resources-open', HTMLButtonElement), name => document.getElementById(name)?.click());
render();
function scheduleRender(): void {
  if (!renderQueued) { renderQueued = true; requestAnimationFrame(render); }
}
const metadataClient = new MetadataClient(channels, (data) => {
  const previous = metadata.get(data.channel);
  if (JSON.stringify([previous?.emotes, previous?.badges]) !== JSON.stringify([data.emotes, data.badges])) visualRevision++;
  metadata.set(data.channel, data);
  pickerModel.setSeeds(data.channel,data.emoteUse??{});pickerModel.setMetadata(data.channel, data.emotes); picker.refresh();
  refreshCandidates();
  if (data.stream.uptime && !data.errors.includes('stream uptime')) attention.stream(data.channel, !/offline|not streaming|not live|not online|not found/i.test(data.stream.uptime), data.stream.title);
  if (data.channel === channels[0]) {
    streamInfo.textContent = [data.stream.uptime, /^\d+$/.test(data.stream.viewers) ? `${Number(data.stream.viewers).toLocaleString()} viewers` : '', data.stream.title].filter(Boolean).join(' · ');
    if(data.lastVod){const archiveLink=document.createElement('a');archiveLink.href=data.lastVod.url;archiveLink.target='_blank';archiveLink.rel='noopener noreferrer';archiveLink.textContent='Latest archive · '+new Date(data.lastVod.start).toLocaleDateString();archiveLink.title=data.lastVod.title+' · '+Math.round((Date.parse(data.lastVod.end)-Date.parse(data.lastVod.start))/60000)+' minutes';streamInfo.append(' · ',archiveLink);}
    streamInfo.title = data.errors.length ? `Some metadata unavailable: ${data.errors.join(', ')}` : data.stream.title;
  }
  scheduleRender();
}, (channel) => {
  if (channel === channels[0]) streamInfo.title = 'Stream metadata unavailable; chat continues';
});
metadataClient.start();
const recovery = new ChatRecovery(channels[0]!, message=>{if(store.add(message)){archive.add(message);scheduleRender();}});
const connection = new ChatConnection(channels, (event) => {
  if (event.type === 'status') {
    rateTimeline.series.status(event);recovery.status(event);
    status.textContent = event.detail || event.state;
    status.dataset.state = event.state;
    return;
  }
  if (!store.add(event.message)) return;
  archive.add(event.message);
  observe(event.message, !event.replay); refreshCandidates(); picker.refresh();
  if (!event.replay && event.message.command === 'PRIVMSG') {
    const visibility = messageVisibility(event.message, display.options, selfLogin);
    attention.mention(event.message, visibility.highlight && !visibility.blocked && !visibility.hiddenUser, event.replay);
    if (!visibility.blocked && !visibility.hiddenUser) announcer.textContent = `${event.message.login}: ${event.message.text}`;
  }
  scheduleRender();
});
connection.start();

log.addEventListener('scroll', (event) => {
  if(virtualLog.hoverPaused(event.target))return;
  if (archiveView) { follow = false; latest.hidden = false; return; }
  follow = virtualLog.isAtLive(event.target);
  latest.hidden = follow;
},{capture:true});
latest.addEventListener('click', () => { archiveGeneration++; archiveView = undefined; follow = true; render(); log.scrollTop = display.options.rev?0:log.scrollHeight; latest.hidden = true; });
form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const next = parseChannels(input.value);
    const url = new URL(location.href);
    url.searchParams.set('channel', next.join(','));
    location.assign(url);
  } catch (error) { status.textContent = error instanceof Error ? error.message : 'Invalid channels'; }
});
theme.addEventListener('click', () => {
  display.toggleTone();
  const next = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  theme.setAttribute('aria-label', `Switch to ${next === 'dark' ? 'light' : 'dark'} theme`);
  visualRevision++;
  picker.refresh(true);
  scheduleRender();
});
animation.addEventListener('click', () => {
  frozen = !frozen;
  animation.setAttribute('aria-pressed', String(frozen));
  try { localStorage.setItem('chatthing:v1:frozen', frozen ? '1' : '0'); } catch { /* optional storage */ }
  visualRevision++;
  scheduleRender();
});
setInterval(() => store.save(), 15000);
document.addEventListener('visibilitychange', () => { if (document.hidden) store.save(); });
window.addEventListener('pagehide', () => { store.save(); hydrationAbort.abort(); identityCards.stop(); pronouns.stop(); rail?.stop(); logKeyboard.stop(); virtualLog.stop(); connection.stop(); metadataClient.stop(); stopAuth(); personalChat.stop(); whispers.stop(); clearInterval(personalTimer); accountEmotes.stop(); composer.stop(); navigation.stop(); pickerLighting.stop();document.removeEventListener('share-settings',sharePicker);picker.stop(); archiveSearch.stop(); archive.stop(); statsPanel.stop();rateTimeline.stop(); display.stop(); attention.stop(); resources.stop(); inspector.stop(); tabSync.stop(); videoPanel.stop(); stopLifecycle(); linkPreview.stop();socialCards.stop(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
