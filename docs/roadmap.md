# Remaining-work roadmap

Updated October 19, 2026 against main `1f64fb9` and the live Gitea issue inventory.
This plan replaces the original implementation catalog. It contains all 8 open
issues: 6 delivery issues and the two planning issues, #3 and #143. Dates are
checkpoints, not delivery promises.

[Roadmap issue #3](https://git.subcult.tv/subculture-collective/chatty-cat/issues/3)
tracks the whole plan; [M6 planning #143](https://git.subcult.tv/subculture-collective/chatty-cat/issues/143)
tracks shell, performance and footprint delivery. Existing milestones and issue
acceptance criteria remain authoritative. The waves below sequence work within
M6; they do not create new milestones.

## Direction and completed baseline

Keep the chat shell minimal, with movable, resizable docked and floating panels.
Prioritize low runtime resource use, then startup/package footprint, while
preserving chat rendering, account isolation, public history and recovery.

M0–M3 are closed. M4 has one open delivery issue; M5 has two. M6 has three open
delivery issues plus its planning issue. The shell (#129 / PR #144) is merged.
Selected-font loading (#140 / PR #146) is merged and closed: system/bundled font
choices no longer request the twelve-family Google stylesheet. Merge does not
prove that the change is deployed.

The last local production build measured the main JavaScript at 355.36 kB gzip.
The October 14 survey counted fourteen intervals and eager construction of 43
panels. These are starting observations, not current production CPU, heap or GPU
measurements. Wave 1 must establish a comparable baseline before claiming savings.

## Execution order

Default queue: **#142 → #134 → #130 → #139 → #135 → #136 → #131 → #132 → #133
→ #137 → #138 → #141**. Take one reviewable slice at a time. Independent work may
move earlier when it avoids shared-file conflicts and retains its verification
prerequisites. The acceptance track below can proceed whenever its external
conditions are available.

### Wave 1 — Make changes reviewable and measurable

1. [#142 — Format the frontend](https://git.subcult.tv/subculture-collective/chatty-cat/issues/142).
   Adopt one formatter and its check command. Keep the mass formatting commit
   separate from behavior changes; record it in the blame ignore file and explain
   its use in [continuous verification](continuous-verification.md). Existing
   tests and build must pass. Land before the broad panel conversion.
2. [#134 — Resource readout and baseline](https://git.subcult.tv/subculture-collective/chatty-cat/issues/134).
   Add the hidden resource command with timer owners, mounted rows, cache size,
   long tasks, visibility and heap where supported. Record quiet/busy channels,
   visible/hidden tabs and the exact build, browser, hardware and observation
   duration in a dated report. Document external CPU/memory measurements and GPU
   measurements where available; mark unsupported metrics unavailable. Keep the
   readout out of the future overlay entry.

Exit: readable source, a working readout and a dated baseline. Define repeatable
sampling and numeric comparisons here; do not invent CPU or heap limits without
measurements. Retain the existing goals of near-zero idle/hidden main-thread work
and no task over 50 ms during normal scrolling.

### Wave 2 — Reduce startup work and payload

3. [#130 — Lazy panel registration](https://git.subcult.tv/subculture-collective/chatty-cat/issues/130).
   Introduce the explicit panel lifecycle, then migrate simple panels in bounded
   batches before the remaining panels. Preserve commands, keyboard access,
   account teardown and restored docked layouts. Remove the legacy header mirror,
   `showModal` patch and body observer only after all panels register explicitly.
   Startup constructs only the shell, log, composer and restored docked panels;
   unopened panels allocate no DOM or running timers. Converted modules have
   separate chunks.
4. [#139 — Load emoji and resources on demand](https://git.subcult.tv/subculture-collective/chatty-cat/issues/139).
   Extract the generated data, preserve provenance and cache it on first use.
   Verify picker/help operation offline after first load and service-worker
   upgrade behavior. Measure total startup transfer and parsing as well as the
   main chunk, so moving bytes into a precache does not masquerade as savings.
   The issue's main-chunk target remains below 180 kB gzip.

Exit: record before/after DOM, timers, startup and chunk measurements. Panel
restoration, picker/help and offline behavior pass. #130 follows #142; #134 supplies
its measurement evidence. #139 can be developed independently after formatting,
then assessed alongside the lazy chunks.

### Wave 3 — Stop unnecessary idle and hidden activity

5. [#135 — Visibility-aware scheduling](https://git.subcult.tv/subculture-collective/chatty-cat/issues/135).
   Replace the UI polling intervals with the shared scheduler and panel activity
   predicates. Batch provider events from socket messages. Preserve final storage
   flushes and recovery behavior. Verify the issue's target of at most two active
   timers while idle and none while hidden with explicit timer ownership; account
   for transport/retry activity separately rather than hiding it from the readout.
6. [#136 — Pause invisible animated emotes](https://git.subcult.tv/subculture-collective/chatty-cat/issues/136).
   Freeze offscreen/hidden rows, restore on re-entry and preserve manual freeze
   and picker hold behavior. Use measured row heights for containment. Compare
   busy-channel visible/hidden and live/history CPU/GPU observations, with no
   layout shift or lost reader position.

Exit: repeat Wave 1's scenarios against the same environment. Demonstrate the
change in work performed; preserve sparkline, picker, transport and persistence
behavior. #130 supplies panel lifecycle; #134 supplies the baseline.

### Wave 4 — Finish panel usability

7. [#131 — Human-readable settings](https://git.subcult.tv/subculture-collective/chatty-cat/issues/131).
   Map option values to clear labels and document them in the design system.
   Preserve stored values, preset definitions and share URLs byte for byte.
8. [#132 — Dense panel layouts](https://git.subcult.tv/subculture-collective/chatty-cat/issues/132).
   Group moderation, presentation, provider/badge, chat-context, sync and archive
   controls into labelled sections. Shorten direct explanatory paragraphs to
   about 300 characters or put detail behind disclosure controls. At 1280×800,
   expose a usable first section and keep all controls reachable.
9. [#133 — Narrow and portrait panels](https://git.subcult.tv/subculture-collective/chatty-cat/issues/133).
   Use a consistent sheet/tab treatment for docked and floating panels, including
   picker, video and whispers. Verify touch dragging, keyboard access, readable
   chat and on-screen placement at 600×800 and 390×844.

Exit: demonstrate opening, docking, resizing, closing and restoring the affected
panels. Work after the lifecycle migration to avoid rewriting the same markup
and geometry twice; #131 can move earlier as a small independent correction.

### Wave 5 — Isolate heavy storage and OBS workloads

10. [#137 — Storage/search worker](https://git.subcult.tv/subculture-collective/chatty-cat/issues/137).
    Move archive, stats, history search, rate timeline and moderation-journal
    persistence behind the worker protocol in bounded migrations. Preserve
    account boundaries, receipt outcomes, quota recovery from PR #128 and
    existing retained data. Run the archive/stats/storage fixtures through the
    worker shim and a 15-minute busy-channel session with no storage-attributed
    main-thread long task. Use the readout to attribute work before and after.
11. [#138 — Dedicated OBS overlay entry](https://git.subcult.tv/subculture-collective/chatty-cat/issues/138).
    Build the renderer/connection entry without shell, panels or storage timers.
    Preserve the old `?overlay=1` parameters through redirection. Verify the
    [overlay appearance checks](overlay-appearance-demo.md), real OBS idle work,
    and a gzip payload well below one quarter of the main entry. Count shared
    chunks in the overlay's loaded payload, not just its named entry file.

Exit: durable history/recovery passes, storage no longer stalls the measured
session, and OBS has its own verified entry. #137 and #138 are independent after
the earlier architecture changes; one does not block the other.

### Wave 6 — Enforce regression budgets

12. [#141 — Bundle budgets in CI](https://git.subcult.tv/subculture-collective/chatty-cat/issues/141).
    Commit gzip limits based on the resulting main, lazy-panel and overlay
    payloads. Report measurements in CI and prove a deliberate 20 kB regression
    fails the check. Set final limits after #130, #139 and #138 establish the
    chunk graph; account for shared chunks and required data requests.

Exit: hosted checks enforce the measured budgets, and the final resource report
repeats Wave 1's scenarios. Close #143 only after its twelve delivery issues have
passed their gates and the resulting behavior has been verified. Keep individual
local, hosted, merged and deployed results distinguishable.

## Current lifecycle progress

The complete #130 implementation merged in PR #155 and #130 is closed. All 40
independent panels use explicit lazy factories; contextual popovers, pane settings
and the palette construct on intent. Header mirroring, global dialog patching and
body-wide discovery are removed. Merged-main CI passed. See the
[panel inventory and local evidence](panel-lifecycle-migration.md).

The #139 data split merged in PR #156 and #139 is closed. Merged-main CI passed.
The main entry is 151.21 kB gzip; full precache bytes increased while startup
JavaScript parsing decreased. See [data-loading measurements](reference-data-loading.md).

The #135 implementation merged in PR #157 and #135 is closed. It shares visible UI/storage clocks, flushes once at hide,
removes provider polling and exposes protocol deadlines separately. Local tests
and controlled browser visibility checks pass; natural background throttling and
production resource measurements remain unqualified. The entry is 152.48 kB gzip.
See [scheduling evidence](visibility-aware-scheduling.md). The deployment's
merged-main CI subsequently passed after stranded tasks were retried; the missing
original logs came from tasks with zero recorded log bytes.

The #136 implementation merged in PR #158. It pauses offscreen/hidden virtual rows and hidden picker
images while preserving manual freeze, Hold+ and reader geometry. Local tests and
controlled browser checks pass. External CPU/GPU qualification remains open; see
[animation evidence](emote-animation.md). The issue remains open for qualification.

The #131 implementation merged in PR #159 and #131 is closed. It gives Display settings readable labels and measurement
units, retaining all raw option values and the 18 canonical preset definitions.
The share-URL serializer is unchanged. The design system records the mapping;
local tests and a 1280×800 browser check pass. PR-head hosted CI passed after a
stranded frontend task was retried. These settings-label changes are included in the October 16 deployment.

The #132 implementation merged in PR #160 and #132 is closed. It groups all six dense panels, preserves detailed copy in
disclosures and keeps review/consent/recovery controls together. Each first
section fits at 1280×800, with no horizontal overflow and direct explanatory
paragraphs below 300 characters. Local tests and synthetic moderation checks pass;
see [panel evidence](dense-panels.md). Its final PR-head frontend check had a stranded
task with zero log bytes; merge is separate from hosted CI success.

The #133 implementation merged in PR #161 and #133 is closed. It uses one lower
sheet and keyboard-accessible tabs for
managed panels at narrow/portrait sizes. Local checks at 600×800 and 390×844
retain readable chat, on-screen panels and drafts. Desktop geometry survives a
viewport round trip; synthetic whispers/moderation and touch-event checks retain
their provider/device qualification limits. See [compact panel evidence](compact-panels.md).
All four PR-head hosted checks passed. These panel changes are included in the
October 16 deployment.

The first ten #137 migrations merged in PRs #162–#171. They move private-journal
storage, archive database operations, statistics persistence/encoding/restoration,
rate snapshot storage and retained-row statistics summaries into workers. Each
final PR head passed all four hosted checks; merged main `e690b02` passed both
push checks. Archive retention preserves its coordinated policy write, rollback
and uncertain-acknowledgement handling. See the
[staged plan and evidence](storage-worker-migration.md).

Wave 5's final implementation moves ongoing ledger aggregation, ranks, buckets,
snapshot construction, rate computation and comparisons into workers. Bootstrap
and retained-row reports transfer at most 2,000 rows per request. It also adds a
passive `/overlay.html` entry, legacy redirects and a build guard counting every
statically imported JavaScript chunk. The overlay uses 26,764 gzip bytes versus
149,765 for main (17.87%). These changes merged in PR #172, whose final head passed all four hosted checks;
merged main `141e121` passed both push checks. See the
[Wave 5 report](wave5-2026-10-18.md) for tests and runtime acceptance boundaries.

#137’s 15-minute rehearsal completed at 100,000 retained rows with zero guarded
Window storage/encoding calls, no runtime errors and a maximum worker dispatch
of 2.2 ms. Overall long tasks remain; complete storage attribution is
not supplied by the readout, so #137 remains open for acceptance review.

On October 18 the owner accepted #138's renderer-specific idle result: zero
measured renderer CPU and DOM mutations in native OBS. The software compositor's
2.27% total OBS CPU versus a 0.72% baseline remains recorded; hardware-accelerated
OBS qualification is no longer a closure prerequisite. #138 is closed after PR #172 merged under this accepted scope.
The next #137 slice adds per-callback maxima and explicit synchronous render/worker
boundaries before repeating its 15-minute gate. Its 60-second diagnostic sample
identifies chat rendering (229.6 ms maximum) and the visible picker refresh
(149.1 ms maximum); measured storage callbacks and worker dispatch/replies stay
below 2 ms. See [attribution evidence](storage-task-attribution.md). This slice
merged in PR #173 and does not close #137.
Wave 6 #141 is closed after PR #182 merged: all four exact-head checks and
both merged-main checks passed. Its hosted frontend job emitted the committed
gzip budgets and passed the deliberate 20 KiB regression test.

#137 is closed after PR #185 merged its
[15-minute storage receipt](storage-acceptance-2026-10-19.md), which records
100,000 retained rows and active Stats queries. No measured storage callback,
worker dispatch or reply handler exceeded 50 ms; the worker-shim suites passed
122 tests. Overall chat/picker long tasks remain separate findings. PR #183
merged the reusable picker collator, and #184 merged nested render-phase
diagnostics; each final head passed four hosted checks. Live provider acceptance
and #136's external CPU/GPU qualification remain independent.

Production runs source `c6f91f6`, the approved #187 head with the same tree as
merged main `e4c65ee`. The
[current deployment receipt](deployment-2026-10-19-empty-rules.md) records staging,
public hashes, independent source rebuild, retained data and rollback guards.
#180's earlier [layout receipt](deployment-2026-10-19-layout.md) preserves the
passing fresh/reloaded popout viewport checks. These bounded observations do not
supply exhaustive startup, provider or CPU/GPU qualification.

#142's formatter and #134's resource readout/first local baseline are merged and
closed. Broader production, hidden-tab and CPU/GPU qualification remains separate.
The current render investigation is documented in
[empty-rule rendering](empty-rule-rendering.md); its local measurements are
limited to synthetic warm-session timings and separate from the completed
storage gate. The public deployment check found a 6-pixel account-button
overflow at 390 pixels; its compact-header repair is the next bounded slice.

## Live acceptance track — independent of M6

- [#32 — Twitch message context](https://git.subcult.tv/subculture-collective/chatty-cat/issues/32)
  remains in M4. Consent/connection passed; arrange controlled positive
  shared-chat, reward, streak, effect and account-private hold/update events.
  Verify rendering, predicates, deduplication and private-body exclusion from
  public history. Prerequisite: suitable consenting accounts/channels and events.
  [Public context](eventsub-public-context-demo.md) and
  [private feedback](user-message-feedback-demo.md) retain fixture boundaries.
- [#36 — Installed browser companion](https://git.subcult.tv/subculture-collective/chatty-cat/issues/36)
  remains in M5. Complete watched-channel delivery, reviewed workspace/focus
  choices and revocation/removal in the installed Chromium extension. Pairing
  alone is insufficient. Verify origin/account boundaries and no cookie/token
  forwarding. Prerequisite: the owner's installed extension and manual popup
  actions where automation cannot reach them. [Companion evidence](browser-companion-demo.md).
- [#38 — Approved IRC network](https://git.subcult.tv/subculture-collective/chatty-cat/issues/38)
  remains in M5. Obtain an approved TLS endpoint, identity, channels and
  server-held credentials through the existing private configuration process.
  Then verify join, send, private conversations, reconnect/echo and isolated
  history. Do not choose a network or expose an arbitrary-host proxy to satisfy
  the gate. [Relay evidence](irc-relay-demo.md).

Close each issue only when its recorded gate passes or the owner explicitly
accepts a documented scope change. M4/M5 closure must also review their retained
provider/native limitations; closing the last open issue does not erase them.

## Delivery and evidence

Keep #3 as the roadmap index and #143 as the M6 coordinator; neither adds a
separate implementation deliverable. Use existing issues and milestones rather
than duplicate tickets. Move work to In Progress when owned, Review when a PR is
attached, and Done after the relevant acceptance is recorded. Keep externally
blocked acceptance work visible without treating it as an M6 prerequisite.

Each PR states its issue, changed behavior, measurements/tests and remaining
limits. Use the [repository verification commands](../README.md#verify) and
[hosted workflow](continuous-verification.md) appropriate to its scope. Record
local checks, exact-head hosted CI, merge, deployment and live/provider results
as separate evidence. Recheck issue state before starting the next slice.

Historical acceptance remains in [parity](parity.md), [M3](milestone-3-progress.md),
[M4](m4-deployment-2026-10-13.md), [M5](milestone-5-progress.md) and the
[October 14 closeout](remaining-acceptance-2026-10-14.md). These dated reports are
not claims of today's deployed release. The pinned Chatterino 2.5.6
[coverage audit](chatterino-coverage.md) remains the adoption reference; this
roadmap does not promise full native parity.
