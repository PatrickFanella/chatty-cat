# Chatterino 2.5.6 coverage audit

Audit [#5](https://git.subcult.tv/subculture-collective/chatty-cat/issues/5) is complete as an inventory and adoption plan. **Chatterino parity is not complete.** Existing Twitch chat, original-app settings, archive and media behavior remain the baseline; the roadmap still contains missing Chatterino workflows and controls.

Reviewed 2026-10-12 against Chatty Cat `8501a49a826e9b26be9ddb0b6be676d80a887ddc` (main including merged parity PR [#2](https://git.subcult.tv/subculture-collective/chatty-cat/issues/2) and roadmap PR [#39](https://git.subcult.tv/subculture-collective/chatty-cat/issues/39)). This audit changes documentation and adds an inventory checker; it changes no runtime code or deployment.

The M5 declaration review below was refreshed on October 13 against merged `27174e7` (PRs #113–#118). Earlier matrix/demo evidence retains its original revision and date; it does not establish current production acceptance. The CSV's M5 entries now distinguish delivered adaptations from exact upstream controls that remain missing.

## Reference and scope

The immutable upstream reference is [commit 5921016f36ecc94afa2f0bf303e08c596d4e85fe](https://github.com/Chatterino/chatterino2/tree/5921016f36ecc94afa2f0bf303e08c596d4e85fe), resolved from annotated tag `v2.5.6`. [Source metadata](chatterino-source.json) records the tag object and SHA-256 hashes. Upstream identifiers and binding facts come from MIT-licensed Chatterino source; this report adds our own coverage assessment and acceptance requirements.

The [declaration inventory](chatterino-coverage.csv) accounts for:

| Surface | Audited declarations |
| --- | ---: |
| Settings.hpp active setting paths, including private collections and platform conditions | 264 |
| Built-in command registrations and `/w` / `.w` aliases | 90 |
| Hotkey actions, qualified by popup/split/input/window category | 69 |
| Default hotkey declarations, including binding expressions | 56 |
| Completion catalog entries (not execution proof) | 35 |
| Input-level last-whisper reply expansion | 1 |
| Total | 515 |

Default-binding declarations are not a count of expanded keys: loops generate numbered tab bindings. Debug and OS-conditional entries are deliberately included and identified as unavailable or adapted; commented-out settings are excluded. Hotkey arguments and defaults remain traceable through each exact pinned source line. Browser-reserved shortcuts require conflict handling, rather than blindly copying Qt bindings. This is an inventory of these declared surfaces plus the feature matrix below, not a claim to enumerate every internal implementation detail or future nightly feature.

Each CSV row records its exact upstream path/action, location, current state, implementation inspection entrypoint, follow-up issue(s), and the acceptance condition needed for promotion. An entrypoint marked planned proves where the gap was inspected, not implementation of the missing feature. The checker verifies source hashes, declaration coverage, duplicate identities, states, follow-up references and evidence-file existence. It does **not** prove behavior from file presence.

| State | Meaning |
| --- | --- |
| Implemented | A concrete end-to-end behavior exists; verification level and limits are stated separately. |
| Partial | A counterpart exists but semantics, controls, defaults or workflow are incomplete. |
| Planned | No matching independent behavior/control was verified; a delivery issue owns it. |
| Companion-only | Native behavior needs explicit pairing with an installed integration; linked issues remain open. |
| Platform-limited | Native/debug behavior has no supported direct browser equivalent; the limitation is recorded. |

Current CSV declaration totals are 217 implemented, 54 partial, 186 planned, 11 companion-only and 47 platform-limited. The original audit counted 139 implemented, 37 partial, 285 planned, 16 companion-only and 38 platform-limited. These are **not feature-parity percentages**. Counts include supported web adaptations and repeated source declarations. Exact native defaults and platform limitations remain separate from adaptation acceptance; the matrix also records working features without an equivalent declaration.

## M5 declaration review — October 13, 2026

All five M5 implementation slices are merged, with #117 and #118 qualified by four hosted push/PR checks each. This is implementation progress; M5 acceptance and full parity remain open.

| Family | Merged behavior and evidence | Exact remaining boundary |
| --- | --- | --- |
| #35 playback | Owner-configured executable/dependency/argument allowlist, paired account/origin, reviewed channel/quality launch and duplicate receipts; [setup and fixtures](desktop-playback-demo.md) | `/streamlink [joined channel]` opens setup with no IPC; pairing, tool/quality review and confirmation are separate. No custom URI schemes or direct automatic command launch. Exact split-player hotkeys remain missing. Installed real-stream and Linux/Windows runtime checks remain pending. |
| #36 watched channel | MV3 active-tab bridge and reviewed workspace opening; [protocol and tests](browser-companion-demo.md) | Installed Chromium round trip, focus and removal checks remain pending. A bounded account-local registry now names/selects compatible IDs with one active bridge and fresh-code pairing. Native-messaging allowlist installation, arbitrary process attachment and Firefox/Safari remain unsupported. |
| #37 extensions | Account-local declarative command/view manifests, reviewed grants and opaque-frame runtime; [contract](web-extensions-demo.md) | Executable Lua/JavaScript, REPL and native REPL font settings are unsupported. Per-extension enablement does not reproduce every upstream global switch. Deployed owner acceptance remains pending. |
| #38 IRC | Account-bound owner-configured TLS endpoints, channel/private conversations and shared search/virtual rendering; [TLS fixture](irc-relay-demo.md) | No arbitrary `/raw`, SASL, persistent IRC archives or full membership model. Approved network/identity acceptance remains pending. |
| #47 overlay | Paired macOS floating-window, zoom, whole-window opacity, OS window shadow, click-through/recovery and geometry; [native fixtures](desktop-overlay-demo.md) | Separate background alpha/content-shadow controls now have a [browser/WebKit adaptation](overlay-appearance-demo.md), including reviewed native projection. Whole-window/OS shadows remain independent; CSS rasterization is not Qt pixel identity. Account-local first-open guidance is delivered after a successful receipt; upstream native bit-field import/sync remains unsupported. Exact native action semantics/defaults, autorun and native theme-file watching remain missing. Production-origin/menu-bar acceptance and Linux/Windows hosts remain unavailable or pending as documented. |

The checker passed all 515 immutable upstream declarations, hashes, row identities and evidence paths after this reconciliation. No declaration was removed or promoted merely because its family has a merged PR. Rows outside these M5 families retain their prior classifications and require separate review when their evidence changes. The earlier feature matrix below retains the original audit's feature-level assessment; use this checkpoint and the milestone documents for the M5 implementation update.

## Feature coverage and acceptance

`T` means focused automated verification this audit. `D` means the local browser demo below. `H` means earlier owner/runtime evidence in [parity.md](parity.md); it was not repeated as a live account test in this audit. Code inspected without a matching test or demo is not promoted to runtime-verified.

| Feature and exact acceptance boundary | State / evidence | Delivery or limitation |
| --- | --- | --- |
| Anonymous Twitch read, reconnect/replay and native message parsing; preserve source channel and ID | Implemented; `internal/irc/message.go`, `web/src/store.ts`, `web/src/connection.ts`; T, H | Current merged baseline; identity dedup must survive every future pane/archive change. |
| Authenticated send, action messages and public replies with explicit destination; uncertain writes do not silently retry | Implemented; `internal/auth/send.go`, `web/src/composer.ts`; T, H | Owner confirmed send/reply in patrick__eff. This does not authorize further live writes. |
| Concurrent signed-in profiles, account switching and separate drafts/private state | Partial; `internal/auth/auth.go`, `web/src/auth.ts`; T for current single session | [#27](https://git.subcult.tv/subculture-collective/chatty-cat/issues/27); one session/account today; [#29](https://git.subcult.tv/subculture-collective/chatty-cat/issues/29) for optional device sync. No claim that the embed adopts app OAuth. |
| Named workspaces, restore/switch, channel sets and panel positions | Partial; `web/src/settings-bundle.ts`, `web/src/floating.ts`; T for current slots | [#6](https://git.subcult.tv/subculture-collective/chatty-cat/issues/6); three settings slots are not named channel workspaces. |
| Independent per-channel splits, tab sorting/closing/reopening and locked layout | Partial; `web/src/rail.ts` | [#7](https://git.subcult.tv/subculture-collective/chatty-cat/issues/7); current columns page the same merged feed; [#8](https://git.subcult.tv/subculture-collective/chatty-cat/issues/8) owns larger channel capacity beyond six. |
| Mentions, own messages, subscribed reply threads, live channels and whisper inbox | Partial; `web/src/attention.ts`, `web/src/whispers.ts`; T, H | [#9](https://git.subcult.tv/subculture-collective/chatty-cat/issues/9) and [#17](https://git.subcult.tv/subculture-collective/chatty-cat/issues/17); current alerts/whisper pane lack unified inbox and persistent thread subscriptions. |
| Phrase/author/badge rules, regex/case choices, highlight exclusion, custom colors/sounds and quiet hours | Partial; `web/src/display.ts`, `web/src/attention.ts`; T for current alerts | [#10](https://git.subcult.tv/subculture-collective/chatty-cat/issues/10); current literal keywords/hidden users do not implement the expression language or rule order. |
| Per-split AND filters: author identity/badges/subscription, channel/live/watched state, bits, message flags and negation | Planned; `web/src/display.ts` inspected | [#10](https://git.subcult.tv/subculture-collective/chatty-cat/issues/10); per-pane attachment also requires [#7](https://git.subcult.tv/subculture-collective/chatty-cat/issues/7), watched-channel predicates require [#36](https://git.subcult.tv/subculture-collective/chatty-cat/issues/36). Keep regex work bounded. |
| Text similarity threshold/time/count window, hide/dim, same-user/self exemptions and highlight choices | Planned; ID dedup in `web/src/store.ts` is a different contract | [#46](https://git.subcult.tv/subculture-collective/chatty-cat/issues/46); separate transport dedup, archive/stat completeness and provider duplicate-send restrictions. |
| Structured search: from/has:link/in/is/regex/badge/subtier, multiple values and negation; saved queries | Partial; `web/src/archive.ts`, `web/src/archive-ui.ts`; T, D for text search | [#15](https://git.subcult.tv/subculture-collective/chatty-cat/issues/15); current text/channel/login/time primitives are not the full query syntax. |
| Bookmarks and bounded personal annotations attached to messages/conversations | Planned; archive inspected | [#16](https://git.subcult.tv/subculture-collective/chatty-cat/issues/16); [#48](https://git.subcult.tv/subculture-collective/chatty-cat/issues/48) separately owns stable-user-ID notes in user cards. |
| Retained public reply tree, missing-parent handling and participation highlighting | Partial; `web/src/render.ts`, `web/src/composer.ts`; T, D for parent context | [#17](https://git.subcult.tv/subculture-collective/chatty-cat/issues/17); existing reply and jump-to-parent do not implement a persistent thread viewer. |
| Map retained messages/bookmarks to matching VOD time, including missing VODs and observation gaps | Planned; `web/src/stream-history.ts` inspected | [#18](https://git.subcult.tv/subculture-collective/chatty-cat/issues/18); metadata/VOD lists exist, timestamp mapping does not. |
| Observed stream comparisons, gaps and shared time scale | Partial; `web/src/rate-timeline.ts`, `web/src/stream-history.ts` | [#19](https://git.subcult.tv/subculture-collective/chatty-cat/issues/19); never infer unobserved traffic from blank periods. |
| Safe local archive, JSON import/export and duplicate preservation | Implemented adaptation; `web/src/archive.ts`, `web/src/history-import.ts`; T, D | Browser IndexedDB is not Chatterino's automatic channel/session text logging. |
| Channel/session log selection, timestamp format, retention, backup/recovery and export | Partial; archive/file export exists | [#20](https://git.subcult.tv/subculture-collective/chatty-cat/issues/20); no arbitrary background filesystem path. File access needs user selection or a paired companion. |
| Room modes plus ban/timeout/unban/delete/clear, announcements, role changes, raids, block and shoutout | Implemented commands; `internal/auth/commands.go`, `web/src/inspector.ts`; T | Not every command is owner-live-tested. UI button customization/private outcome journal are [#21](https://git.subcult.tv/subculture-collective/chatty-cat/issues/21)/#22. |
| User-card retained message list, role/scope explanations and private moderation journal | Partial; `web/src/inspector.ts`, `web/src/identity-cards.ts` | [#21](https://git.subcult.tv/subculture-collective/chatty-cat/issues/21); current count/public profile and fixed staged actions are not a complete user-history workspace. |
| Eight configurable timeout presets and command-backed moderation buttons | Partial; fixed 600-second timeout exists | [#22](https://git.subcult.tv/subculture-collective/chatty-cat/issues/22) and [#12](https://git.subcult.tv/subculture-collective/chatty-cat/issues/12); preserve identity/channel preview and uncertainty handling. |
| AutoMod held/update queue, blocked-term visibility and approve/deny outcomes | Implemented private version-2 queue in `internal/auth/automod_{state,stream,decision}.go`, `web/src/automod-ui.ts` | [#23](https://git.subcult.tv/subculture-collective/chatty-cat/issues/23); synthetic hold/update, staged decisions, duplicate suppression and revocation verified. Public blocked terms only; live acceptance pending. |
| Suspicious-user messages/state, monitored/restricted flags and moderator actions | Implemented private version-1 signals and reviewed actions in `internal/auth/suspicious_state.go`, `internal/auth/commands.go`, `web/src/suspicious-ui.ts` | [#24](https://git.subcult.tv/subculture-collective/chatty-cat/issues/24); synthetic message/update, scope/identity refusal, acknowledgement validation and revocation verified; live acceptance pending. |
| Warnings/acknowledgment context, Shield Mode, ban by suspended user's ID and untimeout alias | Planned; allowlists exclude commands | [#42](https://git.subcult.tv/subculture-collective/chatty-cat/issues/42); role/scope and provider-state evidence required. |
| Broadcaster poll lifecycle | Implemented panel in `internal/auth/polls.go`, `web/src/polls-ui.ts`; command aliases planned | [#25](https://git.subcult.tv/subculture-collective/chatty-cat/issues/25); synthetic create/end/archive, reconnect reads, validated counts and private outcomes verified; eligible broadcaster/live acceptance pending. |
| Broadcaster prediction lifecycle | Implemented panel in `internal/auth/predictions.go`, `web/src/predictions-ui.ts`; command aliases planned | [#26](https://git.subcult.tv/subculture-collective/chatty-cat/issues/26); synthetic create/lock/cancel/resolve, exact winning-outcome review and provider acknowledgement verified; eligible broadcaster/live acceptance pending. |
| Clips, stream markers, title/category changes and commercials | Implemented staged actions in `internal/auth/broadcaster_actions.go`, `web/src/broadcaster-actions-ui.ts`; editor markers unavailable | [#41](https://git.subcult.tv/subculture-collective/chatty-cat/issues/41); synthetic published-clip confirmation, marker acknowledgement, metadata readback, exact category selection and ad cooldown verified; owner/provider acceptance pending. |
| EventSub current chat/moderation/held-message events | Partial; private whispers, AutoMod held/update and suspicious-user message/update have account EventSub in `internal/auth/whispers.go` and `internal/auth/automod_stream.go` | [#23](https://git.subcult.tv/subculture-collective/chatty-cat/issues/23)/#24/#32/#42; pinned `eventsub/Connection.hpp` also handles chat, moderate v2, AutoMod hold/update, suspicious messages/state and user-message hold/update. Represent rejected own messages privately. |
| Shared-chat origin, rewards, first/elevated messages, subscriptions, watch streaks and message effects | Partial; generic USERNOTICE/tags in `web/src/render.ts` | [#32](https://git.subcult.tv/subculture-collective/chatty-cat/issues/32) and [#10](https://git.subcult.tv/subculture-collective/chatty-cat/issues/10)/#15; preserve actual supplied fields through replay/search. Do not invent missing tags or claim a native visual effect when only metadata/highlighting is available. |
| Native Twitch/cheer emotes, subscriber picker/completion and zero-width overlays | Implemented core; `web/src/tokens.ts`, `web/src/render.ts`, `web/src/picker-model.ts`; T, H | Exact per-feature/global/channel controls remain [#31](https://git.subcult.tv/subculture-collective/chatty-cat/issues/31); owner confirmed subscriber emotes in picker and completion. |
| BTTV/FFZ/7TV provider refresh, activity opt-in and cosmetic/category badges | Partial; `web/src/metadata.ts`, `web/src/picker-model.ts` | [#31](https://git.subcult.tv/subculture-collective/chatty-cat/issues/31); initial fetch and picker filters do not prove live event subscriptions or activity reporting. |
| Unicode 17 emoji categories, skin-tone/variation sequences and rendering styles | Partial; curated `web/src/emoji.ts` | [#45](https://git.subcult.tv/subculture-collective/chatty-cat/issues/45); validate licensed catalog/version and unsupported font/image fallbacks. |
| Smart/prefix/fuzzy completion, broadcaster/user priority, local nicknames and spellcheck | Partial; `web/src/completion.ts`, `web/src/composer.ts`; T | [#33](https://git.subcult.tv/subculture-collective/chatty-cat/issues/33); local alias must not replace provider identity; native dictionary controls need disclosed browser adaptations. |
| Custom command trigger/argument expansion and message-action placeholders | Planned; no template engine in composer | [#12](https://git.subcult.tv/subculture-collective/chatty-cat/issues/12); pinned variables include channel/name/id, stream/game/title, my/name/id, user/name, msg/id/text, input/text and deprecated aliases; positional ranges/escaping need bounded tests. Live wiki nightly-only placeholders are not silently added to the 2.5.6 baseline. |
| Local clear/uptime/copy/link/usercard/popout, reward-queue link, public reply dispatch and last-whisper reply aliases | Partial counterpart, commands missing; `web/src/composer.ts`, `web/src/links.ts` | [#40](https://git.subcult.tv/subculture-collective/chatty-cat/issues/40); `/r` is a whisper reply, not a public thread reply; local clearing must never call moderator `/clear`. |
| Chatterino custom hotkeys, action arguments, focus contexts and quick switcher | Partial; fixed `web/src/log-keyboard.ts` and browser editing; T | [#11](https://git.subcult.tv/subculture-collective/chatty-cat/issues/11); CSV includes all 69 actions and 56 binding declarations, including OS/debug exceptions. |
| Followed/live discovery, chatter/role lists, viewer count, title/category/uptime | Partial; `web/src/metadata.ts`, `web/src/main.ts` | [#14](https://git.subcult.tv/subculture-collective/chatty-cat/issues/14); viewer count is not chatter count; list completeness/permissions must be visible. |
| Timestamp/layout/username styles, collapse/deleted truncation, last-message marker, scroll/input feedback | Partial; `web/src/display.ts`, `web/src/virtual-log.ts`; T, D for saved size | [#43](https://git.subcult.tv/subculture-collective/chatty-cat/issues/43); independent settings and safe numeric defaults remain audited row by row. Include settings search and targeted reset. |
| Color themes, contrast and reversible validated custom import | Validated color-only adaptation; `web/src/custom-theme.ts`, `web/src/custom-theme-ui.ts`; [demo](custom-themes-demo.md) | [#34](https://git.subcult.tv/subculture-collective/chatty-cat/issues/34); native QColor/alpha and filesystem autoreload need explicit schema/companion adaptations. |
| Chatterino settings/commands/layout import and backup | Planned; current `web/src/settings-bundle.ts` handles our own schema | [#28](https://git.subcult.tv/subculture-collective/chatty-cat/issues/28); exclude tokens, account credentials and upload headers; preview unsupported keys before applying. Native stored credentials must never be imported. |
| Streamer privacy: avatars/thumbnails, mod/blocked terms, private notes, whispers, alerts and viewer/duration data | Planned; independent switches do not implement one privacy mode | [#13](https://git.subcult.tv/subculture-collective/chatty-cat/issues/13); manual mode first, process-aware detection companion-only via [#47](https://git.subcult.tv/subculture-collective/chatty-cat/issues/47). |
| Safe link previews, URL unshortening, click policy, preview sizes and selection search | Partial; `web/src/links.ts`, `web/src/preview.ts`, `web/src/identity-cards.ts` | [#44](https://git.subcult.tv/subculture-collective/chatty-cat/issues/44); current adapters do not provide every upstream tooltip/consent policy. Browser cannot force incognito windows. |
| Image paste/drop upload with configurable response/link/deletion mapping | Planned; composer inspected | [#30](https://git.subcult.tv/subculture-collective/chatty-cat/issues/30); opt-in validated server-side credentials, bounded uploads and no unsolicited external upload. |
| OBS browser-source overlay | Implemented web adaptation; `web/src/main.ts` `?overlay=1`, `web/src/style.css`; H only | Native always-on-top/click-through is companion-only [#47](https://git.subcult.tv/subculture-collective/chatty-cat/issues/47). Scale/opacity/shadow controls are not all implemented. |
| Streamlink/VLC/mpv, executable paths/arguments and quality/audio-only choices | Companion-only; current native Twitch iframe works independently | [#35](https://git.subcult.tv/subculture-collective/chatty-cat/issues/35); explicit pairing, executable allowlist and launch preview; no arbitrary shell commands. |
| Currently watched browser channel and process/extension registration | Companion-only | [#36](https://git.subcult.tv/subculture-collective/chatty-cat/issues/36); browser extension permission/origin pairing; normal web content cannot inspect arbitrary processes. |
| Generic IRC networks, TLS/auth, server/channel editing and private conversations | Planned web/companion adaptation; `internal/irc/message.go` is Twitch-only | [#38](https://git.subcult.tv/subculture-collective/chatty-cat/issues/38); existing Twitch transport is not generic IRC support. No arbitrary browser socket access. |
| Experimental Lua plugins, REPL and plugin API | Planned web adaptation; no runtime plugin engine | [#37](https://git.subcult.tv/subculture-collective/chatty-cat/issues/37); capability-limited extensions need separate supported APIs, not unrestricted Lua/filesystem/network compatibility. |
| Native keyring, package updates, cache/log paths and miniaudio backend | Platform-limited | Browser permissions/storage, server deployment and PWA updates own these concerns. Native configuration is neither imported nor treated as implemented. |
| Startup cached history and bounded virtual rendering | Implemented adaptation; `web/src/store.ts`, `web/src/archive.ts`, `web/src/virtual-log.ts`; T, D, H | Local cache is not the upstream recent-message service. Existing 100,000-record/35-mounted-row observation in parity.md is historical, not rerun here. |

Every planned matrix row links a roadmap slice. Full acceptance requires the actual setting/action, its persisted semantics, regression evidence and a demo; completing a family headline or this audit does not close the delivery slices.

## Reproduce the source inventory

Download/unpack the immutable source archive listed in `chatterino-source.json` into a temporary directory, then run:

```sh
python3 scripts/check-chatterino-inventory.py /path/to/chatterino-source
```

The checker accepts an existing directory and performs no network access or repository mutations. Updating the reference requires reviewing source diffs, changing the version/commit/hashes together, extracting the new declarations, and explicitly reconciling every removed/added setting/action/binding. Preserve existing acceptance evidence instead of resetting all rows to implemented. Do not change the pin merely to make a failed hash check pass.

## Regression evidence, 2026-10-12

At the reviewed rebuild revision on macOS, Node/Vitest and Go:

```sh
npm --prefix web test -- --maxWorkers=1 composer.test.ts completion.test.ts log-keyboard.test.ts archive.test.ts history-import.test.ts virtual-log.test.ts attention.test.ts settings-bundle.test.ts tokens.test.ts render.test.ts whispers.test.ts
go test -race -count=1 ./internal/auth ./internal/irc
```

Result: **11 frontend files / 72 tests passed**; both Go packages passed with race detection and cache bypass. These cover composer/caret handling, fixed keyboard navigation, archive/import, virtual rows, settings bundles, alerts, native tokens/rendering, private whispers and auth/command/provider boundaries. The inventory checker passed all 515 declarations and source hashes. The broader build/CI/deployment and every planned feature were not rerun or accepted by these focused checks.

Earlier owner acceptance in parity.md includes actual sign-in, visible public send/reply, subscriber emotes, whisper receipt, message deletion, sound and OS notifications. That evidence remains dated; mock provider tests do not establish every moderation/broadcaster permission or provider delivery outcome. Original-app GIPHY cache/proxy acceptance is still open in [#4](https://git.subcult.tv/subculture-collective/chatty-cat/issues/4).

## Reproducible browser demo

Use a separate local browser profile and an anonymous local preview. Do not upload real chat history or sign in for this demo. Start the app with an empty env file and OAuth/GIPHY values unset; no Twitch writes are possible. Build instructions remain in the repository README.

1. Open `http://127.0.0.1:8093/?channel=patrick__eff`. Confirm login is disabled with “Twitch login is not configured.”
2. Open Stats → History files and choose [chatterino-audit-history.json](fixtures/chatterino-audit-history.json). The preview reports **3 messages ready · 2 invalid or duplicate rows skipped**.
3. Import. The notice reports **3 messages imported; existing history retained**. The embedded legacy `<script>` is inert and omitted from message text. The fixture contains synthetic messages only.
4. Search archive for `coverage audit`. Expect three matches: parent, reply and safe legacy row. Import the same file again and repeat search: still three matches.
5. Select the safe legacy result. The URL contains `mid=audit-legacy` and that row is revealed. The reply row retains its parent quote and “Jump to parent.”
6. Open Settings, select font size 20, close and reload. Size 20 remains selected and the three retained messages remain available. Return to the live edge using the existing navigation controls.

Executed in T3's incognito preview against the local Go service and production asset `main-DlojlrjN.js`. Observed all notices and counts above; after reload, stored/current size both equaled 20, all three stable row keys remained, and no injected script flag was set. Six total rows were mounted in that small demo (the isolated profile also retained earlier fixture rows); this is not a large-load benchmark. No real message, whisper or moderation request was sent. Audibility, notification permissions and live roles were not retested here.

## Follow-up slices discovered by the audit

| Issue | Milestone | Scope |
| --- | --- | --- |
| [#40](https://git.subcult.tv/subculture-collective/chatty-cat/issues/40) | M1 | Safe local built-in commands and aliases |
| [#41](https://git.subcult.tv/subculture-collective/chatty-cat/issues/41) | M3 | Clips, markers, channel metadata and commercials |
| [#42](https://git.subcult.tv/subculture-collective/chatty-cat/issues/42) | M3 | Warnings, Shield Mode and ID-based moderation |
| [#43](https://git.subcult.tv/subculture-collective/chatty-cat/issues/43) | M1 | Message/interface controls, settings search and targeted reset |
| [#44](https://git.subcult.tv/subculture-collective/chatty-cat/issues/44) | M4 | Safe preview/opening preferences and selection search |
| [#45](https://git.subcult.tv/subculture-collective/chatty-cat/issues/45) | M4 | Versioned emoji catalog, categories and styles |
| [#46](https://git.subcult.tv/subculture-collective/chatty-cat/issues/46) | M1 | Bounded text-similarity controls |
| [#47](https://git.subcult.tv/subculture-collective/chatty-cat/issues/47) | M5 | Optional native desktop overlay |
| [#48](https://git.subcult.tv/subculture-collective/chatty-cat/issues/48) | M2 | Account-isolated per-user notes |

Existing slices [#6](https://git.subcult.tv/subculture-collective/chatty-cat/issues/6)–38 retain their responsibilities and dependencies. Native dependencies and the [project board](https://git.subcult.tv/subculture-collective/chatty-cat/projects/2) determine scheduling; a planned row in this audit is not a new implementation claim.

## Documentation sources

The pinned source is authoritative when the live wiki describes newer/nightly behavior. The official [wiki](https://wiki.chatterino.com/), [commands](https://wiki.chatterino.com/Commands/), [hotkeys](https://wiki.chatterino.com/Hotkeys/), [filters](https://wiki.chatterino.com/Filters/), [search](https://wiki.chatterino.com/Search/), [Twitch replies](https://wiki.chatterino.com/Twitch/), [moderation](https://wiki.chatterino.com/Moderation/), [settings files](https://wiki.chatterino.com/Settings/), [link previews](https://wiki.chatterino.com/Link%20Previews/) and [changelog](https://chatterino.com/changelog) were checked on 2026-10-12. Release-note coverage includes slow-mode feedback, emoji categories/Unicode 17, spellchecking, polls/predictions, suspicious users, provider badges, shared-chat origin, watch-streak filtering and deleted-text limits; their adoption state is recorded above.
