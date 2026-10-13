# Milestone 2 progress

M1 closed on October 12, 2026 after all 19 issues were accepted. Discovery's
owner-browser check covers followed/chatter reads, pagination and workspace
joining. PRs #61–#63 are merged. The original GIPHY provider gate stays in M0.

## Structured archive queries and saved searches — #15

Merged in [PR #64](https://git.subcult.tv/subculture-collective/chatty-cat/pulls/64).
The existing local IndexedDB archive supplies results;
search does not fetch unobserved history. The query and filter builder support
text, sender/channel, badge, native emote IDs or literal tokens, link domains,
reply/moderation state, dates, negation and alternative values. Bounded regex
uses the existing safe subset. Pages use timestamp and record identity to keep
equal-time rows, with cancellation and explicit retained archive boundaries.
Up to 20 saved queries stay local, isolated by account, and hidden in privacy
mode. The selected channel is preserved when saving a query. Current-channel
search uses Alt+H; joined-channel search uses Alt+Shift+H, with editable bindings
and palette actions. Pinned non-modal rails no longer block those actions.

Verification: all 439 frontend tests, strict TypeScript checks and production
build pass. The Chromium production bundle searched 100,000 native IndexedDB
rows. Two 100-row pages had no overlap; active cancellation passed. A full
100,000-row no-match scan took 1,081 ms on this workstation while 60 timer ticks
ran (maximum observed interval 60 ms); this is fixture evidence, not a universal
latency guarantee. Saved queries reopened after reload; account switching and
privacy cleared the current query, results and prior saved names. A result
opened 155 retained context rows with Jump to live available. No search-history
provider request was made. No M2 deployment is recorded yet.

## Remaining order and dependencies

- #48: private user notes implemented for review on merged account profiles PR #70.

## Public message/conversation bookmarks — #16

Merged in [PR #65](https://git.subcult.tv/subculture-collective/chatty-cat/pulls/65). Bookmark buttons in live chat and archive results open
an editor for a local public excerpt, private note and tags. Bookmarks stay in
separate signed-in or signed-out profiles; only public commands and a small
allowlist of reply/moderation metadata are retained. Limits are 200 bookmarks,
1 MB per profile, 2,000 note characters, 1,000 characters per excerpt, and five
context excerpts. Conversation capture includes a retained parent when found;
it does not claim to reconstruct a full thread.

Sharing requires an exact preview, then a separate copy action. Notes, authors,
context, URLs and mentions in message text are excluded by default; each can
be included explicitly. Sharing choices reset for another bookmark/account.
Device-local archive links are labelled separately from public Twitch channel
links; no public message permalink or remote publishing service is invented.
Private backup downloads include notes and tags after preview. Imports preserve
existing notes, validate bounds/schema and require an explicit import action.

Missing public excerpts can be recovered atomically without overwriting retained
records. Recovery refuses a full archive rather than evicting history. Copies
keep bounded public reply/moderation flags and are visibly marked saved excerpts;
private notes never enter chat, history exports or public statistics.

Verification: all 450 frontend tests and strict production build pass. Browser
creation and tagging, reload/reopen, redacted previews,
explicit note inclusion, a 2,500-byte native backup download and duplicate-safe
reimport, six-row orphan recovery and context reopening pass. Account switching
and privacy clear editing/preview content and sharing opt-ins. Tests cover
malformed imports, profile isolation, stale edits, capacity refusal, clipboard
handoff of reviewed text and retention of existing moderation records. This is
local fixture evidence; no M2 production deployment is recorded.

## Persistent public reply threads — #17

Merged in [PR #66](https://git.subcult.tv/subculture-collective/chatty-cat/pulls/66). Thread buttons open an independent sidebar beside chat.
Up to eight channel/root views and 500 messages per thread stay in the same
account/workspace across reload. Explicit Mark thread read records message IDs,
so late replies and equal-time replay do not depend on a timestamp watermark.
The sidebar follows its bottom edge while preserving a scrolled reading position.

Channel-indexed archive cursors reconstruct retained parent relationships without
loading the full archive into memory. Missing parent IDs and the message cap are
shown; the viewer does not fetch unobserved history. Live replies, retained replay
and accepted local reply echoes update views without duplicate rows. Search and
reviewed public-context copy redact channel-scoped deletions and chat clears.
Reply actions stage the existing composer, and normal Send remains separate.
Account changes and privacy clear the current rows/search/copy preview and cancel
pending reads. Opening/hiding the sidebar captures the main reader before rows
rewrap and restores the message anchor.

Verification: all 461 frontend tests, strict TypeScript checks and production
build pass; the pinned 515-row source inventory remains valid. Chromium with
native IndexedDB reconstructs the root, replies and a missing-parent notice,
stages Reply to bob, follows a new local-echo reply and preserves unread state
on reload. Opening the sidebar preserved the paused visible message with an
observed offset difference of 0.046875 pixels. A channel scan across roughly
100,000 retained records completed with four matching thread rows; the browser
continued its 16 ms timer (maximum interval observed 36.7 ms during the check).
These measurements are fixture evidence, not universal latency guarantees.
Focused tests also cover account/workspace isolation, background views, active
cancellation, stale parent lookup, malformed saved data, bounds, reviewed-copy
invalidation, moderation and authoritative echo replacement. No M2 production
deployment or live Twitch-send acceptance is recorded.

Reproducible browser fixture: [reply-thread demo](reply-thread-demo.md).

## Verified VOD context — #18

Merged in [PR #67](https://git.subcult.tv/subculture-collective/chatty-cat/pulls/67). Archive results and saved bookmarks open VOD context
without replacing the chat reader. It shows message time in UTC and the browser's
named local timezone. Candidate ranges come only from previously observed public
archive metadata (up to 30 per channel); gaps, absent ranges and missing/private/
deleted archives never produce a guessed offset.

Verify archive checks the exact video ID, broadcaster ownership, archive type,
creation time and duration through server-only public Helix reads. Provider data
is cached/coalesced for up to one minute with the existing request and cache
bounds. Errors refuse stale fallback data; the response excludes raw provider
fields and uses no-store. A separate Load action rechecks metadata before loading
the official iframe at a whole-second estimated offset. Timing uses archive
creation time; broadcast/chat delay and recording gaps remain explicit uncertainty.

The player uses native Twitch controls, a validated parent hostname, a v-prefixed
video ID, time, autoplay=false and muted=true. Closing, privacy and account
changes remove the frame and cancel pending verification. Private bookmark notes
never enter the VOD preview or request. The preview takes only a saved public
channel and timestamp; unsaved bookmarks require Save first.

Verification: all 470 frontend tests, strict build, full Go race suite, vet and
zero-issue golangci-lint pass; the pinned 515-row inventory remains valid.
Chromium/native IndexedDB checks cover archive-result and saved-bookmark entry,
UTC/local conversion, a 1m2s offset, explicit verification/loading, the official
620×300 iframe, reader identity/offset preservation, missing-VOD refusal and
privacy cleanup. Regression tests cover half-open time ranges, timezone offsets,
wrong video/owner/type, changed timing, stale provider fallback, capacity/shutdown,
stale account reads, note exclusion and frame release. This is fixture evidence;
real Twitch media playback and production deployment remain unverified.

Reproducible demo and provider references: [VOD-context demo](vod-context-demo.md).

## Observation comparison — #19

Merged in [PR #68](https://git.subcult.tv/subculture-collective/chatty-cat/pulls/68).
Compare activity opens aligned message-rate and viewer
plots for one to six joined channels and a chosen window of up to 24 hours.
Rates use receipt-time five-second means, averaged into at most 240 chart
buckets per channel. Viewer points use actual polls and retain the poll's source
timestamp; they are never interpolated. Each metric has one shared scale across
channels, with separate units between plots. Empty or partially observed rate
buckets and missing viewer polls are gaps, not zero activity.

Per-channel connected-source coverage is now saved atomically with the rate
snapshot. Source changes, disconnects, timer pauses and closed pages never
create inferred coverage. Counts from legacy or invalid coverage snapshots
remain unknown in comparison. The first four seconds after a coverage boundary
stay unknown because the rolling rate needs five observed seconds. Rate data
retains 24 hours and viewer samples seven days; older selected windows explicitly
show unavailable portions. Coverage intervals are capped at 24,000.

Source-timestamp marks identify observed title changes, retained raid notices
and admitted spikes (at least four messages/s; up to three per channel, separated
by more than ten seconds). Title changes following long poll gaps are labelled
first seen after a gap. Failed title/viewer reads are missing. The event list
is capped at its last 100 marks, with an explicit limit notice. Raid scans use
cancellable channel cursors and the existing bounded public archive. Nearby
chat opens a retained message within five seconds, or reports that context is
missing; VOD actions use the existing verified-range preview.

A sandboxed export preview enables a separate HTML download. The standalone
aggregate table includes coverage, missing samples, source poll timestamps and
escaped public annotations, with no raw chat, sender fields, account IDs,
credentials, notes, device links or active resources. Changes to filters,
account status and privacy invalidate results and the reviewed export. Public
retained comparisons remain usable when login status is unavailable/offline.

Verification: all 485 frontend tests and strict production build pass; the
pinned 515-row inventory remains valid. Native Chromium/IndexedDB restored two
channels with different observation intervals, displayed rates and viewers on
separate scales, marked title/raid/spike timestamps and distinguished observed
zeroes from gaps. Nearby raid chat and matching VOD preview opened successfully;
VOD navigation kept the paused reader's identity and offset unchanged. A native
56,037-byte HTML download contained 450 aggregate rows plus a header, no active
resources and none of the fixture's private/sender/token/raw-chat sentinels.
Privacy clears graphs and srcdoc and disables download; account changes cancel
pending work and clear the same content. A delayed 24-hour preset remains valid.
These are local fixture checks; no M2 production deployment is recorded.

Reproducible demo: [observation comparison](observation-comparison-demo.md).

## Portable public logs and archive retention — #20

Merged in [PR #69](https://git.subcult.tv/subculture-collective/chatty-cat/pulls/69).
Export logs opens a local date/channel/format preview
before a separate download. Recovery includes all archived channels, with
equal-time identity paging into parts of at most 1,000 records / 8 MB. Each part
reports actual byte size, retained bounds, selected range and channel groups.
Text logs have UTC, named local timezone/offset or epoch timestamps and readable
moderation/system records. Structured files use the existing history import
format. The body preview is capped at 20,000 characters; the file includes the
whole prepared part.

Only public channel commands and allowed public tags enter files. Whispers,
private notes, account fields, unknown tags and quoted parent bodies are excluded.
Retained later deletions/timeouts redact matching message bodies within their
channel, including notices outside the selected export window. Session groups
use retained archive metadata or actual live-poll intervals. Gaps stay unassigned;
neither grouping proves continuous capture, complete sessions or current VOD
availability. The archive may change between separately prepared parts.

Retention keeps the previous default of 100,000 rows with no age limit. Controls
allow 1,000–100,000 rows and no age limit or 7/30/90 days. Preview reports exact
eligible removals and a capacity warning; Apply is separate and refuses a changed
archive. The UI advises downloading every recovery part before reducing retention.
Later saves enforce the configured policy. Policy-storage failure aborts removal.
Account changes, privacy and filter changes invalidate prepared downloads;
pending export/retention reads cannot restore stale previews.

Verification: all 495 frontend tests and strict production build pass; the
pinned 515-row source inventory remains valid. Chromium/native IndexedDB exported
1,009 unique public records in 1,000/9-row JSON parts of 242,530/3,095 bytes.
The files exclude all private sentinels and preserve channel-scoped redaction.
An 88,112-byte text file includes named local timestamps, readable timeout,
deletion and subscription notices. Native reimport of the first JSON part kept
the stored row count unchanged. A reviewed capacity reduction predicted and
removed exactly ten fixture rows, leaving 1,000. Privacy and account switching
cleared the prepared file and disabled download. Opening/downloading/closing logs
preserved the paused reader's message identity and offset. Focused tests cover stored-whisper rejection across
archive readers, age enforcement, storage failure, stale plans and account/filter
invalidation. These are local fixture checks; no M2 production deployment is
recorded. #48 remains blocked by account profiles #27.

Reproducible demo: [portable logs](portable-logs-demo.md).

## Private user notes — #48

Implemented for review on merged [account profiles PR #70](https://git.subcult.tv/subculture-collective/chatty-cat/pulls/70).
Clicked and hover user cards include a separate local note editor, keyed by stable
Twitch user IDs within the current signed-in account. Public profile responses now
allowlist the provider's numeric ID; missing/conflicting identities refuse note
association. Imported message tags require a public identity lookup. A rename
preserves the note; saving refreshes its login label.

Plain-text notes have explicit Save/Delete, with limits of 200 users, 2,000 text
characters per note and a 1 MB private backup per account. User notes offers a full
backup preview and separate native download, reviewed import that requires the
same account and keeps existing notes, and preview/apply for bulk deletion. Notes
are not evicted by capacity or archive retention. Stale writes and storage errors
preserve saved data. Privacy/account changes clear editors/transfers and cancel
pending identity/import work; old user-card command responses cannot update a
new account context. Notes never enter public message objects, logs or statistics.

Verification: all 512 frontend tests and strict production build pass; full Go
race tests, vet and zero-issue lint pass, with the 515-row inventory unchanged.
Native Chromium checks cover creation/reopening, inert script-like plain text,
rename preservation, Alice/Bob isolation, a 240-byte private backup, explicit bulk
deletion and same-account recovery, per-user deletion and cross-account import
refusal. A 90,605-byte public export contains 400 rows and no private note sentinel.
Privacy removes card editors and clears the reviewed file. Regression tests cover
malformed imports, bounds, quotas, stale edits, delayed imports and conflicting
identity IDs. This is local fixture evidence; production deployment and real
Twitch account consent remain unverified. M2 remains open until review/acceptance.

Reproducible demo: [private user notes](user-notes-demo.md).
