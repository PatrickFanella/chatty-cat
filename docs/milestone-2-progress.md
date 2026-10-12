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

- #19/#20: observation comparison and portable logs from the merged baseline.
- #48: account-isolated user notes after #27 account profiles.

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

Implemented for review. Archive results and saved bookmarks open VOD context
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
