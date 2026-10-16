# Complete panel lifecycle

The full application now registers 40 independent panel roots explicitly: 38 menu
panels and two contextual views (User context and VOD context). None of their
editors is constructed at startup unless an open placement, saved pin, URL option
or the selected rail layout requests it. The eight earlier conversions are
included. This completes the source migration for issue #130; merge, hosted CI and
production deployment remain separate delivery states.

## Ownership

`LazyPanels` registers commands before importing modules. It coalesces concurrent
loads, checks account/privacy/availability after imports, supports contextual
construction without opening, cancels closed requests, retries failed imports and
stops loaded owners on teardown. Each root has a stable ID and one workbench chrome.
The workbench receives its feature Close callback. Moving a dialog between modal,
docked and floating placement suppresses the browser Close event caused by that
move; a user Close still reaches the feature. `showPanel` dispatches an explicit
request instead of patching `HTMLDialogElement.prototype.showModal`.

Header-button mirroring, body-wide panel discovery, anonymous `wb-panel-N`
assignment and the global dialog prototype patch are removed. Workbench observers
only track visibility on roots already adopted explicitly. Old anonymous layout
entries are retained; their runtime-order IDs cannot be mapped safely. Reopen and
redock those panels once. Existing named IDs are preserved.

Runtime owners remain available before their editors: rules/similarity/alert
policy, display/fonts, presentation, commands, hotkeys, inbox/unread state, whispers,
provider/completion/link preferences, custom colors, device recovery, archive and
statistics collection, emote history, upload intent and authentication. Portable
picker/video/stats/resources settings have a DOM-free fallback owner that hands
capture/restore to the editor when constructed. Extension palette contributions
are enumerated from enabled extensions without opening their editor.

Picker refresh, statistics painting and discovery painting run only while their
views are open. Picker/statistics persistence belongs to application storage
services and continues with the views closed. Opening a configuration panel keeps
its existing provider authorization and review actions; lazy restoration grants no
new provider permission.

## Inventory

The table lists actual registrations rather than treating embedded controls as
independent workbench panels. Accounts imports through the auth-owned factory.

| Panel | Stable root | Lazy module |
| --- | --- | --- |
| IRC conversations | `irc-relay-panel` | `irc-relay-ui` |
| Import Chatterino | `chatterino-import-panel` | `chatterino-import-ui` |
| Completion | `completion-preferences-panel` | `completion-preferences-ui` |
| Link preferences | `link-preferences-panel` | `link-preferences-ui` |
| Compare activity | `comparison-panel` | `comparison-ui` |
| Export logs | `portable-logs` | `portable-logs-ui` |
| Public message context | `chat-context-panel` | `chat-context-ui` |
| Provider activity | `provider-activity-panel` | `provider-activity-ui` |
| Browser companion | `browser-companion-panel` | `browser-companion-ui` |
| Desktop playback | `desktop-playback-panel` | `desktop-companion-ui` |
| Own message feedback | `user-hold-panel` | `user-holds` |
| Channels | `discovery-panel` | `discovery` |
| User notes | `user-notes` | `user-notes-ui` |
| Moderation | `moderation-workspace` | `moderation-ui` |
| Rules | `rules-panel` | `rules-ui` |
| Presentation | `presentation-panel` | `presentation-ui` |
| Commands | `commands-panel` | `commands-ui` |
| Inbox | `inbox-panel` | `inbox-ui` |
| Threads | `threads-panel` | `threads-ui` |
| Bookmarks | `bookmarks-panel` | `bookmarks-ui` |
| Provider and badge preferences | `provider-preferences-panel` | `provider-preferences-ui` |
| Web extensions | `extensions-panel` | `extensions-ui` |
| Workspaces | `workspace-panel` | `workspaces-ui` |
| Search archive | `archive-search` | `archive-ui`, `history-import` |
| User context | `user-inspector` | `inspector` |
| Settings | `display-panel` | `display-ui` |
| Video | `video-panel` | `video` |
| Stats | `stats-panel` | `stats` |
| Emotes | `emote-picker` | `picker` |
| Help and resources | `resources-panel` | `resources` |
| Shortcuts | `shortcut-settings` | `shortcuts-ui` |
| Whispers | `whisper-panel` | `whispers-ui` |
| Upload image | `image-uploads-panel` | `image-uploads` |
| Privacy settings | `privacy-settings` | `privacy-settings-ui` |
| Accounts | `account-profiles` | `account-profiles-ui (via auth)` |
| VOD context | `vod-context` | `vod-context-ui` |
| Local command help | `local-command-help` | `local-help-ui` |
| Device sync | `device-sync-panel` | `device-sync-ui` |
| Custom themes | `custom-theme-panel` | `custom-theme-ui` |
| Resource readout | `resource-readout` | `resource-readout` |

The command palette creates its dialog on first invocation. Pane settings import
`split-settings-ui` on configure/rename. Identity cards and link-preview popovers
create their roots on first context intent; selection search creates its review
dialog on request. Contextual User/VOD selection is transient and does not reopen
from a saved placement alone. Moderation's presets, broadcaster, predictions,
polls, suspicious-user, AutoMod and storage-health controls are children of its
lazy workspace. Native overlay controls and their guide are children of lazy
Desktop playback. Completion suggestions, privacy status/panic controls and error
notices belong to the active chat shell, rather than optional editor panels.
The unused legacy `PanelRail` module is no longer imported by the application;
explicit Workbench rail placement owns the live video/emotes/stats rail.

## Verification

Local validation: 835 frontend tests across 180 files, strict TypeScript and the
production build passed. Regression checks cover lazy construction/cancellation,
context-only loads, concurrent activation, owner Close, docking without feature
Close callbacks, fallback settings ownership/invalid restore/retry, upload paste
retention without upload and late config responses after teardown. Existing
feature review, account and privacy fixtures remain. Happy-dom still prints its
existing localhost stylesheet-fetch teardown warnings.

Final build: `main-DOXreGOL.js`, 203.75 kB gzip, compared with 334.22 kB at the
preceding Device sync slice. `index.html` is 5.53 kB (1.92 kB gzip), down from
19.34 kB before this complete conversion. Panel markup and editor modules emit
separate chunks; pane settings is 1.19 kB gzip. The large-main warning remains.
Assets remain precached, so these are initial-entry measurements, not total
installed-download, heap, CPU or GPU savings.

Anonymous isolated Chromium 154 at 1280 x 800 verifies a fresh closed layout has
zero dialog/editor roots and no editor chunk requests; native `showModal` remains
unmodified. Palette first-open smoke checks cover the anonymous configuration panels,
including the integration review panels, Settings, Resources, Accounts and
Shortcuts. The test URL explicitly disables Video. Earlier slice checks cover
comparison/export/device-sync independently; authenticated panels retain their
fixture-based checks. Overlay startup has no editor roots or editor chunk
requests. Selecting the rail layout loads Emotes and Stats explicitly. Docked Presentation restores
with one chrome and no modal top layer; closing and reloading defers its root and
chunk. Docking generates zero feature Close events. Stats/Emotes/Resources close
without leaving a phantom modal layer. Emotes/Stats/Channels open and close before
the resource sample; closed UI refresh owners are absent. The 62.9-second foreground sample
contains nine application runtime/storage timers and no picker, stats or discovery
UI refresh owner. Explicitly reviewed provider sessions may still run in the
background when the user chooses Keep activity running; this is intentional
runtime work, not closed-editor painting.

The full build exposed the worker's old 64-entry cache limit: a normal shell read
could evict the main bundle once all lazy chunks were installed. Shell eviction
now protects all assets in the successfully installed manifest, the shell and
static icons, and removes obsolete build assets first. A 70-chunk regression
checks that the first chunk remains available offline. In Chromium, all 56 build
assets are present across 66 shell-cache entries with none missing. After stopping
the local app server, the cached shell reloads and Settings, Emotes, Help/resources,
Rules and Shortcuts open independently with one chrome each; connection status
reports the Go service disconnected. External networks remain enabled. See the
[local evidence artifact](panel-lifecycle-local-evidence-2026-10-15.json).

Authenticated provider actions, real whispers, image uploads, paired companion
operations and native overlay behavior retain their fixture-only boundaries for
this change. These browser checks do not send messages, connect providers, publish
sync records or deploy production. Broader resource qualification remains in #134
and the later performance issues.
