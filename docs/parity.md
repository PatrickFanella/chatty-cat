# Feature parity acceptance checklist

Source reference: root `index.html`, `README.md`, `sw.js`, `manifest.json`, and
`twitch-chat-relay/index.html` / `linkpeek-worker.js` inspected on 2026-10-11.
README claims require code/runtime verification; copying a claim is not evidence
that it works on Twitch today.

Every item below is a release gate. Check items only after the rebuilt behavior
has been compared to the original and the evidence recorded. This initial
checkpoint has no completed feature-family parity gates.

## Chat and recovery

- [ ] Anonymous viewing and optional authenticated chat; connected/reconnecting
  status and meaningful failures.
- [ ] Up to six merged channels; focus, channel chips, send target, stream video,
  per-channel storage and channel switching/add/remove links.
- [ ] Timestamps, display names, readable user colors, badge icons/fallbacks,
  subscription/bit/first-message chips and clickable name behavior.
- [ ] Quoted replies, parent jump, pending reply and permalink `?mid=` behavior.
- [ ] `/me`, commands, tags and notice/subscription/raid/gift rendering.
- [ ] ROOMSTATE/USERSTATE/GLOBALUSERSTATE; slow mode, followers/sub-only state,
  own timeout/ban countdown and moderator/VIP exceptions.
- [ ] CLEARMSG, user timeout/ban ghosting and room-wide clear behavior.
- [ ] Live-message/backfill deduplication including local echoes and notices;
  suspend, hidden tab, discarded page, restart and reconnect gap markers.
- [ ] Scroll follow, pause-on-hover, jump-to-live controls, bounded background
  queues and selectable 250–100,000-row scrollback without blocking the UI.

## Authentication and input

- [ ] New registered Twitch app; login, logout, expired-token recovery and
  retained channel context through OAuth.
- [ ] Sending and replies; immediate local echo adopted by the server message;
  rejection/slow-mode/follower-only notices.
- [ ] Supported slash commands and moderator timeout/ban/delete controls,
  validated against current Twitch interfaces and account permissions.
- [ ] Autogrowing composer, Enter/Shift+Enter, send button, message-length
  warning and cap, focus behavior and reply cancellation.
- [ ] Nickname and emote completion, picker insertion and keyboard selection.
- [ ] Draft and sent-message history with up/down traversal and per-channel
  persistence.
- [ ] Whisper pane, unread indicator, scopes and send behavior where currently
  supported; resolve original relay's `jtv` send restriction explicitly.

## Emotes and picker

- [ ] Native Twitch emote ranges including Unicode indexing; animation/static
  fallback, cheer emotes and subscriber emote sets.
- [ ] 7TV/BTTV/FFZ globals and channel sets, precedence, case handling, animation
  and zero-width stacking.
- [ ] Emote-only enlargement modes and provider-aware hover cards.
- [ ] Searchable provider/emoji picker; enabled tabs, deduplication, mixed mode,
  recent-use row, alphabetical/usage ordering and animated/still filters.
- [ ] StreamElements seeds, live usage updates, age markers, recent pinning,
  reorder animation, use flashes, hold/hold+, pause and name overlays.
- [ ] Zoom, era-row modes, pinning, dragging, resize and saved geometry/options.

## Stats, stream and media

- [ ] Header message-rate graph, time windows, bursts, gaps, chatter count and
  graph-minimized/header options.
- [ ] Stream uptime, viewers, title, last broadcast/VOD start/end and histories.
- [ ] Stats panel: user/emote/badge/link usage, time scopes, ordering, exclusions,
  per-day/hour buckets and retained samples.
- [ ] Twitch video: parent-domain configuration, volume, visibility, movable/
  resizable overlay, dock/rail modes and saved geometry.
- [ ] URL rendering/cleaning, bot-specific formatting, link icons, media cards,
  direct playable media, YouTube embeds and restored-media autoplay behavior.
- [ ] X/Twitter preview cards, quoted media, Nitter selection and graceful failure.
- [ ] Generic hover previews and provider-specific worker behavior; redirect
  disclosure, TTL, timeouts, cached failures and unsafe-destination rejection.
- [ ] GIF title lookup, safe mode, limits and cache behavior; pronouns.

## Display and resources

- [ ] Every preset and its aliases, palettes, shade axis, fonts, size, weight,
  spacing, line/zebra levels, nick effects, shadows and motion options.
- [ ] Multi-column page-flip layouts and rail configurations, reverse order,
  docking, resizing and preserved scroll positions.
- [ ] Help/configuration popup, tabs, resource lists, authors, media, left/libre
  links, channel links, tooltips and repository metadata.
- [ ] Help and picker drag/resize/pin geometry; header labels/minimization,
  settings slots, reset behavior and copy/share settings URL.
- [ ] Keyword/blocked-word filters, hidden-user modes, bot visibility,
  own-name/keyword mentions, unread badges, sound and notifications.
- [ ] All documented URL options, precedence, aliases and settings serialization.

## Storage, accessibility and lifecycle

- [ ] Structured local history, reload persistence and safe schema upgrades;
  explicit compatible legacy import and recovery without overwriting originals.
- [ ] IndexedDB archive search, retention/pruning/cap and live search navigation.
- [ ] Cross-tab option/login sync and sent-message BroadcastChannel echoes.
- [ ] Screen-reader announcements excluding replay, landmarks, dialog semantics,
  keyboard navigation, focus, labels and reduced-motion behavior.
- [ ] PWA manifest/icons/install state, shell/fonts/image caching and offline
  banner/history without implying offline live chat.
- [ ] Update detection, reload cache behavior, error reporting and lifecycle
  handling including back/forward cache and long background/suspend periods.
- [ ] Self-hosted HTTPS deployment, graceful shutdown, health/readiness,
  bounded connections/caches, request limits and monitoring.
- [ ] Owner-controlled credentials/endpoints and attribution; analytics/presence
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
