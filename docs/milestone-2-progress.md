# Milestone 2 progress

M1 closed on October 12, 2026 after all 19 issues were accepted. Discovery's
owner-browser check covers followed/chatter reads, pagination and workspace
joining. PRs #61–#63 are merged. The original GIPHY provider gate stays in M0.

## Structured archive queries and saved searches — #15

Implemented for review. The existing local IndexedDB archive supplies results;
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

- #16: message/conversation bookmarks, bounded context and private notes.
- #17: persistent public reply threads; #9 is merged.
- #19/#20: observation comparison and portable logs from the merged baseline.
- #18: verified VOD context after #15/#16 merge.
- #48: account-isolated user notes after #27 account profiles.
