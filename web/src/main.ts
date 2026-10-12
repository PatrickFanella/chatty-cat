import {DiscoveryPanel} from './discovery';
import {PresentationPanel} from './presentation-ui';
import {getPresentation} from './presentation';
import {LocalTargets,dispatchLocal,LOCAL_COMMANDS} from './local-commands';
import {privacyEnabled} from './privacy';
import {RulePanel} from './rules-ui';
import {SimilarMessages} from './similar';
import {loadCapacity} from './capacity';
import {RowCache} from './row-cache';
import {reconcileSplits} from './splits';
import {HotkeyPanel} from './hotkeys-ui';
import {ACTIONS,type ActionID} from './hotkeys';
import {FONT_SIZES} from './display-data';
import { InboxPanel } from './inbox-ui';
import { CommandPanel } from './commands-ui';
import { PrivacyControls } from './privacy-ui';
import { WorkspaceStore, type ReaderPosition, type WorkspaceSnapshot } from './workspaces';
import { WorkspacePanel } from './workspaces-ui';
import { captureBundle, restoreBundle } from './settings-bundle';
import { NitterLinks } from './nitter';
import { GiphyTitles } from './giphy';
import { ErrorReport } from './error-report';
import { ChannelControls } from './channels';
import { StreamHistory } from './stream-history';
import {StatsLedger} from './stats-ledger';
import {SocialCards} from './social-cards';
import { RateTimeline } from './rate-timeline';
import { linkFingerprint } from './links';
import { PickerLighting } from './picker-lighting';
import { IdentityCards } from './identity-cards';
import { Pronouns } from './pronouns';
import { PanelRail } from './rail';
import { ChatRecovery } from './recovery';
import { PageCoverage } from './page-coverage';
import { LogKeyboard } from './log-keyboard';
import { Whispers } from './whispers';
import { PersonalChat, PersonalState } from './personal';
import { UserInspector } from './inspector';
import { Resources } from './resources';
import { SplitLog } from './split-log';
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
import { HistoryFiles } from './history-import';
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
import { parseWorkspaceChannels, type ChatMessage } from './protocol';
import { messageRow,decoratePresentation } from './render';
import { MessageStore } from './store';
import { MetadataClient, type ChannelMetadata } from './metadata';

function element<T extends HTMLElement>(id: string, constructor: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof constructor)) throw new Error(`Missing UI element: ${id}`);
  return found;
}

const capacity=await loadCapacity();
const localTargets=new LocalTargets();
const liveObserved=new WeakSet<ChatMessage>();
const localCleared=new Map<string,number>();
const errorReport = new ErrorReport(document.body);
const stopLifecycle = mountLifecycle(element('offline', HTMLElement), element('app-update', HTMLButtonElement));
// Each built bundle gets its matching archive, bypassing stale edge copies.
element('source-download', HTMLAnchorElement).href = '/source.tar.gz?build=' + encodeURIComponent(new URL(import.meta.url).pathname);
const overlay=new URL(location.href).searchParams.has('overlay')&&new URL(location.href).searchParams.get('overlay')!=='0';
document.documentElement.dataset.overlay=String(overlay);
const log = element('log', HTMLElement);
let rail:PanelRail|undefined;
let inboxPanel:InboxPanel|undefined;
let rulePanel:RulePanel|undefined;
let inboxGeneration=0;
let syncSources:(()=>void)|undefined;
const pronouns = new Pronouns();
const socialCards=new SocialCards(log);
const nitterLinks=new NitterLinks(log);
const giphyTitles=new GiphyTitles(log);
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
const rowsByMessage = new RowCache();
let visualRevision = 0;
let frozen = false;
let borrowedFreeze=false;
try { frozen = localStorage.getItem('chatthing:v1:frozen') === '1'; } catch { /* optional storage */ }
animation.setAttribute('aria-pressed', String(frozen));
const workspaceStore=new WorkspaceStore();
const workspaceQuery=new URL(location.href).searchParams;
const ephemeralPopout=workspaceQuery.get('popout')==='1';
const bootWorkspace=ephemeralPopout?undefined:(workspaceStore.get(workspaceQuery.get('workspace')??'')??workspaceStore.active);
let currentWorkspaceID=bootWorkspace?.id??'';
let pendingReaders:ReaderPosition[]|undefined=bootWorkspace?.readers.length?bootWorkspace.readers:undefined;
let historyReady=false;
let workspaceFocus=bootWorkspace?.focus??'log';
let channels: string[];
let channelNotice='';
try { channels = workspaceQuery.has('workspace')&&bootWorkspace ? bootWorkspace.channels : workspaceQuery.has('channel') ? parseWorkspaceChannels(workspaceQuery.get('channel')!) : bootWorkspace?.channels??['hasanabi']; }
catch { channels = bootWorkspace?.channels??['hasanabi'];channelNotice='Invalid channel list. Use one to '+capacity.workspaceChannels+' Twitch channel names.'; }
if(bootWorkspace?.settings.extras.splits&&bootWorkspace.channels.join(',')!==channels.join(',')){
 const mapped=reconcileSplits(bootWorkspace.settings.extras.splits,channels,bootWorkspace.channels);
 if(mapped)bootWorkspace.settings.extras.splits=mapped;
 else{channels=[...bootWorkspace.channels];channelNotice='The saved layout has no room for that channel change. Close a pane or tab before retrying.';const url=new URL(location.href);url.searchParams.set('channel',channels.join(','));history.replaceState(null,'',url);}
}
const capacityNotice=document.createElement('span');capacityNotice.className='capacity-notice';capacityNotice.setAttribute('role','status');element('joined-channels',HTMLElement).append(capacityNotice);capacityNotice.textContent=channelNotice;
input.value = channels.join(',');
const capacityRefused=channels.length>capacity.workspaceChannels;
if(capacityRefused){capacityNotice.textContent=status.textContent=announcer.textContent='This workspace has '+channels.length+' channels; the server allows '+capacity.workspaceChannels+'. Edit Channels to continue.';status.dataset.state='reconnecting';}
const store = new MessageStore(channels);
const rateTimeline=new RateTimeline(element('rate',HTMLElement),channels);
const videoPanel = new VideoPanel(element('video-panel', HTMLElement), element('video-open', HTMLButtonElement), channels);
rail=new PanelRail(log,[{name:'video',root:element('video-panel',HTMLElement),show:open=>videoPanel.showRail(open),float:()=>videoPanel.float(),isOpen:()=>!element('video-panel',HTMLElement).hidden},{name:'emotes',root:element('emote-picker',HTMLElement),show:open=>picker.showRail(open),isOpen:()=>!element('emote-picker',HTMLElement).hidden},{name:'stats',root:element('stats-panel',HTMLDialogElement),show:open=>statsPanel.showRail(open),float:()=>statsPanel.float(),isOpen:()=>element('stats-panel',HTMLDialogElement).open}]);
window.addEventListener('resize',scheduleRender);
const statsLedger=new StatsLedger(channels,channel=>metadata.get(channel)?.emotes??{});statsLedger.bootstrap(store.messages);
const streamHistory = new StreamHistory(channels);
const statsPanel = new StatsPanel(element('stats-panel', HTMLDialogElement), element('stats-open', HTMLButtonElement), element('rate', HTMLElement), () => store.messages, channel => metadata.get(channel)?.emotes ?? {}, channels,rateTimeline.series,statsLedger,channel=>metadata.get(channel)?.emoteUse??{},streamHistory,channel=>metadata.get(channel)?.badges??{});
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
const panePopout=workspaceQuery.get('pane')??'';
const virtualLog = new SplitLog(log,element('splits-open',HTMLButtonElement),channels,{
 rules:()=>rulePanel?.engine.rules.filter(r=>r.scope==='pane')??[],canChange:()=>!composer.sending,target:channel=>composer.setTarget(channel),changed:()=>{if(overlay)virtualLog.layout.enable(false);else if(virtualLog.layout.enabled){follow=true;pendingReaders=undefined;}syncSources?.();scheduleRender();},popout:pane=>{
  if(composer.sending){announcer.textContent='Wait for the current send outcome before opening a pane';return;}
  try{saveWorkspace();const url=new URL(location.href);url.search='';url.searchParams.set('workspace',currentWorkspaceID);url.searchParams.set('channel',channels.join(','));url.searchParams.set('pane',pane);url.searchParams.set('video','off');const opened=window.open(url.href,'_blank','popup,width=600,height=850');if(!opened)announcer.textContent='Allow popups to open this pane';}catch(error){announcer.textContent=error instanceof Error?error.message:'Could not save the pane';}
 }
},panePopout);
if(overlay)element('splits-open',HTMLButtonElement).hidden=true;
const pickerModel = new PickerModel();
const picker = new EmotePicker(element('emote-picker', HTMLElement), element('picker-open', HTMLButtonElement), pickerModel, () => composer.target, () => composer.canInsert, (code) => composer.insert(code), on=>{borrowedFreeze=on;document.documentElement.dataset.holdFreeze=String(on);visualRevision++;scheduleRender();},()=>rateTimeline.series.observationGaps());
let discoveryPanel:DiscoveryPanel|undefined;
let accountAuth: AuthStatus | undefined;
const sharePicker=(event:Event):void=>{if(event instanceof CustomEvent&&event.detail instanceof URL)picker.share(event.detail);};document.addEventListener('share-settings',sharePicker);
const pickerLighting=new PickerLighting(log,element('emote-picker',HTMLElement));
const accountEmotes = new AccountEmotes(emotes => { pickerModel.setAccount(emotes); refreshCandidates(); picker.refresh(true); }, element('account-emotes', HTMLElement));
let selfLogin = '';
function acceptEcho(message: ChatMessage): void { if (!channels.includes(message.channel) || !store.add(message)) return; archive.add(message); observe(message, true,true); scheduleRender(); }
const tabSync = new TabSync(acceptEcho);
const logKeyboard = new LogKeyboard(log,virtualLog,composer,()=>{if(!virtualLog.layout.enabled)follow=false;latest.hidden=false;},()=>latest.click());
const whispers = new Whispers(element('whisper-panel', HTMLElement), element('whisper-open', HTMLButtonElement), login => {localTargets.whisper(login);composer.prepareWhisper(login);}, message => attention.whisper(message),(message,outgoing)=>{localTargets.whisper(message.login);inboxPanel?.whisper(message,outgoing);});
const personalChat = new PersonalChat(channels, event => { if (event.type === 'message') { personalState.observe(event.message); if (event.message.command === 'ROOMSTATE') roomStates.observe(event.message); renderRoom(); } }, element('personal-status', HTMLElement), login => { personalState.reset(login); renderRoom(); });
const personalTimer = setInterval(renderRoom, 1000);
const stopAuth = mountAuth(element('login', HTMLButtonElement), element('account', HTMLElement), (auth) => { localTargets.account(auth?.authenticated?auth.userID??auth.login??'':'');accountAuth = auth;discoveryPanel?.setAuth(auth);if(inboxPanel?.setAccount(auth?.authenticated?auth.userID??'':'',auth?.authenticated?auth.login??'':''))void replayInbox(); whispers.update(auth); personalChat.update(auth); accountEmotes.update(auth, composer.target); const oldLogin = selfLogin; selfLogin = auth?.authenticated ? auth.login ?? '' : ''; if (oldLogin !== selfLogin){if(rulePanel)rulePanel.similarity=new SimilarMessages(rulePanel.similarity.options);visualRevision++;scheduleRender();} const wasEnabled = composer.canInsert; composer.setAuth(auth); picker.refresh(wasEnabled !== composer.canInsert); });
log.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const id = event.target.closest<HTMLButtonElement>('button[data-reply]')?.dataset.reply;
  const channel = event.target.closest<HTMLElement>('.row')?.dataset.channel;
  const message = viewMessages().find((message) => message.id === id && message.channel === channel);
  if (message){localTargets.reply(message);composer.selectReply(message);}
});
let renderQueued = false;
let follow = !pendingReaders;
let archiveView: ChatMessage[] | undefined;
let paneArchive:ChatMessage[]|undefined;
const paneArchiveMessages=new Map<string,ChatMessage>();
function viewMessages():readonly ChatMessage[]{return virtualLog.layout.enabled?[...store.messages,...paneArchiveMessages.values()]:archiveView??store.messages;}
let archiveGeneration = 0;
element('composer', HTMLFormElement).addEventListener('composerresize', () => { if (follow) log.scrollTop = display.options.rev?0:log.scrollHeight; });
const linkedLookups = new Set<string>();
const missingLinks = new Map<string, number>();
const navigation = new MessageNavigation(log, () => { if(!virtualLog.layout.enabled)follow = false; latest.hidden = false; }, id => {
  const message = viewMessages().find(item => item.id === id);
  if (message) virtualLog.reveal(messageKey(message));
  if (archiveView && message || linkedLookups.has(id) || !message && Date.now() - (missingLinks.get(id) ?? 0) < 5000) return;
  linkedLookups.add(id);
  const generation = archiveGeneration;
  void (message ? Promise.resolve(message) : archive.get(id, channels)).then(found => {
    if (found && generation === archiveGeneration && new URL(location.href).searchParams.get('mid') === id) return showArchived(found);
    if (!found) { missingLinks.set(id, Date.now()); if (missingLinks.size > 100) missingLinks.delete(missingLinks.keys().next().value!); }
  }).catch(() => { missingLinks.set(id, Date.now()); }).finally(() => { linkedLookups.delete(id); });
});
async function showArchived(message: ChatMessage): Promise<void> {
  const generation = ++archiveGeneration;
  try {
    const context = await archive.search({ text: '', channel: message.channel, before: message.timestamp + 30000, after: Math.max(0, message.timestamp - 30000), limit: 500 });
    if (generation !== archiveGeneration) return;
    if (!context.some(item => item.id === message.id && item.channel === message.channel)) context.push(message);
    archiveView = context.sort((a, b) => a.timestamp - b.timestamp); if(!virtualLog.layout.enabled)follow = false;
    const url = new URL(location.href); if (message.id) url.searchParams.set('mid', message.id); history.pushState(null, '', url);
    render(); window.dispatchEvent(new PopStateEvent('popstate'));
  } catch { element('archive-status', HTMLElement).textContent = 'Archived context unavailable'; }
}
const channelControls = new ChannelControls(element('joined-channels', HTMLElement), element('composer', HTMLFormElement), element('send-channel', HTMLSelectElement), channels,capacity.workspaceChannels);
window.addEventListener('pagehide', () => channelControls.stop());
const archiveSearch = new ArchiveSearch(element('archive-search', HTMLDialogElement), element('archive-open', HTMLButtonElement), archive, channels, (message) => { void showArchived(message); });
const historyFiles = new HistoryFiles(element('archive-search', HTMLDialogElement), () => channels[0]!, () => store.messages, async messages => {
  for (let index = 0; index < messages.length; index += 500) {
    for (const message of messages.slice(index, index + 500)) { archive.add(message); statsLedger.observe(message,message.timestamp); }
    await archive.flush();
  }
  store.restore(messages.filter(message => channels.includes(message.channel))); store.save(); statsLedger.save(); scheduleRender();
});
window.addEventListener('pagehide', () => historyFiles.stop());
const names = new Map<string, Map<string, true>>();
const nativeCodes = new Map<string, Set<string>>();
function ruleIDsFor(message:ChatMessage):string[]{return virtualLog.layout.enabled?virtualLog.layout.tabs.flatMap(t=>t.panes.filter(p=>p.channels.includes(message.channel)).flatMap(p=>p.rules??[])):[];}
function observe(message: ChatMessage, live = false, countStats=false): void {
  if(live){liveObserved.add(message);if(getPresentation().pulseSelf&&message.login.toLowerCase()===selfLogin){const form=element('composer',HTMLFormElement);form.classList.remove('composer-pulse');void form.offsetWidth;form.classList.add('composer-pulse');}}
  if(live&&message.command==='PRIVMSG')virtualLog.observe(message.channel,message.text,messageKey(message));
  const decision=rulePanel?.engine.observe(message,ruleIDsFor(message));const similar=rulePanel?.similarity.classify(message,selfLogin)??false;
  if(!decision?.hidden)inboxPanel?.observe(message,!!decision?.inbox&&(!similar||!!rulePanel?.similarity.options.highlightSimilar));
  if(countStats)statsLedger.observe(message);else {statsLedger.attach(message);statsLedger.reconcile(message.channel);}
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
element('send-channel', HTMLSelectElement).addEventListener('change', () => { virtualLog.updateTarget(composer.target);accountEmotes.update(accountAuth, composer.target); picker.refresh(true); });
log.addEventListener('click', () => { accountEmotes.update(accountAuth, composer.target); picker.refresh(); });


function messageKey(message: ChatMessage): string { return message.channel + ':' + (message.id || [message.command, message.timestamp, message.login, message.text, message.tags['system-msg'] ?? ''].join(':')); }
function render(): void {
  renderQueued = false;
  rail?.set(overlay?1:display.options.split);
  document.documentElement.style.setProperty('--composer-bottom',element('composer',HTMLFormElement).getBoundingClientRect().bottom+'px');
  store.setCap(display.options.scrollback);
  const messages = overlay?(archiveView??store.messages).filter(message=>channels.slice(0,6).includes(message.channel)):virtualLog.layout.enabled?store.messages:archiveView ?? store.messages;
  const makeItems=(messages:readonly ChatMessage[],isArchive=false):LogItem[]=>{
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
     if(!isArchive&&message.timestamp<=(localCleared.get(message.channel)??-1))continue;
     if (['ROOMSTATE', 'USERSTATE', 'GLOBALUSERSTATE'].includes(message.command)) continue;
     const visibility = messageVisibility(message, display.options, selfLogin);const rule=rulePanel?.engine.evaluate(message),similar=rulePanel?.similarity.classify(message,selfLogin)??false;
     if(rule?.hidden||similar&&rulePanel?.similarity.options.behavior==='hide')continue;
     if (visibility.blocked || (visibility.hiddenUser && display.options.hideMode === 'vanish')) continue;
     if(display.options.links){let fingerprint=fingerprints.get(message);if(fingerprint===undefined){fingerprint=linkFingerprint(message.text);fingerprints.set(message,fingerprint);}if(!fingerprint||seenLinks.has(fingerprint))continue;if(seenLinks.size>=20000)seenLinks.clear();seenLinks.add(fingerprint);}
     const key = messageKey(message);const removed = message.command === 'PRIVMSG' && (deleted.has(key) || message.timestamp <= (cleared.get(message.channel + ':') ?? -1) || message.timestamp <= (cleared.get(message.channel + ':' + message.login.toLowerCase()) ?? -1));const p=getPresentation();if(p.hideModerated&&removed||p.hideModerationActions&&message.command==='CLEARCHAT'||p.hideDeletionActions&&message.command==='CLEARMSG')continue;
     if (visibility.hiddenUser && display.options.hideMode === 'stub') {
       items.push({ key, channel:message.channel,text:message.text, render: () => { const row = document.createElement('article'); row.className = 'row notice'; row.dataset.id = message.id; row.dataset.channel = message.channel; row.textContent = message.login + ': hidden message'; return row; } }); continue;
     }
     items.push({ key, channel:message.channel,text:message.text, highlight:scope=>(visibility.highlight||!!rulePanel?.engine.evaluate(message,virtualLog.ruleIDs(scope)).highlight)&&(!similar||!!rulePanel?.similarity.options.highlightSimilar),visible:ids=>!rulePanel?.engine.evaluate(message,ids).hidden,render: (scope="default") => {
       const row=rowsByMessage.get(message,scope,visualRevision*2+(removed?1:0),()=>{const row=messageRow(message,metadata.get(message.channel),frozen||borrowedFreeze||getPresentation().animateOnlyFocused&&!document.hasFocus());decoratePresentation(row,message,removed,!liveObserved.has(message));return row;});
       const decision=rulePanel?.engine.evaluate(message,virtualLog.ruleIDs(scope));const highlight=(visibility.highlight||!!decision?.highlight)&&(!similar||!!rulePanel?.similarity.options.highlightSimilar);row.classList.toggle('keyword-match',highlight);row.classList.toggle('similar-message',similar);if(decision?.color&&highlight)row.style.setProperty('--rule-color',decision.color);else row.style.removeProperty('--rule-color'); row.classList.toggle('user-ghost', visibility.hiddenUser);
       row.classList.toggle('history-message',!liveObserved.has(message));row.classList.toggle('removed', removed); return row;
     } });
   }
    return items;
  };
  const items=makeItems(messages,!!archiveView&&!virtualLog.layout.enabled);
  if(virtualLog.layout.enabled&&archiveView&&archiveView!==paneArchive){paneArchive=archiveView;for(const message of archiveView)paneArchiveMessages.set(messageKey(message),message);const context=makeItems(archiveView,true);virtualLog.showContext(display.options.rev?context.reverse():context,archiveView.map(messageKey));}
  virtualLog.refreshContexts(keys=>{const messages=keys.map(key=>paneArchiveMessages.get(key)).filter((message):message is ChatMessage=>!!message);const context=makeItems(messages,true);return display.options.rev?context.reverse():context;});
  virtualLog.set(display.options.rev?items.reverse():items, follow, visualRevision, display.options.rev, overlay?1:display.options.split,display.options.pause);
  if(paneArchiveMessages.size){const keys=virtualLog.contextKeys();for(const key of paneArchiveMessages.keys())if(!keys.has(key))paneArchiveMessages.delete(key);}
  count.textContent = virtualLog.layout.enabled ? `${store.messages.length.toLocaleString()} messages${virtualLog.hasContexts()?' · Pane history open':''}` : archiveView ? `${archiveView.length} archived messages · Jump to live to return` : `${store.messages.length.toLocaleString()} messages`;
  latest.hidden = follow && virtualLog.allFollowing();
  if(pendingReaders){const restored=virtualLog.restoreReaders(pendingReaders);if(restored||historyReady){if(!restored)announcer.textContent='Some saved reader positions are no longer in retained history';pendingReaders=undefined;}}
  if(historyReady)virtualLog.finishReaderRestore();
  navigation.reveal();
}

const displaySearch=document.createElement('input');displaySearch.type='search';displaySearch.placeholder='Search display settings';displaySearch.setAttribute('aria-label','Search display settings');element('display-panel',HTMLDialogElement).prepend(displaySearch);displaySearch.addEventListener('input',()=>{for(const label of element('display-panel',HTMLDialogElement).querySelectorAll<HTMLLabelElement>('label'))label.hidden=!label.textContent?.toLowerCase().includes(displaySearch.value.toLowerCase());});
const display = new DisplaySettings(element('display-panel', HTMLDialogElement), element('display-open', HTMLButtonElement), () => { visualRevision++; picker.refresh(true); scheduleRender(); });
let hydratedCap = 0;
let hydrationAbort = new AbortController();
function hydrateHistory(): void {
  const cap = display.options.scrollback; if (cap === hydratedCap) return; hydratedCap = cap;
  hydrationAbort.abort(); hydrationAbort = new AbortController(); const signal = hydrationAbort.signal;
  void archive.recent(channels, cap, signal).then(async messages => {
    if (signal.aborted) return; store.setCap(display.options.scrollback); store.restore(messages);
    for(let index=0;index<messages.length;index+=500){
      if(signal.aborted)return;
      for(const message of messages.slice(index,index+500))observe(message,false);
      if(messages.length>500)await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    if(signal.aborted)return;historyReady=true;refreshCandidates(); picker.refresh(); scheduleRender();
  }).catch(() => { if (!signal.aborted) {historyReady=true;element('archive-status', HTMLElement).textContent = 'Saved history unavailable; live chat continues';scheduleRender();} });
}
hydrateHistory();
element('display-panel', HTMLDialogElement).addEventListener('change', hydrateHistory);
window.addEventListener('storage', event => { if (event.key === 'chatthing:v1:display') hydrateHistory(); });

const attention = new Attention(element('missed-mentions', HTMLButtonElement), () => display.options, (id, channel) => {
  const message = store.messages.find(item => item.id === id && item.channel === channel);
  if (message) void showArchived(message); else void archive.get(id, [channel]).then(found => { if (found) void showArchived(found); }).catch(() => {});
});
element('display-panel', HTMLDialogElement).addEventListener('change', event => { if (event.target instanceof HTMLInputElement && event.target.name === 'notify' && event.target.checked) void attention.permission(); });

element('alert-test',HTMLButtonElement).addEventListener('click',()=>{void attention.test().then(result=>{element('alert-test-status',HTMLElement).textContent=result;});});
const inspector = new UserInspector(element('user-inspector', HTMLDialogElement), log, viewMessages, () => accountAuth, message => {localTargets.reply(message);composer.selectReply(message);}, login=>display.options.pn?pronouns.get(login).then(label=>display.options.pn?label:undefined):Promise.resolve(undefined));
const identityCards=new IdentityCards(document.body,element('identity-preview',HTMLElement),()=>store.messages,login=>display.options.pn?pronouns.get(login).then(label=>display.options.pn?label:undefined):Promise.resolve(undefined));
const resources = new Resources(element('resources-panel', HTMLElement), element('resources-open', HTMLButtonElement), name => document.getElementById(name)?.click());
function zoomChat(delta:number):void{const index=FONT_SIZES.indexOf(display.options.size),size=FONT_SIZES[Math.max(0,Math.min(FONT_SIZES.length-1,index+delta))];if(size)display.setOptions({...display.options,size});}
const presentationPanel=new PresentationPanel(()=>{visualRevision++;scheduleRender();renderRoom();const data=metadata.get(channels[0]!);if(data)paintStreamInfo(data);});
rulePanel=new RulePanel(()=>{visualRevision++;scheduleRender();});
function channelStep(delta:number):void{const index=channels.indexOf(composer.target);virtualLog.focusChannel(channels[(index+delta+channels.length)%channels.length]!);}
const hotkeyActions={
 palette:()=>element('actions-open',HTMLButtonElement).click(),shortcuts:()=>element('hotkeys-open',HTMLButtonElement).click(),
 compose:()=>composer.focusTyping(''),workspace:()=>{if(panePopout)throw new Error('Manage workspaces in the main view');element('workspace-open',HTMLButtonElement).click();},
 'channel-next':()=>channelStep(1),'channel-prev':()=>channelStep(-1),
 'pane-next':()=>virtualLog.moveFocus('pane',1),'pane-prev':()=>virtualLog.moveFocus('pane',-1),
 'tab-next':()=>virtualLog.moveFocus('tab',1),'tab-prev':()=>virtualLog.moveFocus('tab',-1),
 'pane-right':()=>virtualLog.rearrange('pane',1),'pane-left':()=>virtualLog.rearrange('pane',-1),
 'tab-right':()=>virtualLog.rearrange('tab',1),'tab-left':()=>virtualLog.rearrange('tab',-1),
 reconnect:()=>connection.reconnect(),'zoom-in':()=>zoomChat(1),'zoom-out':()=>zoomChat(-1),
 pause:()=>{if(virtualLog.layout.enabled)virtualLog.hold();else follow=false;latest.hidden=false;},live:()=>latest.click(),
 history:()=>element('archive-open',HTMLButtonElement).click(),emotes:()=>element('picker-open',HTMLButtonElement).click(),video:()=>element('video-open',HTMLButtonElement).click(),stats:()=>element('stats-open',HTMLButtonElement).click(),settings:()=>element('display-open',HTMLButtonElement).click(),inbox:()=>inboxPanel?.show(),commands:()=>commandPanel.openPanel(),
} satisfies Record<ActionID,()=>void>;
const hotkeys=new HotkeyPanel(element('actions-open',HTMLButtonElement),element('hotkeys-open',HTMLButtonElement),id=>hotkeyActions[id](),()=>[
 ...(panePopout?virtualLog.layout.activePane.channels:channels).map(channel=>({id:'channel:'+channel,label:'Send channel: '+channel,context:'chat',run:()=>virtualLog.focusChannel(channel)})),
 ...(panePopout?[]:workspaceStore.all()).map(workspace=>({id:'workspace:'+workspace.id,label:'Workspace: '+workspace.name,context:'workspace preview',run:()=>workspacePanel.previewSwitch(workspace.id)})),
 ...virtualLog.layout.enabled?virtualLog.layout.tabs.flatMap(tab=>[{id:'tab:'+tab.id,label:'Tab: '+tab.name,context:'chat',run:()=>virtualLog.selectTab(tab.id)},...tab.panes.map((pane,index)=>({id:'pane:'+pane.id,label:'Pane: '+tab.name+' / '+(index+1)+' '+pane.channels.join(', '),context:'chat',run:()=>{virtualLog.selectTab(tab.id);virtualLog.selectPane(pane.id);}}))]):[],
],id=>ACTIONS.find(action=>action.id===id)?.context!=='splits'||virtualLog.layout.enabled);
virtualLog.manageKeyboard();

if(bootWorkspace){display.setOptions(panePopout?{...bootWorkspace.settings.display,split:1}:bootWorkspace.settings.display);render();restoreBundle(bootWorkspace.settings);hydrateHistory();composer.setTarget(panePopout&&virtualLog.layout.enabled?virtualLog.layout.activePane.target:bootWorkspace.target);}
if(['off','0'].includes(workspaceQuery.get('video')??''))videoPanel.showRail(false);
function captureWorkspace():WorkspaceSnapshot{return {channels:[...channels],target:composer.target,focus:workspaceFocus,settings:captureBundle(display.options),readers:virtualLog.readerPositions()};}
function saveWorkspace():void {if(composer.sending)throw new Error('Wait for the current send outcome before switching workspaces');if(currentWorkspaceID&&!panePopout&&!overlay&&!ephemeralPopout&&!capacityRefused)workspaceStore.update(currentWorkspaceID,captureWorkspace());}
if(!currentWorkspaceID&&!workspaceStore.error&&!ephemeralPopout){try{const initial=workspaceStore.create('Watching',captureWorkspace());workspaceStore.activate(initial.id);currentWorkspaceID=initial.id;}catch(error){announcer.textContent=error instanceof Error?error.message:'Workspace storage unavailable';}}
const workspacePanel=new WorkspacePanel(element('workspace-panel',HTMLDialogElement),element('workspace-open',HTMLButtonElement),workspaceStore,()=>currentWorkspaceID,captureWorkspace,saveWorkspace,workspace=>{
 if(composer.sending)throw new Error('Wait for the current send outcome before switching workspaces');
 const url=new URL(location.href);url.search='';url.searchParams.set('workspace',workspace.id);url.searchParams.set('channel',workspace.channels.join(','));if(overlay)url.searchParams.set('overlay','1');location.assign(url.href);
},!!panePopout||ephemeralPopout);
async function replayInbox():Promise<void>{
 const generation=++inboxGeneration,panel=inboxPanel;if(!panel||!accountAuth?.authenticated)return;const messages=[...store.messages],login=accountAuth.login?.toLowerCase();
 for(const own of [true,false])for(let index=0;index<messages.length;index+=500){if(generation!==inboxGeneration)return;for(const message of messages.slice(index,index+500))if((message.login.toLowerCase()===login)===own){const rule=rulePanel?.engine.evaluate(message,ruleIDsFor(message));if(!rule?.hidden)panel.observe(message,!!rule?.inbox);}if(messages.length>500)await new Promise<void>(resolve=>setTimeout(resolve,0));}
}
inboxPanel=new InboxPanel(channels,message=>{void showArchived(message);},login=>composer.prepareWhisper(login));
if(accountAuth?.authenticated){inboxPanel.setAccount(accountAuth.userID??'',accountAuth.login??'');void replayInbox();}
const commandPanel=new CommandPanel(composer,()=>{
 const selected=inspector.selectedMessage,channel=selected?.channel??composer.target;
 const room=selected?.tags['room-id']??[...store.messages].reverse().find(message=>message.channel===channel&&message.tags['room-id'])?.tags['room-id']??'';
 return {channel:{name:channel,id:room,title:metadata.get(channel)?.stream.title??'',game:''},account:{name:accountAuth?.login??'',id:accountAuth?.userID??''},message:selected?{name:selected.login,id:selected.id,text:selected.text.replace(/^\x01ACTION (.*)\x01$/s,'$1')}:undefined,input:composer.draft};
},element('user-inspector',HTMLDialogElement));
const privacyControls=new PrivacyControls(workspaceStore,()=>currentWorkspaceID);
const rememberFocus=(event:FocusEvent):void=>{if(event.target instanceof HTMLElement&&['log','message','picker-open','archive-open','display-open','video-open'].includes(event.target.id))workspaceFocus=event.target.id;};
document.addEventListener('focusin',rememberFocus);
window.addEventListener('pagehide',()=>{try{saveWorkspace();}catch{/* status is reported before an intentional switch; pagehide cannot prevent navigation */}hotkeys.stop();workspacePanel.stop();inboxGeneration++;inboxPanel?.stop();rulePanel?.stop();presentationPanel.stop();commandPanel.stop();privacyControls.stop();document.removeEventListener('focusin',rememberFocus);});
if(bootWorkspace)requestAnimationFrame(()=>{document.getElementById(bootWorkspace.focus)?.focus({preventScroll:true});});
render();
function scheduleRender(): void {
  if (!renderQueued) { renderQueued = true; requestAnimationFrame(render); }
}
function paintStreamInfo(data:ChannelMetadata):void{const p=getPresentation();
    streamInfo.textContent = [p.headerUptime?data.stream.uptime:'',p.headerViewers&&/^\d+$/.test(data.stream.viewers) ? `${Number(data.stream.viewers).toLocaleString()} viewers` : '',p.headerTitle?data.stream.title:''].filter(Boolean).join(' · ');
    if(data.lastVod){const archiveLink=document.createElement('a');archiveLink.href=data.lastVod.url;archiveLink.target='_blank';archiveLink.rel='noopener noreferrer';archiveLink.textContent='Latest archive · '+new Date(data.lastVod.start).toLocaleDateString();archiveLink.title=data.lastVod.title+' · '+new Date(data.lastVod.start).toLocaleString()+' → '+new Date(data.lastVod.end).toLocaleString()+' · '+Math.round((Date.parse(data.lastVod.end)-Date.parse(data.lastVod.start))/60000)+' minutes';streamInfo.append(' · ',archiveLink);}
    streamInfo.title = data.errors.length ? `Some metadata unavailable: ${data.errors.join(', ')}` : data.stream.title;
  }
const metadataClient = new MetadataClient(channels, (data) => {
  const previous = metadata.get(data.channel);
  if (JSON.stringify([previous?.emotes, previous?.badges]) !== JSON.stringify([data.emotes, data.badges])) visualRevision++;
  metadata.set(data.channel, data);statsLedger.reconcile(data.channel);streamHistory.observe(data);
  pickerModel.setSeeds(data.channel,data.emoteUse??{});pickerModel.setMetadata(data.channel, data.emotes); picker.refresh();
  refreshCandidates();
  if (data.stream.uptime && !data.errors.includes('stream uptime')) attention.stream(data.channel, !/offline|not streaming|not live|not online|not found/i.test(data.stream.uptime), data.stream.title);
  if(data.channel===channels[0])paintStreamInfo(data);
  scheduleRender();
}, (channel) => {
  if (channel === channels[0]) streamInfo.title = 'Stream metadata unavailable; chat continues';
});
metadataClient.start();
const recovery = new ChatRecovery(channels[0]!, message=>{if(store.add(message)){archive.add(message);scheduleRender();}},store.messages);
function liveSources():string[]{return capacityRefused?[]:overlay?channels.slice(0,6):virtualLog.sources();}
const pageCoverage = new PageCoverage(liveSources(), message=>{if(store.add(message)){archive.add(message);scheduleRender();}});
window.addEventListener('pagehide', () => pageCoverage.stop());
window.addEventListener('pagehide', () => { nitterLinks.stop(); giphyTitles.stop(); historyFiles.stop(); channelControls.stop(); streamHistory.save(); errorReport.stop(); });
const connection = new ChatConnection(liveSources(), (event) => {
  if (event.type === 'status') {
    rateTimeline.series.status(event);if(liveSources().includes(channels[0]!))recovery.status(event);
    pickerModel.connection(liveSources(), event.state); picker.refresh();
    status.textContent = event.detail || event.state;
    status.dataset.state = event.state;
    return;
  }
  if (!store.add(event.message)) return;
  archive.add(event.message);
  observe(event.message, !event.replay,true); refreshCandidates(); picker.refresh();
  if (!event.replay && event.message.command === 'PRIVMSG') {
    const visibility = messageVisibility(event.message, display.options, selfLogin);
    const ids=ruleIDsFor(event.message);const rule=rulePanel?.engine.observe(event.message,ids),similar=rulePanel?.similarity.classify(event.message,selfLogin)??false;const native=visibility.highlight;const allowed=!visibility.blocked&&!visibility.hiddenUser&&!rule?.hidden&&(!similar||!!rulePanel?.similarity.options.highlightSimilar);attention.mention(event.message,(native||!!rule?.highlight)&&allowed,event.replay,{sound:(native||!!rule?.sound)&&(!rulePanel||rulePanel.alertsAllowed()),notify:(native||!!rule?.notify)&&(!rulePanel||rulePanel.alertsAllowed())});rulePanel?.counts();
    if (allowed) announcer.textContent = `${event.message.login}: ${event.message.text}`;
  }
  scheduleRender();
});
syncSources=()=>{const sources=liveSources(),closed=channels.filter(channel=>!sources.includes(channel));pickerModel.connection(closed,'reconnecting');connection.setChannels(sources);personalChat.setChannels(sources);metadataClient.setChannels(sources);pageCoverage.setChannels(sources);};
syncSources();connection.start();
const usernameContext=(event:MouseEvent):void=>{if(privacyEnabled()||composer.sending||!(event.target instanceof Element))return;const name=event.target.closest<HTMLElement>('a.name,a.mention'),row=name?.closest<HTMLElement>('.row');if(!name||!row)return;const p=getPresentation(),modified=({shift:event.shiftKey,ctrl:event.ctrlKey,alt:event.altKey,meta:event.metaKey})[p.rightClickModifier as 'shift'|'ctrl'|'alt'|'meta'],action=modified?p.modifiedRightClick:p.rightClick;if(action==='ignore')return;event.preventDefault();if(!composer.canInsert){announcer.textContent='Log in to stage a mention or reply';return;}const message=viewMessages().find(m=>m.id===row.dataset.id&&m.channel===row.dataset.channel);if(!message)return;if(action==='reply'){localTargets.reply(message);composer.selectReply(message);}else composer.mention(name.dataset.mention||message.login,p.mentionAt,p.mentionComma);};log.addEventListener('contextmenu',usernameContext);window.addEventListener('pagehide',()=>log.removeEventListener('contextmenu',usernameContext));
const localHelp=document.createElement('dialog');localHelp.setAttribute('aria-label','Local command help');const heading=document.createElement('h2');heading.textContent='Local commands';const helpText=document.createElement('p');helpText.textContent=LOCAL_COMMANDS.join(' · ');const details=document.createElement('p');details.textContent='Context is the selected send channel. /reply stages the selected public thread. /r stages a private whisper to the last selected or observed whisper recipient; it never means a public reply. /whisper, /msg and .w are aliases that stage /w. Review staged messages and press Send separately. /requests opens the channel-points queue. /ignore only hides a user locally; /block changes Twitch blocking. Follow actions open Twitch. /clearmessages hides retained rows locally while preserving the archive. /disconnect pauses public, personal and whisper streams until /reconnect. Raw, debug and native commands are unavailable.';const closeHelp=document.createElement('button');closeHelp.type='button';closeHelp.textContent='Close';closeHelp.addEventListener('click',()=>localHelp.close());localHelp.append(heading,helpText,details,closeHelp);document.body.append(localHelp);
composer.configureLocal(text=>{if(privacyEnabled())throw new Error('Local commands are unavailable in privacy mode');return dispatchLocal(text,{channel:composer.target,uptime:metadata.get(composer.target)?.stream.uptime??'',targets:localTargets,
 open:url=>{const opened=window.open('about:blank','_blank');if(!opened)return false;opened.opener=null;opened.location.href=url;return true;},copy:async value=>{await navigator.clipboard.writeText(value);},
 clear:channel=>{localCleared.set(channel,store.messages.reduce((cutoff,m)=>m.channel===channel?Math.max(cutoff,m.timestamp):cutoff,Date.now()));visualRevision++;scheduleRender();},
 user:(login,channel)=>inspector.openUser(login,channel),ignore:(login,hide)=>{const names=display.options.hidden.split(/[\s,]+/).filter(Boolean).filter(name=>name.toLowerCase()!==login);if(hide)names.push(login);display.setOptions({...display.options,hidden:names.join(',')});},
 connection:connect=>{for(const stream of [connection,personalChat,whispers])if(connect)stream.reconnect();else stream.disconnect();},
 popout:channel=>{const url=new URL(location.href);url.search='';url.searchParams.set('channel',channel);url.searchParams.set('popout','1');url.searchParams.set('video','off');return !!window.open(url.href,'_blank','popup,width=600,height=850');},
 reply:(message,value)=>composer.stageReply(message,value),stage:value=>{if(!composer.canInsert)throw new Error('Log in to stage a whisper');composer.prepare(value);},help:()=>localHelp.showModal()});});
window.addEventListener('pagehide',()=>localHelp.remove());


log.addEventListener('scroll', (event) => {
  if(virtualLog.hoverPaused(event.target))return;
  if (archiveView&&!virtualLog.layout.enabled) { follow = false; latest.hidden = false; return; }
  follow = virtualLog.trackScroll(event.target,follow);
  latest.hidden = follow && !virtualLog.hasManualPause();
},{capture:true});
latest.addEventListener('click', () => { archiveGeneration++; archiveView = undefined; paneArchive=undefined; linkedLookups.clear(); const url = new URL(location.href); url.searchParams.delete('mid'); history.replaceState(null, '', url); window.dispatchEvent(new PopStateEvent('popstate')); follow = true; virtualLog.resume(); render(); log.scrollTop = display.options.rev?0:log.scrollHeight; latest.hidden = virtualLog.allFollowing(); });
discoveryPanel=new DiscoveryPanel(channels,login=>{if(panePopout||overlay)throw new Error('Join channels from the parent workspace');if(composer.sending)throw new Error('Wait for the current send outcome before joining a channel');const next=parseWorkspaceChannels([...channels,login].join(','),capacity.workspaceChannels);if(!reconcileSplits(virtualLog.layout.snapshot(),next,channels))throw new Error('Close a pane or tab before adding another channel');input.value=next.join(',');form.requestSubmit();});discoveryPanel.setAuth(accountAuth);window.addEventListener('pagehide',()=>discoveryPanel?.stop());
form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    if(composer.sending)throw new Error('Wait for the current send outcome before changing channels');
    const next = parseWorkspaceChannels(input.value,capacity.workspaceChannels);
    const url = new URL(location.href);
    url.searchParams.set('channel', next.join(','));url.searchParams.delete('workspace');url.searchParams.delete('mid');
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
document.addEventListener('visibilitychange', () => { if (document.hidden) {store.save();statsLedger.save();} });
window.addEventListener('pagehide', () => { store.save(); hydrationAbort.abort(); identityCards.stop(); pronouns.stop(); rail?.stop(); logKeyboard.stop(); virtualLog.stop(); connection.stop(); metadataClient.stop(); stopAuth(); personalChat.stop(); whispers.stop(); clearInterval(personalTimer); accountEmotes.stop(); composer.stop(); navigation.stop(); pickerLighting.stop();document.removeEventListener('share-settings',sharePicker);picker.stop(); archiveSearch.stop(); archive.stop(); statsPanel.stop();statsLedger.save();rateTimeline.stop(); display.stop(); attention.stop(); resources.stop(); inspector.stop(); tabSync.stop(); videoPanel.stop(); stopLifecycle(); linkPreview.stop();socialCards.stop(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
