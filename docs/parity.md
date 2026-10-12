# Feature parity acceptance checklist

Source reference: root `index.html`, `README.md`, `sw.js`, `manifest.json`, and
`twitch-chat-relay/index.html` / `linkpeek-worker.js` inspected on 2026-10-11.
README claims require code/runtime verification; copying a claim is not evidence
that it works on Twitch today.

Every item below is a release gate. Check items only after the rebuilt behavior
has been compared to the original and the evidence recorded. Completion evidence is recorded below; open gates remain unchecked.

## Chat and recovery

- [x] Anonymous viewing and optional authenticated chat; connected/reconnecting
  status and meaningful failures.
- [x] Up to six merged channels; focus, channel chips, send target, stream video,
  per-channel storage and channel switching/add/remove links.
- [x] Timestamps, display names, readable user colors, badge icons/fallbacks,
  subscription/bit/first-message chips and clickable name behavior.
- [x] Quoted replies, parent jump, pending reply and permalink `?mid=` behavior.
- [x] `/me`, commands, tags and notice/subscription/raid/gift rendering.
- [x] ROOMSTATE/USERSTATE/GLOBALUSERSTATE; slow mode, followers/sub-only state,
  own timeout/ban countdown and moderator/VIP exceptions.
- [x] CLEARMSG, user timeout/ban ghosting and room-wide clear behavior.
- [x] Live-message/backfill deduplication including local echoes and notices;
  suspend, hidden tab, discarded page, restart and reconnect gap markers.
- [x] Scroll follow, pause-on-hover, jump-to-live controls, bounded background
  queues and selectable 250–100,000-row scrollback without blocking the UI.

## Authentication and input

- [x] New registered Twitch app; login, logout, expired-token recovery and
  retained channel context through OAuth.
- [x] Sending and replies; immediate local echo adopted by the server message;
  rejection/slow-mode/follower-only notices.
- [x] Supported slash commands and moderator timeout/ban/delete controls,
  validated against current Twitch interfaces and account permissions.
- [x] Autogrowing composer, Enter/Shift+Enter, send button, message-length
  warning and cap, focus behavior and reply cancellation.
- [x] Nickname and emote completion, picker insertion and keyboard selection.
- [x] Draft and sent-message history with up/down traversal and per-channel
  persistence.
- [x] Whisper pane, unread indicator, scopes and send behavior where currently
  supported; resolve original relay's `jtv` send restriction explicitly.

## Emotes and picker

- [x] Native Twitch emote ranges including Unicode indexing; animation/static
  fallback, cheer emotes and subscriber emote sets.
- [x] 7TV/BTTV/FFZ globals and channel sets, precedence, case handling, animation
  and zero-width stacking.
- [x] Emote-only enlargement modes and provider-aware hover cards.
- [x] Searchable provider/emoji picker; enabled tabs, deduplication, mixed mode,
  recent-use row, alphabetical/usage ordering and animated/still filters.
- [x] StreamElements seeds, live usage updates, age markers, recent pinning,
  reorder animation, use flashes, hold/hold+, pause and name overlays.
- [x] Zoom, era-row modes, pinning, dragging, resize and saved geometry/options.

## Stats, stream and media

- [x] Header message-rate graph, time windows, bursts, gaps, chatter count and
  graph-minimized/header options.
- [x] Stream uptime, viewers, title, last broadcast/VOD start/end and histories.
- [x] Stats panel: user/emote/badge/link usage, time scopes, ordering, exclusions,
  per-day/hour buckets and retained samples.
- [x] Twitch video: parent-domain configuration, volume, visibility, movable/
  resizable overlay, dock/rail modes and saved geometry.
- [x] URL rendering/cleaning, bot-specific formatting, link icons, media cards,
  direct playable media, YouTube embeds and restored-media autoplay behavior.
- [x] X/Twitter preview cards, quoted media, Nitter selection and graceful failure.
- [x] Generic hover previews and provider-specific worker behavior; redirect
  disclosure, TTL, timeouts, cached failures and unsafe-destination rejection.
- [ ] GIF title lookup, safe mode, limits and cache behavior; pronouns.

## Display and resources

- [x] Every preset and its aliases, palettes, shade axis, fonts, size, weight,
  spacing, line/zebra levels, nick effects, shadows and motion options.
- [x] Multi-column page-flip layouts and rail configurations, reverse order,
  docking, resizing and preserved scroll positions.
- [x] Help/configuration popup, tabs, resource lists, authors, media, left/libre
  links, channel links, tooltips and repository metadata.
- [x] Help and picker drag/resize/pin geometry; header labels/minimization,
  settings slots, reset behavior and copy/share settings URL.
- [ ] Keyword/blocked-word filters, hidden-user modes, bot visibility,
  own-name/keyword mentions, unread badges, sound and notifications.
- [x] All documented URL options, precedence, aliases and settings serialization.

## Storage, accessibility and lifecycle

- [x] Structured local history, reload persistence and safe schema upgrades;
  explicit compatible legacy import and recovery without overwriting originals.
- [x] IndexedDB archive search, retention/pruning/cap and live search navigation.
- [x] Cross-tab option/login sync and sent-message BroadcastChannel echoes.
- [x] Screen-reader announcements excluding replay, landmarks, dialog semantics,
  keyboard navigation, focus, labels and reduced-motion behavior.
- [x] PWA manifest/icons/install state, shell/fonts/image caching and offline
  banner/history without implying offline live chat.
- [x] Update detection, reload cache behavior, error reporting and lifecycle
  handling including back/forward cache and long background/suspend periods.
- [x] Self-hosted HTTPS deployment, graceful shutdown, health/readiness,
  bounded connections/caches, request limits and monitoring.
- [x] Owner-controlled credentials/endpoints and attribution; analytics/presence
  disabled unless configured for the owner, with no original-service reporting.

## Verification record for the foundation

The foundation implements only a subset: anonymous read transport, normalized
IRC data, reconnection/backfill, basic text/reply/moderation rendering, bounded
local history and two theme colors. Do not check the broader family gates merely
because one element exists.

Verified on 2026-10-11:

- `go test -race -cover ./...`: passed; IRC parser 100% and service 81.2%
  statement coverage. Command startup is not covered by unit tests.
- `go vet ./...`: passed.
- `npm run build`: passed with strict TypeScript checking and Vite production
  output. `npm test`: 21 tests passed.
- Local fake-upstream integration verifies handshake, PING/PONG, channel
  isolation, history replay, live messages, cross-origin rejection and shutdown.
- Browser on the actual Go service: connected to HasanAbi and rendered live
  messages; no relay iframe. Reload restored history and light-theme preference.
- Browser at 375×812: no horizontal overflow. This verifies CSS layout at that
  size, not native mobile lifecycle behavior.
- Vite development proxy: connected to Go and rendered live messages.

`golangci-lint` was unavailable in the environment; its lint gate remains open.
Authenticated behavior and full original UI parity remain unimplemented and
unverified.

## Emote, badge and stream checkpoint

Added on 2026-10-11:

- Go provider normalization for 7TV, BTTV, FFZ and animated FFZ; globals then
  channel overrides, channel badge versions, and stream uptime/viewers/title.
- Bounded public cache, shared in-flight requests, stale-data fallback after
  provider failures, per-request timeouts and partial-provider error reporting.
- TypeScript runtime metadata validation and channel-aware badge/emote rendering.
- Native emote ranges indexed by Unicode code point; native tags override
  provider name matches, malformed/overlapping ranges are ignored.
- Zero-width stacking, emote-only enlargement, animation-to-static failure
  fallback and a persisted freeze control; safe text and badge fallbacks.
- Existing rows/images are reused as live messages arrive. Slow backfill no
  longer blocks IRC reads or PING/PONG; its workers cancel/join on disconnect.

Verification:

- Go race tests and `go vet` passed. Metadata provider tests cover precedence,
  overridden animation/overlay flags, badge merging, partial failures, stale
  fallback, coalescing, cancellation, invalid JSON and response-size limits.
- Strict TypeScript build and 44 frontend tests passed. DOM tests verify overlay
  stacking, badge fallback, safe text, static fallback and action rendering.
- The live HasanAbi response supplied 665 normalized emotes and 415 badge sets.
  Native/provider images, badge icons, stream information and the freeze control
  were observed in the browser at 375×812 without horizontal overflow.
- The channel-specific 7TV endpoint returned HTTP 404 with `user not found`;
  global 7TV and the other providers remained available. 7TV channel merging and
  overlays are fixture-verified, but this channel's live set is unavailable.

Still open: emote picker and its ordering/usage/geometry, cheermotes, subscriber
set discovery, stream/VOD history, all display presets, authentication/sending,
media previews and the other family gates above. This is not a parity release.

## Twitch login checkpoint

Added on 2026-10-11:

- Root environment loading with process overrides and credential-safe errors.
- Go authorization-code exchange at the registered `chat.subcult.tv` callback;
  browser-bound single-use state and retained channel selection.
- Bounded in-memory sessions, secure HttpOnly cookies, token validation and
  refresh, identity/scope checks, and origin/CSRF-protected logout.
- Frontend login/logout and account status with no Twitch tokens in browser
  storage or session responses.

Verification: Go race tests and `go vet` passed; auth coverage exceeds 90%.
The strict frontend build and 59 frontend tests passed. The running local
service reports login enabled, produces the exact registered callback, and
serves the login control while anonymous chat continues. The saved secret
was checked absent from built frontend assets.

Still open: real consent at the HTTPS domain, authenticated sending, durable
encrypted session storage, moderator permissions/actions, cross-tab login
behavior and all remaining family gates. Sessions currently end on restart.
`golangci-lint` is unavailable in this environment; its check remains open.
No public deployment or cutover has occurred.

## Authenticated sending checkpoint

Added on 2026-10-11:

- Helix channel resolution, session-derived sender identity, messages and replies.
- Origin/CSRF validation, bounded request bodies, 500-codepoint length checks,
  control/slash-command rejection and one-new-send-per-second session limit.
- One validated refresh after an explicit 401; ambiguous deliveries do not
  retry. The last 32 request outcomes protect repeated IDs within that session.
- Composer destination selection, reply/cancel controls, per-channel drafts and
  fifty-entry sent-input history. Text clears only after confirmed acceptance.

Go race tests, `go vet`, the strict frontend build and 72 frontend tests pass.
Fake-provider tests verify sender identity, payload/reply mapping, request replay,
conflicting IDs, invalid input, rate limits, token refresh, rejected/dropped
messages, and uncertain delivery. The running preview showed both joined channel destinations, disabled anonymous
sending, and continuing chat. Desktop and 375×812 layouts had no horizontal
overflow. Real-account evidence is still open; no real chat message was posted.

Still open: slash commands, whispers, moderator APIs, optimistic/cross-tab echoes,
real account/channel restriction checks and the other full-parity gates.

## Composer and reply-navigation checkpoint

Added on 2026-10-11 after comparing the original input handlers:

- A textarea grows to 160 px, then scrolls; Enter submits, Shift+Enter edits a
  multiline draft, and IME Enter remains an editing action. The outgoing line
  replaces newlines with spaces and trims its edges, with a 460/500 warning/cap.
- Current-channel nickname and known-emote completion, thirty-candidate limit,
  Tab/Shift+Tab and arrow selection, Enter acceptance, mouse selection and Escape.
- History traversal respects the outer draft lines; Escape cancels an armed reply.
- Parent jumps and message-link buttons preserve channel parameters and update
  `?mid=`. Missing targets wait for available history; navigation pauses follow.

The strict frontend build and 82 frontend tests pass. Fixtures cover completion
matching, Unicode caret offsets, bounded suggestions, multiline/IME input,
completion-before-send behavior, history boundaries and permalink/backfill
navigation. Real browser evidence is recorded separately below.

Still open: the full picker, account/subscriber emote discovery, original parked
history/editing semantics, long-message mirror highlights, and the remaining
family gates. Completion does not prove that an observed subscriber emote is
available to the logged-in account. No real Twitch message was sent.

Browser verification for this checkpoint: the live Go preview stayed connected,
and message-link selection updated `mid` and highlighted exactly one loaded row.
At 375×812, multiline draft injection grew the textarea and reached its 160 px
cap without horizontal overflow; the original draft was restored after the
check. The placeholder was shortened to keep the empty mobile composer compact.
Keyboard/completion send behavior is fixture-tested; no real account send was
performed. Backend code did not change in this checkpoint.

## Emote picker checkpoint

Added on 2026-10-11:

- Ported the original emoji list/search keywords, public provider catalog and
  observed native emotes; native precedence and case-preserving code insertion.
- Search, provider enable controls, grouped/mixed grids, 200-result paging,
  per-channel 24-code recent row and most-recent-live-usage/A–Z ordering.
- Animated/still filtering, animation pause/static fallback, names, five zoom
  levels and a saved CSS resize. Stored state is validated and bounded.
- Caret/selection insertion with spacing, retained open picker, accessible
  controls, Escape/focus return and anonymous browsing with insertion disabled.
- Live rebuilds coalesce to one second and hold while hovered; replay does not
  double-count usage. Confirmed sends also populate the recent selection row.

The strict build and 94 frontend tests pass. Fixtures verify catalog precedence,
search and animation/provider filtering, stored-state validation, per-channel
recents/usage, duplicate/replay handling, caret insertion, hold behavior,
anonymous restrictions, paused images, option persistence and Escape return.
The live 375×812 preview loaded all five provider controls, matched the original
emoji keyword “pizza” to 🍕, and showed no horizontal overflow while chat stayed
connected. No live Twitch message was posted.

Still open: complete account/Twitch emote sets, StreamElements seeds, family and
age-row ordering, age markers, use flashes, reorder animation, hold+, drag,
pinning, exact original zoom/geometry modes and provider hover cards. This is a
picker checkpoint; the emote-picker family gate remains unchecked.

Desktop browser verification: searching “kappa” matched Kappa and KappaCool
with two image cells. The saved picker size fit inside 1280×800 without
horizontal overflow. Auth status polling now rebuilds immediately only when
insertion permission changes, preserving hover hold during unchanged polls.

## Floating picker and ordering checkpoint

Added on 2026-10-11: pointer dragging automatically pins the picker, keyboard
arrow movement (Shift for larger steps), saved pin/open/size/position, deliberate
close persistence, unpin-to-anchor behavior and viewport clamping. Family-stem
ordering, seen-only filtering, original age thresholds, threshold-driven refresh,
all seven original zoom levels and Enter-to-insert search behavior are ported.
Age separators currently use full rows; original inline/era/visual-row modes and
missed-period tinting remain open. Grouped provider sections repeat their markers.

The strict build and 100 frontend tests passed before the added Enter regression
case. Geometry fixtures cover malformed storage, mobile bounds, pin/reopen/close
and unpin sizing. Browser evidence confirmed keyboard movement pins the panel,
its box stays inside the desktop viewport, and age markers render without page
overflow. Pointer capture and mobile checks are recorded in later verification.

Final verification for this checkpoint: 101 frontend tests and the production
build passed. A synthetic pointer drag to coordinates outside the viewport
clamped the pinned panel to left 12/top 16 at 375×812, with right 363/bottom 456
and no horizontal overflow. This exercises the real DOM handlers; physical
pointer-capture behavior is still a manual acceptance check.

## Room state and message rendering checkpoint

Added on 2026-10-11: partial ROOMSTATE updates merge per channel and show the
selected send target's slow/follower/subscriber/emote/unique modes. State frames
are retained for recovery but do not appear as empty message rows. USERNOTICE
system text, subscription/raid/gift type metadata, first/returning chatter and
bits chips, moderation descriptions and Twitch nickname links now render safely.
Nickname colors are adjusted for contrast in light/dark themes. HTTP(S) links
retain punctuation, discard common tracking parameters and protect external tabs.

Strict TypeScript/Vite build and 108 frontend tests pass. Fixtures cover partial
room updates, malformed tags, channel isolation, system notices, chips, unsafe
URL protocols/credentials, escaped markup and color adjustment. Real browser
reload retained the pinned picker, rendered nickname links and showed no mobile
horizontal overflow. Room restrictions are informative; authenticated slow-mode
countdowns, role exceptions, detailed notices and moderation actions remain open.

## IndexedDB archive checkpoint

Added on 2026-10-11: a versioned browser-local archive, batches of incoming and
restored messages, channel-qualified deduplication, a 100,000-row oldest-first
cap and bounded write backlog. Searches validate stored rows, scan an indexed
channel/time range, match literal text and return at most 500 newest matches.
The search dialog shows 100 results, cancels stale requests and reports failure.
Selection loads nearby archived context without evicting live scrollback; Jump
to live returns to current chat. Startup permalinks also try the local archive.
The original app's storage is neither read nor overwritten.

113 frontend tests and the strict production build pass. IndexedDB fixtures
cover persistence/reopening, duplicate writes, state-frame exclusion, ordering,
channel/time/text/login filters, cancellation, unavailable storage, oldest-row
pruning and channel-qualified ID lookup. Browser search returned 100 real local
results at 375×812 without overflow; selecting one closed the dialog and loaded
archived context. Full legacy import, configurable retention, archive export,
live-search pagination and cross-tab coordination remain open.

Vitest was upgraded to 5.0.3 after the dependency audit reported vulnerable
mocker/tinypool versions. All tests pass on the new runner and npm audit reports
zero vulnerabilities. See the official migration guide:
https://vitest.dev/guide/migration/ .

## Statistics checkpoint

Added on 2026-10-11: a one-minute header graph and a statistics dialog with
1/5/30-minute, 1-hour and 24-hour scopes, joined-channel selection and saved user
exclusions. Retained PRIVMSG rows are deduplicated by channel/ID; user, repeated
emote, badge, link-domain, local-hour/day rankings and peak-minute counts render
as safe text. SVG graphs carry accessible labels and message-count tooltips.
This checkpoint covers retained scrollback, not complete historical analytics.

116 frontend tests and the strict production build pass. Fixtures cover repeated
emotes, deduplication, channel/time exclusions, future/system-message exclusion,
rankings, buckets and empty SVG graphs. The live mobile dialog showed all six
ranking lists, a 60-bar graph and 212 messages from 155 chatters without overflow.
Long-lived samples, persisted buckets, original burst/glorp statistics, complete
sort controls and graph gap bands remain open.

## Display settings and filtering checkpoint

Added on 2026-10-11: the original 14 palettes, four finishes, twelve stable shade
IDs, font-family choices and 18 preset definitions. Validated stored settings
load before URL overrides; legacy palette names and the `default` preset alias
resolve. Font size/weight/line-height/spacing, separator/zebra levels and timestamp
modes apply to chat. Literal keyword/own-name highlights, blocked words and hidden
users (vanish/stub/ghost) preserve moderation notices. Hover follow, reset,
settings URL output and cross-tab display-storage sync are available.

119 frontend tests and the strict build pass. Fixtures cover malformed metrics,
font validation, bounded strings, URL/preset precedence, aliases, word boundaries,
literal regex characters, own-name matching and notice preservation. Mobile
browser `theme=ft&size=18` applied salmon/shade 1/Georgia/18px, exposed all preset
choices and had no overflow. Font choices currently use installed fonts/fallbacks;
original font assets, preset-specific layouts, shadows, badge/emote modes,
header minimization and the remaining settings fields are still open. Stub counts
currently summarize hidden users at the end of loaded history.

## Accepted echoes and tab synchronization checkpoint

Added on 2026-10-11: confirmed Helix sends appear immediately using the returned
message ID; the corresponding IRC message replaces local metadata without adding
a second row. Same-origin BroadcastChannel shares accepted echoes with joined
chat tabs and signals login changes without tokens or CSRF values. Unsupported
browsers keep working. History deduplication now qualifies IDs by channel and
uses a fallback identity for message-less notices; binary insertion keeps late
backfill ordered without sorting the whole history on each arrival.

124 frontend tests and the strict build pass. Fixtures cover echo adoption,
notice/channel deduplication, cross-tab delivery, malformed/oversized payloads,
listener cleanup and unsupported BroadcastChannel. Actual authenticated sends
remain unverified; no real message was posted. Pre-acceptance optimistic display,
full cross-tab lifecycle/receipt behavior and original parked-draft semantics
remain open.

## Stream video and offline shell checkpoint

Added on 2026-10-11: the official Twitch interactive player loads on demand with
the current hostname as parent, paused startup, channel/play/pause/mute/volume
controls, saved preferences and floating drag/pin/resize or top docking. Narrow
screens link to Twitch rather than shrinking below the documented player size.
See https://dev.twitch.tv/docs/embed/video-and-clips/ . Original rail/corner modes,
all geometry constraints and media-card players remain open.

A separately type-checked TypeScript service worker caches the app shell and its
hashed assets, manifest/icons, up to 600 images and 100 font entries. APIs and
third-party embeds bypass the shell cache. Only app-owned obsolete caches are
removed; updates wait for the Reload control. Connectivity status distinguishes
saved history from live chat. No original-service analytics were added.

129 frontend tests and the production build pass. Fixtures cover player option
validation, paused startup, ready-only playback controls, channel/mute settings,
narrow-screen fallback, offline status and explicit update activation. The real
Twitch iframe loaded with parent=127.0.0.1, reported Stream online and enabled
controls without overflow. The actual service worker activated and precached the
HTML/JS/CSS/icons; no API response appeared in its cache. With the local Go service
temporarily stopped, navigation still loaded the app and 996 saved rows while
login reported unavailable and chat reported reconnecting. The service was then
restarted on 127.0.0.1:8080. This tests server-loss fallback, not physical network
loss or native installed-PWA lifecycle. Full font loading, update deployment
acceptance and the broader PWA family gate remain open.

## Public link preview checkpoint

Added on 2026-10-11: a Go preview endpoint using bounded HTML tokenization for
OpenGraph/Twitter/title/description/site/author/image/icon/date metadata and
non-HTML content descriptions. Public DNS addresses are pinned at connection
time; mixed/private/reserved DNS answers, credentials, unsafe schemes/ports and
private redirects are rejected. Redirects cap at four, reads at 128 KiB, fetches
at ten seconds/eight concurrent, cache at 256 entries, and each remote caller at
thirty uncached lookups per minute. Successful metadata lasts a day and failures
a minute. Reverse proxies currently share their remote-IP budget; trusted client
IP forwarding still needs deployment configuration.

Frontend cards support debounced hover, explicit keyboard-accessible preview
buttons, safe textual metadata, redirect disclosure, failure links and cached
results. Direct audio/video and YouTube players load only on selection, with
no autoplay. Provider-specific facts/oEmbed/JSON-LD, X/Nitter cards, GIF/pronoun
lookup and full original media modes remain open.

133 frontend tests, strict browser/worker builds, Go race tests, go vet and
 golangci-lint pass. The preview package has 97.5% statement coverage and the
server 85.3%; command startup remains uncovered. Fixtures cover DNS pinning,
private/mixed destinations, ports/schemes/redirects, metadata precedence/entities,
read bounds, Unicode truncation, cancellation, coalescing/cache expiry, cache/rate
bounds, handler origins/shutdown/capacity and safe card/player rendering. A
production-shell contract test now checks every required startup control.
The real endpoint returned Wikipedia metadata, and a temporary browser test
button rendered its title/description/image while chat stayed connected without
overflow. The test button was removed; no chat message was sent.

The previously missing golangci-lint is now installed (2.14.0). It found twenty
issues in earlier auth/config fixtures; unchecked close/write/environment errors
and HTTP status literals were fixed, and the full linter now reports zero issues.
The HTML tokenizer dependency raises the minimum Go version to 1.26; README and
module requirements agree. npm audit still reports zero vulnerabilities.

### Account emotes checkpoint

- Added session-bound, paginated Twitch user-emote loading with selected-channel
  follower emotes. OAuth requests `user:read:emotes`; existing sessions retain
  chat access and receive an explicit reauthentication prompt for emotes.
- Normalized static/animated formats from Twitch's response, bounded page/cursor
  validation, per-session request budget, server-only credentials, and picker /
  completion integration. Logout and account/channel changes cancel old loads.
- Fixed native emote indexing inside IRC ACTION messages: tag ranges refer to
  the text after the CTCP prefix, including Unicode code points.
- Verified 139 frontend tests, strict TypeScript/build, Go race tests / vet /
  zero lint issues, auth coverage 89.9%, and production anonymous browser startup.
  Account consent, subscriber/follower emote API behavior with a real account,
  and real posting remain acceptance work; no external messages were sent.
- Reference: https://dev.twitch.tv/docs/api/reference/#get-user-emotes and
  https://dev.twitch.tv/docs/chat/irc/ (checked 2026-10-11).

### Display resources and attention checkpoint

- Restored original Google/CDN font declarations and bundled pixel fonts, retaining
  original attribution and font fallbacks. Fonts cache through the existing worker.
  Browser verified Cursed loading and selected family in the production shell;
  full remote-font/offline acceptance remains open.
- Added original shadow levels and inline/right/off emote-only modes, including
  preset and URL application, own-name highlight toggle and known-bot filtering.
- Added bounded FIFO missed-mention queue, jump through archived context,
  Shift-click clear, optional soft Web Audio tone after a gesture, hidden-page
  mention/live notifications, explicit permission request, burst throttling and
  notification-click recovery through the service worker.
- Replay, duplicate, filtered, self and focused-page messages do not create
  missed mentions. Tests cover queue limits, permissions, worker delivery, live
  transitions, settings aliases and display filters. 144 frontend tests pass;
  TypeScript and production build pass. Actual audible sound and native OS
  notification delivery still require user acceptance.

### Large scrollback checkpoint

- Added original selectable 250/500/1,000/2,000/5,000/10,000/25,000/50,000/
  100,000-row limits, saved and shareable through settings and URL parameters.
- Added variable-height windowed rendering, measured-height spacers, viewport
  overscan, paused-reader anchoring through eviction and live append, and distant
  permalink navigation. Moderation is scoped by channel and remains visible
  when affected rows enter the window. Hidden-user stubs retain their position.
- Added joined-channel IndexedDB history restoration up to the selected cap,
  chronological bulk merge preserving live data and server echo adoption, and
  cancellation when the selected cap changes. The localStorage startup cache
  remains bounded at 1,000 records; IndexedDB supplies the larger history.
- 151 frontend tests pass, including 100,000-record bounded-DOM navigation,
  eviction anchors and scroll-away regression. TypeScript/build pass. Live
  production browser restored 14,167 messages with 45 mounted rows and retained
  a paused reading position; Jump to live was verified. Multi-column page flips
  and keyboard row-selection controls remain separate open work.

### Help and curated resources checkpoint

- Ported the original media, left, libre and author tabs, preserving 1,411
  external links and 23 channel links, their surrounding descriptions and
  attribution. A reproducible port script strips executable markup and unsafe
  URLs; original resource files remain unchanged.
- Added movable/resizable/pinnable help panel, saved geometry and selected tab,
  labelled tabs with Arrow/Home/End navigation, Escape close/focus restoration,
  current feature instructions and settings/stats/archive actions.
- Channel links preserve rebuilt settings and clear unrelated message IDs.
  External links use noopener/noreferrer. Upstream source and AGPL credit remain.
- 153 frontend tests, TypeScript/build and production browser panel/tab/link
  inventory pass. Dynamic channel probes, repository counters, original resource
  column layouts and all configuration help controls remain open.

### Current Twitch commands and user inspector checkpoint

- Added API translations for timeout/ban/unban, delete/clear, slow/followers/
  subscribers/emote-only/unique-chat modes and disabling forms, announcement
  colors, and user chat color. Input bounds follow current Twitch API limits.
- OAuth requests the corresponding optional command scopes; existing sessions
  get a reauthentication prompt. The session supplies user/moderator identity;
  Twitch still enforces channel roles. Tokens never reach the browser.
- Commands share CSRF/origin checks, request receipts and pacing with sending.
  Ambiguous writes are not retried automatically; receipt retries do not repeat
  acknowledged actions. Command acknowledgements do not create chat echoes or
  consume an armed reply.
- Added user inspector with profile, retained-message count, message context,
  reply and timeout/ban/delete controls. Each moderation action is staged, then
  confirmed with its channel; anonymous/missing-scope actions are disabled.
- Verified 159 frontend tests, strict TypeScript/build, Go race tests/vet,
  zero lint findings and auth coverage 91.2%. Production browser inspected a
  real live-chat user with anonymous moderation disabled. Real moderator
  permission/consent and actual command behavior remain acceptance work; no
  real moderation calls were made. `/me`, whispers and additional broadcaster
  commands remain separate open work.
- API reference checked 2026-10-11:
  https://dev.twitch.tv/docs/api/reference/ and
  https://dev.twitch.tv/docs/chat/irc-migration/.

### Credentialed personal chat state checkpoint

- Added separate same-origin, cookie-bound Go IRC stream for authenticated
  USERSTATE/GLOBALUSERSTATE/ROOMSTATE, personal notices and own timeout/ban
  events. Public messages/backfill continue through the existing anonymous
  stream and are not duplicated by the personal transport.
- Requests `chat:read`/`chat:edit` on new OAuth consent. Existing sessions lacking
  those scopes keep API chat access and receive a personal-state login prompt.
  Credentials stay in Go, with handshake bounds, 32 service connections / two
  per session, browser-close cancellation and logout/token-rotation/expiry checks.
- Added own role labels, finite timeout countdown and composer blocking, and
  slow-mode pacing after accepted messages with moderator/broadcaster/VIP
  exceptions. A reported ban remains visible; Twitch is authoritative for
  restored permission on subsequent sends.
- 161 frontend tests pass, including role merges, scope enablement and countdown
  behavior. Go race tests, vet, lint and production builds pass; auth package
  coverage remains above 80%. WebSocket fixtures verify credential handshakes,
  pings, private-state filtering and prompt service shutdown. Production anonymous
  startup remains verified. Real consent/role changes and transport behavior
  require acceptance. Whisper delivery through current EventSub is still open.

### Acknowledged action sends and native local echoes checkpoint

- Added `/me` through the credentialed IRC connection. One session send is in
  flight at a time; the HTTP request waits for a USERSTATE message ID or personal
  rejection notice. Missing connection/scope, disconnect and acknowledgement
  timeout return explicit failures; uncertain writes are not automatically retried.
- Actions participate in send receipts and produce CTCP-style local echoes with
  the acknowledged ID, while preserving an armed reply. Public server messages
  adopt those echoes through existing ID deduplication.
- Own echoes retain personal badge/color tags and synthesize native emote ranges
  only from the account's usable Twitch catalog, including Unicode and ACTION
  offsets. Observed emotes belonging to other accounts do not create false
  native local echoes.
- 163 frontend tests, TypeScript/build, Go race tests/vet and zero lint findings
  pass. Auth coverage is 89.0%. Full WebSocket-to-HTTP action fixture verifies
  handshake, outgoing action, acknowledgement and state forwarding. Real Twitch
  action acceptance and acknowledgement timing remain explicit live acceptance.

### Whisper send checkpoint

`/w username message` resolves the recipient and submits through Twitch's current
whisper API using the signed-in sender. Only HTTP 204 counts as request acceptance;
Twitch may silently discard accepted whispers, so the pane labels outgoing messages
as requested, never delivered. Shared request receipts protect retries. Private
text is excluded from persistent drafts, sent history, public logs, statistics and
cross-tab broadcasts. The bounded private pane supports reply preparation without
overwriting a current draft. Incoming EventSub support is still pending at this
checkpoint; authenticated IRC whispers are accepted if Twitch supplies them.

Validation: 164 frontend tests and production build; Go race/coverage suite, vet
and golangci-lint pass. Mock upstream verifies recipient/sender binding, permission
failure, ambiguous responses and HTTP acceptance. No real whisper was sent.

### Incoming whispers checkpoint

Go now subscribes to `user.whisper.message` through EventSub WebSockets, sharing
one upstream subscription per account across the app's tabs. The browser receives
only messages whose subscription and recipient both match its signed-in account.
The server holds credentials; neither whisper contents nor tokens enter public
chat transport, public persistence or broadcasts. Bounded queues disconnect slow
consumers, and duplicate IDs are suppressed. Welcome/keepalive timeouts, automatic
Pong handling, revocation notices and Twitch's overlapping reconnect handoff are
implemented. Unexpected disconnects explicitly disclose unrecoverable gaps.

Validation: local integration fixture verifies two tabs share one subscription,
recipient mismatch is discarded, duplicate whispers stay singular, and reconnect
handoff does not resubscribe. Browser unit tests verify safe rendering, bounded
rows and account clearing. 166 frontend tests/build and Go race/coverage, vet and
lint pass. Real account consent and incoming whisper delivery remain acceptance
gates. Protocol reference: https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
and https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#userwhispermessage.

### Display chips, motion and URL aliases

Added original subscriber-month chips with left/right, numeric and hidden modes.
Missing `badge-info` counts show unknown, rather than zero. Literal @mentions
render safe Twitch profile links and use observed readable chatter colors;
clicking a mention opens the inspector when that chatter has retained context.
Bot nickname shimmer, rainbow notice labels/Hasan mentions and motion rates honor
reduced-motion. `kw`, `bw`, `hw`, `hwm`, bare `zebra`, `clean`, `cmodes`, `anim`,
`rbw`, `sub` and `shade=auto` now parse alongside the descriptive saved options.
System shade changes repaint rows, and all added settings serialize/share.

Validation: 169 frontend tests and strict production build pass. Browser restored
history and live connection with URL-selected numeric right-side chips and slow
motion; system light/dark matched and no desktop horizontal overflow occurred.
Broader layout, picker choreography and URL-option parity gates remain open.

### Virtual log keyboard checkpoint

The log is focusable. Arrow keys select adjacent retained rows; Home selects the
oldest loaded row, End returns to live, Enter activates reply and Escape clears
selection and focuses the authenticated composer. Plain typing outside editable
controls, links, buttons or dialogs focuses/inserts into the composer. These
shortcuts use the virtual index, including distant rows, and keep focused row
controls intact across a viewport repaint. Existing back/forward-cache handling
reloads after pagehide has stopped connections, restoring saved history/drafts.

Validation: 170 frontend tests and strict production build pass. A 10,000-row
fixture verifies distant selection and control-safe typing. Live browser Home
selected/focused the oldest row and paused follow with only viewport rows mounted.

### Recovery and stale socket checkpoint

Reconnect backoff resets after actual upstream connected status, preventing
rapid retry loops when the Go socket opens but Twitch remains unavailable.
Network restoration retries a waiting connection immediately; returning after a
minute in the background renews the socket. Public chat adds one interruption
marker and a timed recovery marker, explicitly noting partial backfill. Stopped
sockets ignore queued frames, including private account events after logout or
account switching. This is separate from Twitch consent/delivery acceptance.

Validation: 173 frontend tests and strict production build pass, including
backoff, online retry, stopped-frame rejection and non-duplicated gap markers.

### Reverse flow and input docking checkpoint

`rev` follows new messages at the top; paused readers keep the same message anchor
when new rows prepend, and Latest returns to the appropriate edge. Virtualization,
permalinks and moderation still use stable message keys. `bartop` places the
composer below the header and anchors an unpinned picker below it; pinned geometry
stays explicit. Both options persist and share through display settings.

Validation: 175 frontend tests and strict production build pass. Reverse-flow
fixture verifies top follow and paused prepend anchors. Live browser restored
100k-cap history in reverse order with scrollTop zero and the composer directly
below the header, without horizontal overflow. Page-flip and rail layouts remain
separate unfinished gates.

### Header and settings slots checkpoint

Header modes cycle full/strip/graph and restore `min=graph` or numeric values.
Header and resource font sizing (`hfs`, `hpfs`) and resource link weight (`lw`)
apply independently. Three display slots save when empty, recall on click and
overwrite only with Shift-click or right-click; validated slot changes sync across
tabs. Slots contain display settings, never credentials or private messages.
Preset subscriber-chip and header/help font defaults now apply explicitly.
Selecting a fixed shade or preset exits system-follow mode.

Validation: 177 frontend tests/build pass, including save/recall/overwrite and
preset/URL mappings. Live graph-header mode reduced header height, expanded the
rate graph, applied 12px header font and produced no horizontal overflow.

### Page columns and panel rail checkpoint

`split=2/3` now uses page-flip columns with measured virtual rows: full live pages
rotate, retired pages remain in the first column's virtual history, and old rows
are accessible by permalink/keyboard. Pausing freezes normal pages until Latest;
reverse flow drains older rows through the columns into the last column's history.
Metric/image reflow spills the active page or re-deals overflowing idle pages.

`split=4/5/6` uses two chat columns plus a shared rail with video/emotes/stats,
video/emotes, or emotes. Panels can Float/Dock, parked geometry is not overwritten
by dock measurements, and prior visibility returns on departure. Portrait falls
back to two columns with no rail. The rail scrolls vertically when its contents
cannot fit; video keeps Twitch's minimum dimensions and never autoplays.

Validation: 180 frontend tests/build pass. Fixtures verify 100k-row bounded DOM,
rotation, retired-history navigation, pause/resume, reverse drain and rail home
restoration. Live browser verified three columns, two-column rail contents,
409x300 video player, Float/Dock and 375x812 portrait fallback without horizontal
overflow. Video reported online; playback/audio acceptance remains separate.
Column-local hover pauses, rail split resizing and exhaustive transition
acceptance are still pending, so the broad layout gate stays open.

The layout checkpoint's final full-suite rerun initially timed out in the existing
large IndexedDB restoration fixture with unrestricted worker concurrency. That
fixture passed alone. Vitest is now capped at four concurrent workers; the whole
180-test suite and production build passed with the original 5-second test
limit unchanged. This bounds test resource contention rather than hiding the
failure by extending its timeout.

### Cheers and inspector pronouns checkpoint

Messages carrying Twitch's Bits tag now tokenize the original allowlisted cheer
prefixes into tiered animated/still CDN images; plain matching words without the
Bits tag stay text. Native/provider emotes retain precedence. Stats count the
rendered cheer tokens. Missing images still fall back to readable token text.

Opened inspectors request public pronouns from the original Alejo endpoint,
coalescing lookups in a bounded queue with a 300ms gap. Valid labels cache for a
month, explicitly unset labels for a week, and failures remain unknown with a
short retry cooldown. Responses are bounded and validated; no account tokens or
referrer accompany the request. `pn=0` disables lookup/display, including a result
arriving after the preference is switched off.

Validation: 184 frontend tests/build pass. Current Cheer100 CDN returned image/gif
HTTP 200; Alejo's pronoun list and a public empty-user response were checked live.
Fixtures cover tagged tier rendering, lookup coalescing/cache restoration,
invalid responses and transient failure. Profile/emote hover-card parity remains
unfinished at this checkpoint.

### Public identity hover cards checkpoint

Hover/focus cards now cover nicknames, mentions, badges and chat/picker emotes.
Emote cards retain provider/code and link to 7TV/BTTV/FFZ detail pages; native
images link to their CDN resource. Profile cards show retained-message count,
optional pronouns, public bio/avatar, join date, follower count and partner status.
A bounded Go `/api/users/{login}` endpoint reuses the public provider cache and
request capacity, validates the returned login, and forwards only selected public
fields. Browser caches are bounded; late results cannot replace another card.
Text is rendered as text and unavailable metadata is disclosed.

Validation: 186 frontend tests/build; Go race/coverage suite, vet and lint pass.
Metadata coverage 92.1%, server 86.5%. Endpoint fixtures verify invalid logins,
provider failure, capacity/shutdown and exclusion of extra/credential-like fields.
Live browser checks verified emote/provider cards and a public nickname card.

### Preview preferences checkpoint

Restored `peek=0..3` (off, text, images, icons), `yt=0/1` and `lkico=0/1`
through settings, saved slots and shared URLs. Turning previews off suppresses
both public profile and link lookups; emote inspection remains available.
Text/icon modes omit large media; YouTube players require image mode and the
YouTube preference, and load only on selection. Preference changes dismiss an
open card and invalidate late responses. Link favicons use the original public
DuckDuckGo icon endpoint with no referrer and disappear on failure.

Validation: 189 frontend tests, strict TypeScript and production build pass.
Browser keyboard focus on retained chat verified a real nickname card including
public join date and retained-message count. FFZ detail links cover both current
`/emote/` and legacy `/emoticon/` CDN paths.

### OBS overlay and composer autohide checkpoint

`?overlay` supplies a transparent, full-viewport chat source with chrome, rails,
scrollbars and row action buttons hidden. Overlay mode is URL-specific and does
not overwrite the saved display/layout. `bauto=0..2` restores normal, fade and
slim composer modes; bare `?bauto` means fade. Hover, input focus and an open
picker reveal the composer. Autohide is included in settings/slots/share URLs.

Validation: 190 frontend tests, strict TypeScript and production build pass.
Live browser computed styles verified transparent root/body/log, 800px chat
viewport, hidden header/rail and single-column presentation even with split=4.

### Picker hold+ checkpoint

Hold+ temporarily swaps picker animations to their still URLs while the pointer
is over the cell grid, and lends the same freeze to chat rows. It preserves the
saved animation preference and cell DOM, releases on pointer leave/close/rail
hide, and leaves an explicitly enabled freeze in place. Plain hold remains a
separate option; the still-only filter does not borrow a freeze.

Validation: 191 frontend tests, strict TypeScript and production build pass.
Fixtures cover temporary URL swaps without cell replacement and saved freeze
surviving the hold+ release.

### Picker use lighting checkpoint

Live, deduplicated emote/emoji uses flash matching picker cells for 3.6 seconds,
stepping the original hue wheel. The colour wash remains while a matching chat
row intersects the visible log, then releases once its last visible copy leaves.
Virtual row replacement, scrolling and picker rebuilds recompute visibility;
feedback does not reorder or replace held cells. Replay does not flash cells.
Transient colours are bounded and are never persisted as use history.

Validation: 192 frontend tests, strict TypeScript and production build pass.
A viewport fixture verifies flash expiry independently of the visible-row wash
and its release after the row scrolls out.

### StreamElements picker seeds checkpoint

Go now loads the original public StreamElements channel stats endpoint alongside
emote/stream providers, with the shared bounded cache, timeout and fetch capacity.
Only validated, bounded, safe-integer emote totals are forwarded. Partial failure
leaves the other metadata available. Picker order adds lifetime seeds to local
counts only after comparing real last-use timestamps; seeds neither set a use
stamp nor qualify an emote for seen-only mode. Refresh replaces the baseline
rather than accumulating it, and local live observations retain precedence.

Validation: 194 frontend tests/build; Go race/coverage, vet and lint pass.
Metadata coverage 91.4%, server 86.5%. Current public endpoint returned the
expected provider lists and counts. Fixtures cover merging, malformed/negative/
unsafe totals, cached channel loading and seed ordering without fabricated use.

### Picker URL sharing and age layouts checkpoint

Restored the original picker URL aliases for names, zoom, use/A-Z/seen order,
provider filters, mixed grids, hold, animation/stills, open state and geometry.
Display Share now includes the actual picker settings and fitted floating box.
`eptabs=none` and `epmarkers=0` also preserve the rebuild's explicit empty-filter
and marker-off choices. Geometry validates before viewport fitting; an explicit
URL open/close overrides the saved state.

Age squares now flow inline, begin a new row per era, or end rows at their last
square (`epage=0..2`); resizing remeasures the latter. Pending thresholds carry
violet borders and thresholds crossed during an open session carry gold.
Provider sections in use order follow their freshest observation.

Validation: 197 frontend tests and production build pass. URL fixtures verify
filter/animation round trips and invalid geometry. Browser confirmed an 876x625
pinned picker fitted to x392/y159 in 1280x800, BTTV/FFZ-only filters, frozen
animations, row mode 2 and matching shared geometry. Picker reorder animation,
age-gap markings and exhaustive visual comparison remain open.

### Links-only view and stream-bar preference checkpoint

Settings and shared URLs support links-only chat (`links=1`) and hiding the
stream bar (`stitle=0`). Links-only mode shows the first retained post for each
normalized set of links; filter decisions occur before virtual layout. Its
fingerprint cache follows message lifetime and its seen set is bounded.
Restored the original bare-domain allowlist as HTTPS links, preserving adjacent
punctuation and excluding email addresses. URL tracking is removed, host aliases
normalize for duplicates, and case-sensitive paths/IDs remain distinct.

Validation: 198 frontend tests/build pass. Fixtures cover bare domains, email
exclusion, tracking/host normalization and preserving YouTube ID case.

### Picker reorder motion checkpoint

Picker rebuilds now slide existing cells from their old positions over 350ms
with the original easing. Recent copies and main-grid copies retain separate
positions. Inline age markers move with cells; row-layout markers stay still.
Layout reads finish before animations begin, held updates remain deferred, and
scroll restoration precedes measurement. Reduced-motion skips the slides.
Finished animations release their tracking entries; close, rail hide and shutdown
cancel active slides.

Validation: 201 frontend tests, strict TypeScript and production build pass.
Regression fixtures cover moved and unchanged cells, duplicate copies, inline
versus row age markers, reduced-motion and cancellation. Browser search with
live metadata started 150 animations at 350ms, settled to zero, and closing
cancelled all active animations without desktop horizontal overflow. Age-gap
markings and exhaustive picker comparison remain open.

### Picker interruption-age checkpoint

Age markers now disclose incomplete usage when a connection interruption or
closed-page interval overlaps more than 30 seconds or one eighth of that age
window, matching the original threshold. Purple dotted markers explain the gap
in their tooltip and accessible label. They update while the grid is held without
replacing cells. Short reloads do not trigger the incomplete-window treatment.

Coverage persists per channel in the rebuild namespace, with validated timestamps
and at most 50 windows covering the 12-hour ladder. Excess windows merge
conservatively. Existing records without coverage timestamps remain readable.
Gold now derives from the freshest eligible crossing in this page session,
including time with the picker closed; crossings during an interruption cannot
earn gold. Backfill does not claim to restore complete usage coverage.

Validation: 207 frontend tests, strict TypeScript and production build pass.
Fixtures cover overlap boundaries, active interruptions, reload restoration,
channel isolation, invalid storage, bounded retention, held-marker updates and
gold crossing changes. A browser fixture rendered a saved closed-page gap as a
purple dotted 2m marker with the accessible explanation, without gold or desktop
horizontal overflow. Exhaustive picker visual comparison remains open.

### Rail divider and column hover checkpoint

The docked emote/statistics divider now trades their available area proportionally,
bounded to 8–92%. Pointer capture supports drag, with cancellation on mode change;
Up/Down and Home/End provide keyboard adjustment. The validated proportion saves
in the rebuild namespace. Floating a pane hides the divider and restores its
original flex style. Short rails retain a scrollable 500px combined pane area
under video so the divider still changes actual pane sizes. Stats shed lists below
240px and retain the graph below 160px.

Hover pause now holds only the column containing the hovered message row.
Empty column space keeps following. Leaving resumes a previously following column;
wheel/touch scrolling stays paused until the reader scrolls to live or selects
Latest. Each virtual column retains this state across incoming updates, and
Latest resumes every column.

Validation: 210 frontend tests, strict TypeScript and production build pass.
Fixtures cover divider bounds, saved proportions, floating restoration, local
hover state, deliberate scroll and Latest. Browser keyboard resize changed actual
pane heights from 40/460px to 460/40px without horizontal overflow. Browser hover
held scrollTop at 2900px during new rows and advanced to 3060px on leave. Broad
layout transition and live account acceptance gates remain open.

### Live authentication acceptance blocker

The October 11 continuation restored the local Go service after the T3 restart.
Its session endpoint reports login enabled, no signed-in session, and the login
URL `https://chat.subcult.tv/api/auth/login`. The configured public origin's
`/api/auth/session` rendered `not found` in the browser. It therefore cannot
complete acceptance against this local build through the registered public
callback. A registered local callback or a separate routed preview origin is
required before real consent, sending, account emotes, whisper and moderator
acceptance. Public cutover remains separate from this verification step.

Go race/coverage tests and vet passed again. No live Twitch message or moderation
action was performed.

The local development callback instructions were corrected to the literal
`http://localhost:8080/api/auth/callback`, which Twitch's own CLI documentation
uses for its HTTP development exception. The local process now uses
`CHATTHING_PUBLIC_URL=http://localhost:8080` without changing the credential file
or public service. Session and authorization-redirect checks confirm that host
and callback. Console registration and real consent are still pending.

### Owner-authorized live testing deployment

After the owner registered the local callback, Twitch reached its login form but
rejected the preview browser as unsupported. The owner authorized public testing.
Release `20261011T232722Z` is now on NUC behind Almaz at https://chat.subcult.tv.
The public browser rendered live chat; health, auth-session, source download and
the registered public OAuth callback were checked. Real consent, sending and
full parity acceptance remain pending. See [deployment evidence and rollback](live-testing-deployment.md).

The owner subsequently confirmed that public login worked in their regular
browser. This is owner-confirmed login/consent evidence; logout, expiry recovery,
real sending, account entitlements and moderator/whisper acceptance remain open.

### Rate-graph connection gaps checkpoint

Header and statistics graphs now shade time bins that intersect a recorded
connection interruption. Accessible labels and band tooltips disclose incomplete
observation, while recovered message counts remain visible. Structured local gap
notices retain the start time on reconnect, so end evidence remains useful after
start-row eviction. A saved open interruption closes when the reloaded page
connects. Gap flags apply to the shared connection across selected channels and
are independent of excluded chatter names.

Validation: 214 frontend tests and strict production build pass. Fixtures cover
open/closed intervals, exact bin boundaries, zero-length gaps, eviction,
duplicates, invalid evidence and reload closure. A browser fixture marked ten
one-second bins for a ten-second interruption, with the incomplete-count label.
Older notices without structured gap tags are not upgraded into invented data.
Closed-page periods without an interruption notice and quiet-gap/burst graph
behavior remain separate acceptance work. This change is locally verified and
has not yet replaced the public frontend.

### Provider preview checkpoint

GitHub repository and Hacker News item links now use their public metadata APIs
before falling back to HTML previews. GitHub cards include repository descriptions
and star counts; Hacker News cards include scores, comments and linked domains.
Provider responses are bounded, checked against the requested identity and cached
for ten minutes. Failed, malformed, deleted or mismatched results fall back to the
existing public-address-checked HTML fetch.

Validation: preview race tests pass with 95.2% coverage and golangci-lint reports
no issues. Live local API checks returned both provider cards. These backend
changes are local and have not replaced the public release.

### Approved sending destination and browser access blocker

The owner approved `patrick__eff` for one visible `Chatty Cat parity test` message
and a reply. No message has been sent. The public T3 preview session reports
authentication enabled but unauthenticated. The regular-browser automation
inventory contains no connected browser, so the owner's working authenticated
session cannot be used for this acceptance test. Sending and reply acceptance
remain blocked on access to that session or owner-run testing.

The owner subsequently reported completing the test. The independent public
preview observed `Chatty Cat parity test` from `patrick__eff`, message ID
`c5f19012-99a1-474f-bc58-f307f809adcd`, at 2026-10-11T23:53:18.164Z.
It rendered the broadcaster/subscriber badges, name color and reply control.
This verifies live delivery and rendering of the parent message. The reply has
not yet been independently observed; local-echo adoption and error behavior are
still separate acceptance checks.

The owner explicitly confirmed that the reply appeared after sending it through
the rebuild. Sending and replying are therefore owner-confirmed live acceptance;
the independent observer verified the parent delivery only.

### Wikipedia, YouTube and rate detail checkpoint

Wikipedia article links now load public REST summaries and safe thumbnails,
including encoded Unicode/subpage titles. Same-wiki canonical redirects are
disclosed by the preview. YouTube watch, short, live, embedded and music-video
links load public oEmbed titles, authors and thumbnails. Returned embed HTML is
discarded; the existing player remains opt-in with autoplay disabled. Unsupported
routes, missing metadata and provider errors retain the HTML fallback. Both
providers use the existing bounded public-address-checked client and ten-minute
cache. Endpoint reference: [Wikimedia REST API](https://www.mediawiki.org/wiki/Wikimedia_REST_API/en).

The header now covers four minutes with one-second bins of five-second rolling
message rates, clock-aligned ten-second/minute ticks, a current five-second rate
and last-hour chatter count. Statistics list up to three distinct bursts at
4+ messages/s, using the original ten-second separation and thirty-second
sustained-peak suppression. Scoped/excluded/deduplicated messages determine
rankings, and recorded observation gaps exclude incomplete burst windows.

Per-channel observation timestamps now record closed/inactive page intervals
on reload, separately from the age of the last chat message. Ten-second heartbeats
and a pagehide save retain observation through quiet chat. Valid gaps longer
than thirty seconds produce a local notice and violet graph bands; a recent
heartbeat from another tab prevents a false closure. Storage failure does not
block live chat. Older periods without observation timestamps remain unknown.

Validation: 229 frontend tests and strict production build pass; full Go race
tests, vet and golangci-lint pass, with preview coverage at 96.1%. Live local
requests returned Wikipedia's Earth summary and a YouTube video title/author/
thumbnail. A browser fixture rendered a 5.0 messages/s burst. The built browser
rendered a closed-page notice with violet bands, 240 rate bars and 24 clock ticks,
with no horizontal overflow at 1280px. These changes are local, not deployed.

Still open in these families: quiet-gap and glorp-specific graph marks, fully
recovered-gap proof, session-long rate samples beyond retained chat, YouTube
channel/playlist cards and view/publication enrichment, and remaining provider
adapters. Broader parity gates remain unchecked.

### Updated live preview

The above continuation is now deployed as release `20261012T000818Z`, with
frontend revision `20261012T001230Z`. The public browser loaded the new bundle,
connected to chat and returned provider cards. Its footer's source archive
matches the staged SHA-256. The previous release and frontend snapshot are
retained for rollback. The backend activation invalidated old in-memory sessions;
the final frontend correction preserved the running process. Narrow local layout
was also checked at 375×812 without horizontal overflow.

Account emotes, logout/expiry, whisper and moderation acceptance still require
the owner's authenticated session. Browser automation has no access to that
regular-browser session; this is a live-acceptance blocker, not evidence that
the remaining implementation gates have passed.

### Native Twitch video fix and account-emote acceptance

The owner confirmed subscriber emotes appear in both the signed-in live picker
and autocomplete. This is owner-confirmed account-entitlement acceptance.

The owner then reported failure loading `player.twitch.tv/js/embed/v1.js`.
Video now uses Twitch's official direct iframe and built-in playback, audio and
quality controls. The separate SDK script and duplicate controls were removed.
The parent host is retained, autoplay is off, saved channel/mute/docking/geometry
preferences remain, and closing or hiding the rail removes the frame to stop
playback. Narrow screens retain the external Twitch link.

Validation: 231 frontend tests and strict build pass. Public frontend revision
`20261012T002528Z` loaded the official iframe at 662×396px, with zero SDK script
requests. Clicking its native Play button displayed live HasanAbi video and
1080p60 quality. Closing the panel left no video frame. Audio was not independently
heard. The public source archive matches the staged hash. The frontend update
retained backend PID 3277827 and existing authenticated sessions.

### Standalone repository and public Twitch metadata checkpoint

The owner moved conversion work to the standalone `rebuild/` Git repository
(`chatty-cat`) and created its `init` baseline on 2026-10-11. Earlier chronological
checkpoint entries describe work from the former parent repository. Subsequent
commits use this standalone repository; the original source remains alongside it.
The module path now matches the Gitea repository, and AGPL license/attribution
and current run instructions are included. The resource generator accepts an
explicit original HTML path and writes into this repository.

Public Twitch reads use an allowlisted GET helper and a separate in-memory app
token. Token acquisition coalesces, validates client binding, rejects a user token,
revalidates before reuse after 30 minutes and refreshes once on explicit 401.
Credential rejection has a one-minute cooldown; shutdown cancels reads.
No app credentials or raw token responses are forwarded to the browser.

The original relay's GraphQL VOD lookup is replaced by documented Helix archive
reads. Returned channel ID, duration, type, timestamp and video ID are validated;
latest archive links appear in the stream bar. Public global/channel emote
catalogs add native precedence and animated/still URLs for anonymous viewing.
Helix user lookup can recover the channel ID if the public IVR lookup fails.
Public catalog visibility does not imply subscriber entitlement to send an emote.

Validation: 199 frontend tests/build; Go race/coverage, vet and lint pass. Auth
coverage 87.3%, metadata 90.2%, server 86.3%. Live reads verified the configured
app credentials, a real latest VOD and 357 native emotes (14 animated).
Fixtures cover shared token acquisition, credential mismatch/revocation cooldown,
once-only read retry, VOD validation and native precedence. Stream-history
statistics and complete live account acceptance remain open.

### Observed rate timeline checkpoint

The header now tracks arrival-time live messages separately from retained chat,
with a rolling five-second messages/second rate, glorp/F markers and time ticks.
Replay and hydration do not add live traffic. Channel-scoped snapshots retain
24 hours of aggregate counts in IndexedDB; scope keys and outage history are
bounded. Closed-page, socket and timer gaps stay distinct from observed silence.
The statistics panel lists observed peaks from the last 30 minutes.

Validation: 204 frontend tests and strict production build pass. Fixtures cover
deduplication, channel isolation, replay exclusion, outage bands, malformed
snapshots and startup overlap. Browser verification observed the live graph and
its persisted aggregate snapshot (27 occupied seconds at the first save).
Complete burst statistics, backfilled-band reconciliation and visual parity
remain open.

### Glorp and distinct burst statistics checkpoint

Statistics now count glorp/F messages and top glorpers within the selected
retained-message window, channel and exclusions. Link-domain counts use the
same bare-domain parser as chat. Observed rate peaks cover the recorded 24-hour
aggregate history, selecting three distinct bursts with the original 10-second
suppression and 30-second similar-rate rule. Glorp spikes rank separately above
two per second. Channel-scoped bursts link their UTC day in the public chat logs.

Validation: 207 frontend tests; production build and targeted fixtures pass.
Browser verification confirmed the tally, separate burst/spike sections and
channel/day links. Earlier saved rate samples survived reload. Emote source
windows, grouped badge reference and full session counters remain open.

### Picker movement and ordering reset checkpoint

Picker rebuilds animate matching emote cells from their previous positions over
220 ms. Duplicate recent/home cells retain separate positions; inline age squares
participate while separate age rows do not. Destination measurements are batched,
movement is bounded and previous animations are canceled. System reduced motion
and disabled app motion suppress slides. Existing hover hold still prevents
automatic grid replacement.

Reset order clears recorded local usage and age-crossing state for the current
channel, preserving catalog, recents and channel usage seeds. The button and
original middle-click shortcut both persist the reset. Retained-message statistics
remain separate.

Validation: 211 frontend tests and strict production build pass. Fixtures cover
repeated-cell positions, motion suppression, reset persistence and both controls.
Browser verification observed 220 ms picker animations and reset followed by
new live usage. Full age-gap packing and preset integration remain open.

### Broadcaster and account commands checkpoint

Added /raid, /unraid, /mod, /unmod, /vip, /unvip, /block, /unblock and /shoutout
through documented Helix APIs. Login requests their scopes, and session responses
expose only the granted permission names. The actor always comes from the
server-held session. Broadcaster-only commands reject a different selected
channel before mutation. Targets resolve by validated login; self-targeting,
missing targets and missing scopes fail before mutation.

Raids require a valid pending-raid confirmation and the composer reports a
request rather than completed delivery. Other new commands require the specified
204 response. Explicit 422/425 role rejections remain confirmed failures;
unexpected successes remain uncertain and are not automatically retried.
Help lists the commands and account requirements.

Reference: https://dev.twitch.tv/docs/api/reference/ (raid, moderator/VIP,
user block and shoutout endpoints checked 2026-10-11).
Validation: Go race tests, vet and lint pass; auth coverage 87.8%. All 212 frontend
tests and production build pass with one test worker. The large fake IndexedDB
fixture timed out at five seconds under parallel load and passed in isolation
and in the serial full suite. Fixtures check exact HTTP/query bindings,
ownership, scopes, self/missing targets and malformed/unexpected confirmations.
No live role, raid, block or shoutout mutation was performed; account acceptance
remains a release gate.

### Docked rail pane divider checkpoint

Mode 4 includes a horizontal separator between docked emotes and statistics.
Dragging or Arrow Up/Down adjusts their shared height; Shift uses larger steps
and Home/End select bounded extremes. The ratio persists and ARIA exposes its
value. Floating either pane or leaving the combined rail hides the separator.
Restored floating panels regain their original flex sizing. Dock order keeps
emotes above statistics when either returns.

Validation: 213 frontend tests and production build pass. Fixtures check docking,
restoration, bounds, keyboard adjustment and saved ratio. Browser verification
with video floated changed the pane heights from 80/302 to 302/80 pixels. A short
rail with docked video retains minimum pane heights and scrolls rather than
claiming the entire layout can fit. Responsive minimum-height behavior and
column-local hover pause remain open.

### Inline image links and GIF-title fallback checkpoint

Public HTTPS image links now show a bounded lazy image beside the readable URL,
with no-referrer requests and a URL fallback if loading fails. Giphy page links
resolve recognized IDs, and gifv links use their GIF form. Page anchors ending in
an image filename remain pages; credentialed, local/numeric-host and non-HTTPS
image loads are excluded. Native bracketed GIF-title posts produce safe Giphy
search links, normalizing the original GIF-by connector and retaining their label.

Validation: 217 frontend tests and production build pass. Fixtures cover URL/ID
recognition, anchors, unsafe media URLs, lazy/error fallback, title normalization,
query bounds and escaping. Giphy assets bypass service-worker media caching;
activation removes earlier Giphy entries from that optional cache.

GIF-title search resolution remains a compatibility dependency. Current Giphy
API documentation requires direct client requests and does not allow media URL
or asset caching without specific approval. The original relay uses a shared
upstream integration key, proxy and persistent caches. This conversion needs its
own integration configuration and a confirmed supported caching approach before
claiming that behavior as parity. Independent conversion work continues.
Reference: https://developers.giphy.com/docs/api/#best-practices and
https://developers.giphy.com/docs/api/endpoint/#search (checked 2026-10-11).

### Column-local message hover pause checkpoint

Hover pause now engages over actual message rows and applies to the column under
the pointer. Empty column space does not pause. Other columns continue live
pagination; page rotation avoids overwriting the held column. Leaving a row or
disabling pause restores its follow state. Keyboard reveal clears the hover hold.
The former outer-log hover guard no longer pauses every column at once.

Validation: 218 frontend tests and strict production build pass. Fixtures cover
column isolation, continued updates, empty space and disabling pause. Browser
verification held the middle column's scroll position and tail message while a
different column's tail advanced on the live Twitch stream. Deliberate manual
scroll navigation still uses the existing global follow state; independently
retaining manual scroll positions in each column remains open.

### X/Twitter inline card checkpoint

Recognized public status links use a fixed FxTwitter status endpoint with the
shared preview request budget, cache and fetch capacity. Responses validate the
requested ID and author, bound payloads and normalize plain text, dates, quoted
text and up to four photos/videos. Media uses approved Twitter CDN hosts; raw
upstream HTML is never forwarded. Successes cache for ten minutes and failures
for one minute. Cancellation retains its context error.

Visible rows show up to four distinct cards and coalesce repeated URLs. Preview
modes control text/images, and disabled previews remove cards on later mounts.
Players load only on selection, in sandboxed no-referrer frames without autoplay,
with an original media link fallback. Unavailable posts retain readable links.

Validation: 223 frontend tests and strict production build pass; the additional
multi-post/coalescing fixture passes. Go race/coverage, vet and lint pass, with
preview coverage 95.0%. Live service and browser reads rendered the public
jack/status/20 post while chat remained connected. An unavailable public sample
returned the expected failure and retained its URL. Quoted media and player
controls are fixture-verified; actual video playback is not yet verified.
Nitter selection, profile routing and external quoted-media thumbnails remain
open. Reference: https://github.com/FxEmbed/FxEmbed/wiki/Status-Fetch-API
(checked 2026-10-11).

### Independent manual column holds and picker gap checkpoint

Manual scrolling in a page layout now holds that column while other pages
continue live. Page dealing and rotation preserve held pages, including reverse
layouts; holding every column stops page replacement. Returning a column to its
live edge releases its hold, and Jump to live releases all holds and redeals the
newest retained data. Explicit global history/navigation pauses remain global.

Picker age markers now share the rate timeline's socket, timer, closed-page and
unobserved windows. A missing overlap must exceed 30 seconds or one eighth of
the age window before dimming the rung, matching the original threshold. Grouped
provider grids defer pending thresholds to one shared tail.

Validation: 230 frontend tests and strict production build pass. Fixtures cover
held/active/all-held pages, reverse updates, release, observation windows and
shared pending markers. Browser verification retained exactly the same visible
row and -10.796875px offset while another column's tail advanced; Jump to live
restored the column edges and hid its button. Picker gap visuals are fixture
verified. Full keyboard focus isolation and age-square packing remain open.

### Inline YouTube metadata and stable player checkpoint

Public YouTube watch, short, live, embed and music links now use a fixed oEmbed
endpoint for normalized title/channel/thumbnail cards. The shared preview cache,
request budget, response bound and public-network restrictions apply. Upstream
HTML is discarded. Unavailable metadata leaves the readable link and play control.

Inline glyphs and thumbnails load a YouTube player only on selection, preserving
validated start offsets with autoplay disabled. The control toggles the player,
and disabling YouTube removes open inline players. Fossabot's Fear&/HasanAbi
Gaming card suppression follows the original rule. Virtual updates preserve
unchanged row subtrees instead of detaching every row, so open media survives
ordinary live append/viewport changes; unmounted rows still release players.
Column scroll paints notify the media controller when older rows mount.

Validation: 233 frontend tests and strict production build pass. Go race/coverage,
vet and lint pass; preview coverage 93.6%. Fixtures verify URL/time handling,
bounded malformed upstream responses, explicit player loading/closing, disabled
preferences and unchanged subtree retention. DOM tests disable child-frame
network navigation. Live Go and browser reads displayed a Google for Developers
video title/channel card and selected a 560x315 player with start=90 and autoplay=0
while chat stayed connected. This proves creation and configuration, not playback
or audibility. YouTube view/date enrichment and channel/playlist cards remain
open. Reference: https://developers.google.com/youtube/player_parameters
(checked 2026-10-11).

### Retained aggregate rankings and independent windows checkpoint

Top chatters, emotes, badge versions and normalized links now retain aggregate
totals separately from scrollback. Each family has its own all/24/12/6/3/1-hour
control; emotes can instead use the channel's StreamElements totals. Channel
scope and windows persist. Chatters exclude the original two bots and selected
logins; link rankings omit the original evergreen promotions. Case-sensitive
URL paths survive normalization, and repeated URLs/badge versions count once
per message while repeated emotes count each use.

Hour buckets retain seven days and day buckets 31 days; lifetime totals remain.
Snapshots restore atomically after validation, retain bounded message-ID dedup
and preserve unfinished emote classification for retained/archive rows until
metadata returns. Saving occurs every 30 seconds and on pagehide. Capacity and
storage failures are disclosed, with limits of 20,000 aggregate keys, 200,000
buckets and 100,000 dedup/pending entries. The initial migration seeds available
retained messages; it cannot recover counts for previously unobserved rows.
The existing summary/time graph remains explicitly based on retained rows.

Validation: 240 frontend tests and strict production build pass. Fixtures cover
windows, channel isolation, duplicate links/badges/emotes, malformed snapshot
rejection, bucket pruning, reload dedup after row eviction, delayed catalog
classification and storage failure. Browser verification showed independent
controls, current provider seed rankings, and preserved start time/window choice
on reload (1,357 then 1,394 persisted message uses as live traffic continued).
Grouped badge reference, complete daily/hourly presentation, rate scope controls
and stream/viewer histories remain open.

### Self-hosting package checkpoint

A multi-stage Dockerfile builds the TypeScript frontend and static Go service
into one image with CA certificates, timezone data, license and attribution.
The app runs as UID 10001; Compose uses a read-only root filesystem, dropped
capabilities, bounded temporary storage and loopback publishing. Named runtime
configuration supplies Twitch credentials and optional Giphy integration.
Environment files, Git history, local binaries and dependencies are excluded
from the build context. Optional Caddy HTTPS routing has container and host
examples, certificate volumes and a health dependency.

Deployment instructions cover callbacks, WebSocket routing, credential handling,
immutable release tags, rollback and source availability. The help panel links
the rebuilt source while retaining upstream credit. No cutover was performed.

Validation: Compose with/without HTTPS profile and both Caddy examples validate.
The Linux arm64 image built (about 8 MB), became healthy, served the built assets
and connected/rendered live HasanAbi messages at loopback port 18080. Inspection
confirmed UID 10001, a read-only root, license/static files, and absence of an
environment file or frontend dependencies. Its temporary container stopped and
was removed. Docker Desktop had been stopped, was started for these checks, and
was unavailable again during the separate amd64 build, which ended with an RPC
EOF. The Dockerfile uses native builder stages and target Go cross-compilation;
the amd64 image/runtime check remains open. Public TLS routing, real login and
production acceptance remain separate gates. Resource tests and strict frontend
build pass. References: https://docs.docker.com/reference/compose-file/services/,
https://caddyserver.com/docs/caddyfile/directives/reverse_proxy and
https://caddyserver.com/docs/quick-starts/https (checked 2026-10-11).

### Picker preset integration checkpoint

Theme presets now apply their picker fields on initial URL load and selection
in display settings. The old-default/default alias restores mixed grids, Hold+
and its fitted pinned geometry; Nightshade restores quarter-step zoom. Explicit
picker URL parameters override preset fields. Runtime selection updates controls
and saved options while retaining unspecified preferences. The original header
font follow sentinel in the Minimal preset maps to automatic header sizing.

Validation: the full frontend suite passed 247 tests and the strict production
build. Subsequent targeted picker/display checks passed 21 tests, including
preset/default aliases, explicit overrides, saved controls/pinning and header
follow sizing. Live preset verification could not run: T3 returned
"The calling provider no longer owns an active thread run." Concurrent edits
to statistics, Giphy and server configuration were preserved separately.
Complete settings-slot bundles and exhaustive preset visual comparison remain
open.

### Isolated integration of committed parity and branding

Integrated immutable commit `10f06b9` from the approved Chatty Cat branding branch,
including its committed settings-parity ancestry. Uncommitted work in both other
checkouts was inspected and left untouched. The merge retains the native Twitch
iframe, four provider adapters, picker coverage/motion, graph gap notices and
source download. It adds retained aggregate statistics, independent ranking
windows, persisted observed rate/glorp samples, inline YouTube/X cards, GIF
fallbacks, extra slash commands, picker presets and approved brand assets.

Conflicting implementations were reconciled by behavior: picker motion retains
region isolation and original easing; grouped pending ages appear once at the
tail; manual column holds coexist with virtual media-subtree retention; provider
errors keep their bounded fallback; the observed header remains at least four
minutes wide. Fixture and integration checks pass: 269 frontend tests, strict
production build, full Go race suite, vet and zero lint issues. The local built
app connected and rendered chat under the Chatty Cat identity. This integration
has not yet replaced the live release. Formal gates still require their final
acceptance evidence.

## History, channels, stream observations and lifecycle checkpoint

Verified on 2026-10-11 in the isolated parity worktree:

- Explicit legacy JSON import accepts original HTML history arrays, archived
  records and channel-keyed localStorage dumps. Detached parsing produces
  validated structured messages; scripts and embedded media are discarded.
  Preview reports valid/skipped counts before import. Structured JSON export
  preserves channel identity. Imports are bounded to 10 MB / 10,000 records,
  deduplicated, and flushed in batches without overwriting original files.
- Joined-channel links focus/add/remove rooms while retaining settings. Colored
  send chips use the composer's existing target/draft/reply lifecycle. Archive
  searches remain limited to joined rooms even with the All channels scope.
- Seven days of stream observations and 30 VOD records survive scrollback
  pruning. Stats show observed viewer peaks, title changes and live/offline
  samples; VOD links disclose start and end. Failed metadata creates no false
  offline observation. These records begin when this browser observes a stream.
- Deliberate wheel scrolling while hovering a message retains its manual hold.
  Rate graphs shade confirmed message gaps over 90 seconds, excluding socket,
  timer and unwatched periods. Historical samples retain that distinction.
- Runtime errors and rejected promises raise a dismissible, copyable local
  report. Reports render as text, omit URL queries/credential fields, aggregate
  repeated errors and send no external report.
- Required frontend checks pass: 283 tests across 56 files, strict TypeScript
  and production build. No backend sources changed after the integrated
  backend's race/vet/lint checks.
- Browser against the built Go preview: imported a legacy fixture and verified
  its IndexedDB archive entry; chat remained connected. At 375 x 812 the
  two-room header and composer had no horizontal overflow, and clicking the
  patrick__eff chip selected that destination without sending. A synthetic
  runtime error appeared with its query removed and dismissed correctly.

Owner acceptance: subscriber emotes appear in picker and autocomplete; the
approved test message and its reply appeared in patrick__eff. The owner accepts
Twitch's embed session limitation: application OAuth cannot supply the Twitch
website login to the official cross-origin player. Native player controls remain
in use. Live whisper and moderation acceptance still require separately approved
recipients/actions and an authenticated session.

## Complete settings-slot state checkpoint

Slots now store a versioned display/panel bundle: picker options and geometry,
resource tab and geometry, video channel/docking/visibility, stats scopes and
exclusions, and rail split/floated panes. Legacy display-only slots remain
readable. Optional parts are size-bounded, captured as detached JSON and validated
by each controller. Recall waits for display layout to settle; native Twitch
frames are replaced with autoplay disabled. Panel listeners are removed at
teardown. Other worktrees were read for existing settings work and left untouched.

Verification: 287 frontend tests, strict checking and production build pass.
Browser recall restored picker zoom from 1 to 1.5 and captured picker, resources,
video, stats and rail parts with no runtime error. Video regression verifies
channel/docking/visibility recall and autoplay=false.

The owner approved one whisper to subcult_tv and deletion of the original
Chatty Cat parity test message in patrick__eff. Approval is recorded; neither
live action has been performed in this checkpoint.

## Resources and repository metadata checkpoint

The curated resource port now preserves safe layout classes, author birth/death
fields, work sources and internal author citations. Author controls select all,
themes, works or names/life dates; area restores the original sections, while
birth/activity sorting deduplicates the flat list. Citations open Authors and
focus the matching entry. Responsive columns retain section labels. Resource
channel links gain bounded add/remove controls. Media-tab stream probes run two
requests at a time, cache successful observations for five minutes and cancel
when hidden; failed metadata stays unknown.

Help shows optional public metadata for the rebuild and upstream repositories.
The existing bounded preview service now reads Gitea repository metadata at the
owner's forge and preserves validated started/updated dates for both forges.
Metadata failure leaves source links usable and reports unavailable; no account
credential is sent to these public metadata requests.

Verification: frontend suite passed 289 tests, then the added repository test
and resource tests passed (290 total tests now present). Production build and
strict check passed. Full Go race tests, vet and golangci-lint passed. Browser
sorted 106 deduplicated authors by birth, selected names mode and confirmed
column layout. At 375 x 812 the popup fit in 351 pixels with no document overflow
or runtime error. These checks do not assert that every external curated URL is
currently reachable. The owner's forge returned HTTP 403 to a direct public
metadata probe; the unavailable fallback remains necessary.

## GIF lookup and mobile/permalink corrections

GIF title links can resolve the first GIPHY search result using the owner's
configured browser API key. Search is direct from the browser, keeps the exact
returned media URL and displays GIPHY attribution. The gifsafe URL/settings
option limits results to PG-13. Requests are spaced by at least 1.2 seconds,
limited to 80 per hour across reloads and paused for five minutes after 429.
Changing safe mode removes old results and discards pending unrestricted results.
Only request-budget timestamps persist; no GIPHY media URL or asset is cached.
This replaces the legacy cache/proxy behavior because current GIPHY requirements
prohibit it without approval: https://developers.giphy.com/docs/api/ .
Public configuration exposes only the browser GIPHY key, never Twitch secrets.

The browser fixture check also exposed two defects: a tall mobile header could
collapse chat, and estimated row heights could move a permalink target after
measurement. Small screens now have a bounded scrollable header and compact
controls; anonymous mode hides disabled sending fields. Obsolete migration
messages were removed. Navigation status sits above the workspace, preserving
chat width. Permalinks pin an archived context while live ingestion continues;
Jump to live clears the permalink and pending navigation. Virtual scroll anchors
use actual visible row geometry when available and restore after spacer updates.

Verification: 298 frontend tests pass; strict production build, full Go race
suite, vet and golangci-lint pass. The built browser at 375 x 812 found and retained
the imported GIF permalink, displayed an actual loaded GIF from the configured
key and preserved all 375 pixels of chat width. No Twitch message was sent by this
fixture check. Jump to live cleared mid and its navigation label. The private
temporary configuration file used by the isolated preview was removed afterward.

## Provider and Twitter-mirror continuation

Twitch channel cards use public profile/live observations. Clip and VOD cards
use the owner's server-only app credential through fixed Helix reads, preserving
creator/channel, view count, duration, date and thumbnail. Optional native player
loads use the official clip/VOD iframe endpoints, exact parent, minimum height,
and autoplay disabled. Narrow screens retain external links. Reference:
https://dev.twitch.tv/docs/embed/video-and-clips/ .

Reddit adapters parse bounded Atom feeds for posts, comment targets, subreddit
and user collections; HTML is reduced to text and validated public images.
Instagram/Imgur adapters preserve public metadata and direct MP4s when served,
with short media TTLs, thumbnail fallback for single Imgur images, and ordinary
link fallback after failures. No shared web-client credential from the original
worker was copied. Login walls, geo-blocking or absent public metadata can still
prevent a rich card. The fallback makes that limitation visible without stopping
chat; it does not assert that restricted metadata was retrieved.

Nitter selection reads the original public health tracker, rejects unsafe
origins, probes up to three candidates through the public-only HTTP client and
caches reachable selection for fifteen minutes. Browser links retain canonical
URLs for card retrieval. Without a reachable mirror, post URLs stay canonical
and profiles retain the original bird.makeup fallback. Source releases now retain
NOTICE alongside LICENSE. Replies can select messages in the archived context.

Verification: full frontend suite, strict production build, Go race suite, vet
and lint passed for this batch. Tests cover exact Twitch routes, fixed credential
paths, cached cards, native frames, signed MP4 preservation, unsafe video rejection,
Reddit comment selection, malformed-feed fallback, Imgur fallback and mirror
validation/probe caching. Real rich-card availability remains a live deployment
check; fixture coverage is not recorded as live provider success.

## Live whisper and moderation acceptance, 2026-10-11

The owner signed in to release `20261012T021500Z` and reported success notices
for `/w subcult_tv Chatty Cat parity test` and deletion of the approved parent
message `c5f19012-99a1-474f-bc58-f307f809adcd` in `patrick__eff`. The public
rebuild independently marked that message removed and received a `clearmsg`
notice reading “Message deleted” at 21:23:54 local time. The owner subsequently confirmed that the whisper arrived in `subcult_tv`.
Recipient receipt is owner-verified; deletion is also independently observed. No additional live sends or moderation actions were performed.

The stats panel now displays persisted UTC hour/day message buckets separately
from retained-row summaries and offers channel-scoped badge reference sets,
version ordering, lazy images and observed version counts. Expanded sets survive
refresh; refresh preserves keyboard focus inside the reference. History imports
are counted once with their original timestamps. Focused ledger and badge
regression checks cover scope, exclusions, reload, expiry, deduplication and safe
upstream labels.

## Remaining stats, public YouTube metadata and readiness checks

The stats browser check rendered 415 badge sets; expanding the subscriber set
loaded seven lazy images and retained focused summary across refresh. All 308
frontend tests pass. YouTube video cards retain oEmbed title/channel/thumbnail
when optional public-page enrichment fails. A two-second bounded page read adds
publication date and view count where exposed. Channel/playlist public page
cards use safe text/image metadata; no borrowed service key or private API is
used. Fixtures cover these paths, missing data and cached requests.

`/api/health` reports process liveness. `/api/ready` reports 503 while closing or
when the app shell is absent/empty, and 200 otherwise. Neither endpoint promises
Twitch/provider availability. Race tests cover missing assets, ready and closing.

An isolated incognito browser archive seeded 100,000 synthetic records locally,
without Twitch sends. The complete app restored all 100,000, mounted 35 rows and
showed the last fixture. Steady frames peaked at 18 ms. Initial restoration had a
279 ms task, so history observation now yields between 500-row batches and
honors cancellation. The follow-up full restoration kept 35 mounted rows and reported no buffered
long tasks (tasks of 50 ms or more). This is desktop synthetic-load evidence; it
does not claim identical performance on every device.

### Preset and shared URL completion

First visits and display reset now apply the original `nightshade` preset;
existing saved display settings remain authoritative. Header label controls and
preset link weights are restored. The original source sets `old-default.lbls=0`,
which differs from its README statement; the rebuild follows the source value.
Legacy `help=labels/both` flags still turn labels on unless `lbls` overrides.
Help visibility/tab aliases, bounded popup width and video off/dock/float now
apply from shared URLs and are emitted by the share control. Config/stats tabs
open the corresponding rebuild dialogs. Rainbow modes include pulse/flicker.

## Acceptance audit after the continuation

Checked family gates above now refer to the accumulated implementation, fixture
and browser evidence in this record, including owner-run account checks. Older
checkpoint statements describe their historical state. They are not current
blocker lists. Gates with unresolved platform behavior or full runtime coverage
remain open; checkbox status is the current acceptance record.

The latest local browser restored `htab=authors&hpw=900&video=off&lbls=0`,
selected Authors at 900 px, loaded no video iframe and emitted the same values
through Share settings. `/api/ready` returned ready. The complete checks passed
310 frontend tests before the additional video URL regression test; final totals
are recorded with the release below.

The owner confirmed actual recipient delivery to `subcult_tv`, completing the
approved whisper check. Final validation passed 311 frontend tests, strict
TypeScript/production build, full Go race tests, vet and lint.

### Optional native Twitch volume memory

The default iframe remains independent of the SDK. “Remember Twitch volume”
opts into Twitch's official JavaScript API while retaining native Twitch
controls. Failed script loading preserves the fallback frame; closing/changing
channel cancels delayed work and polling. Saved slots include the opt-in state.
Restoration pauses before setting sound preferences and keeps autoplay disabled.

Twitch ignored volume changes while muted during the browser check. Applying
volume between unmute/remute while paused restored 0.17 with mute=true and
paused=true on the HTTPS embed. The integrated local controller saved a 0.23
volume change. Initial checks accidentally used an offline channel; a current
live channel and the HTTPS origin resolved that ambiguity. Playback/audibility
are separate from these API state checks. Reference checked 2026-10-11:
https://dev.twitch.tv/docs/embed/video-and-clips/ .

The source-bearing Linux amd64 container built successfully on NUC and reached
healthy status with zero restarts, UID/GID 10001, a ready response and a readable
corresponding source archive. The isolated test container was stopped; the live
native service remained running throughout.

A Settings → Test alerts control now exercises the configured sound and
notification paths without sending a Twitch message. It requests permission
only when notifications are enabled, and reports unavailable browser support.
Audibility and OS notification appearance remain owner-browser acceptance.

Final frontend validation: 315 tests and strict production build passed. The
remaining acceptance gates are GIPHY's approved cache/proxy boundary and owner
confirmation of audible/OS alerts. GIPHY lookup itself, safe mode, request bounds,
provider URL validation and pronouns already pass; the original media cache and
proxy cannot be reproduced under current provider rules without approval.

A final layout audit found rail modes 4–6 incorrectly creating two chat columns.
They now retain one chat column; page-flip modes 2/3 alone create multiple chat
columns. A regression check covers desktop and portrait. The same distinction
applies when the rail is hidden on narrow screens.
