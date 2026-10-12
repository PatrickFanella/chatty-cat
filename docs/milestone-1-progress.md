# Milestone 1 delivery

Started 2026-10-12 from main `6c34eb5`. Track acceptance and dependencies in the Gitea milestone/project; the Chatterino coverage audit is complete.

## Named workspaces (#6)

Implemented; preparing review. Includes bounded public workspace snapshots, previewed create/rename/duplicate/switch/delete, import/export and keyboard access. Reuse existing settings/panel capture. Retain per-channel drafts in session storage and paused reader anchors by stable message key; workspace files exclude drafts, account credentials and whispers. Verify model failure cases, integrated startup/switch behavior and a local browser demo before requesting review.

Implementation checkpoint: named workspace actions and public settings import/export are implemented, with a 20-workspace / 256 KB bound, stale-tab write protection and visible storage failures. Switching reloads the view to rebuild channel-specific controllers. Active settings capture runs before disposal; per-channel drafts remain in session storage and never enter workspace files. Paused rows restore by stable key plus pixel offset, with a notice when history retention removed the key.

Browser demo on anonymous localhost: created Community from Watching, duplicated/renamed/deleted an inactive copy, switched between 18px and 20px views, retained a synthetic public draft and paused reader state, then imported Moderating with two channels, target subcult_tv and 14px settings. Import preview preceded application and injected private fields were discarded. No Twitch send or moderation action occurred. Model/navigation fixtures cover quota errors, malformed/versioned/excessive imports, exact reader offset restoration and stale-tab rejection.

The full frontend tests and production build passed after final pane-state changes. Provider/account tests are unnecessary for these local workspace controls.

## Streamer privacy (#13)

Implemented manual privacy mode with a workspace allowlist and Alt+Shift+P panic hide. The setting propagates to same-origin tabs/popouts through browser storage. Allowed views still hide account status, composer, whispers, cards, emotes/video panels and settings dialogs; unlisted workspaces hide the whole app except privacy controls. Notification/sound handling is suppressed, including a notification awaiting the service-worker lookup when the mode changes; existing app notifications are closed. Workspace/history exports and settings sharing are blocked while active. Private user notes do not exist yet; their future UI/export path must honor the same policy. Process detection remains absent and companion-only.

Full check after integration: 67 frontend files / 327 tests passed, strict TypeScript/service-worker checks and production build passed. Vite reports a >500 KB bundle warning. No deployment or provider write was performed.

Privacy browser demo: allowlisted Watching stayed visible with account/composer hidden; history export reported disabled. Alt+Shift+P hid the app header and content while the privacy toolbar stayed usable. A same-session window.open popout inherited panic mode and responded to privacy off/on storage changes; separately created T3 incognito tabs have isolated storage and were not used as propagation evidence; no account/provider write was used.

## Custom commands and message actions (#12)

Implemented up to 50 grouped definitions / 64 KB, one-word triggers, named/positional placeholders, literal brace escaping, completion and explicit expansion previews. Expansion stops at 500 code points and rejects nested custom commands, unknown placeholders and unsupported native slash commands. A selected-message action retains its original public channel/user/message context, checks the current account before staging and preserves drafts in other channels. Staging fills the composer; only a separate normal Send action can contact Twitch. Unknown channel IDs/title/category are reported as unavailable; the current metadata service does not expose a game/category field.

Browser demo: saved a Community greeting and expanded `/greet friendly chat` to `Hello friendly chat in patrick__eff`; the signed-out preview could not stage/send. The signed-in fixture exercised a selected-user timeout in its original channel while retaining another channel's draft and making no fetch call. Privacy checks also confirmed that clicking masked Settings/Stats/Workspace/Archive/Commands controls opened no hidden modal.

Full frontend suite after template and privacy-dialog integration passed 69 files / 334 tests, strict checks and production build. No provider write or deployment was performed.

## Conversation inbox (#9)

Implemented separate mentions, reply-thread and private-whisper sections, channel filters, unread counts, individual/section read controls and jumps to public archive context without changing the send target. Retained public read markers merge across same-account tabs; account changes clear every private item from memory and DOM. Public sections retain at most 500 items each, whispers 200, with bounded dedup/participation sets and read markers. History classification yields every 500 records and inbox painting runs at most once per animation frame. Reading anchors and focused row controls survive new arrivals.

A pending private send is bound to its original authentication generation and cannot echo into a later session. Explicit private drafts clear on account change. Privacy mode also unloads the hidden Twitch frame; leaving the mode restores its view with autoplay disabled. Storage denial leaves anonymous reading usable and explicit privacy toggles can work within the current view; the UI discloses when other tabs cannot be updated.

Reproduce the inbox browser demo with `npm --prefix web run dev -- --port 5174`, then open `http://127.0.0.1:5174/inbox-demo.html`. It uses synthetic identities/messages only and makes no Twitch connection or send API request. Observe one deduplicated mention, one reply and one private whisper; jump to public context while the send target stays `other`; switch the fixture account and verify the old private text disappears. Public read markers persist; whisper contents are absent from browser storage. “Seed reading fixture” and “Add synthetic live mention” exercise scroll anchoring: the observed anchor key stayed the same and offset changed by less than 0.12 px across an arrival with 202 mounted inbox items. This fixture is a dev-only entrypoint, excluded from the production build.

Current delivery batch covers #6, #9, #12 and #13. Remaining Milestone 1 issues stay open; this does not declare the milestone or Chatterino parity complete. No deployment or live Twitch delivery test was performed for this batch.

Final inbox checkpoint: 71 frontend files / 344 tests passed, strict TypeScript/service-worker checks and production build passed. The current main bundle is about 533 KB before gzip (139 KB gzip); Vite reports its >500 KB warning. Tests cover public-context access even when read-state storage fails. PR #50 was merged while inbox work was being verified, so #6/#12/#13 are now on main and the inbox is delivered in a separate follow-up PR. Production deployment has not changed.

## Independent panes and tabs (#7)

PR #51 merged as `d268e99`; the conversation inbox (#9) is now on main. Independent layouts add up to 8 tabs, 6 panes per tab and 24 live pane definitions, with 8 recently closed entries and a 32 KB public layout snapshot. Pane preferences include a joined channel group, send target, literal text filter, width, direction, hover pause, unread count and stable reader anchor. Tabs/panes support creation, duplication, reordering, closure and reopening. Portrait views collapse to the active pane with a visible pane selector. Alt+Left/Right moves pane focus, Alt+Up/Down moves tab focus, and adding Shift rearranges the corresponding pane or tab. These shortcuts act within the chat view and ignore IME composition.

Duplicate panes reuse the view's existing ChatConnection, retained transcript and metadata controllers. Only the active tab mounts readers; each reader has a distinct bounded DOM cache scope. Hidden tabs and collapsed/held panes accrue bounded unread counts; local echoes and server confirmations share a dedup key. Public archive context opens in one pane without replacing other live feeds or changing the composer target. Per-channel composer drafts retain their existing session boundaries. Layout files discard credential, private message and draft fields. Popouts restore one pane, keep the parent workspace intact, start with video off and use the existing privacy propagation. Retired rows and closed readers unload inline video/audio/iframes.

Reproduce the synthetic 100,000-message demo with `npm --prefix web run dev -- --port 5174`, then open `http://127.0.0.1:5174/splits-demo.html`. It mounts two virtual readers for alice/bob and makes no Twitch connection or send request. Local browser observation: 74 mounted rows total. Full-app anonymous checks exercised separate channel groups/targets, tab creation/switching, workspace reload, a single-pane popout, and a 375×812 viewport with one visible pane and no horizontal overflow. A held reader kept the same message key and exact pixel offset across a synthetic browser-only arrival. No Twitch send, moderation action or production deployment occurred.

The six-channel source limit remains in place; raising channel admission is tracked separately in #8. Original page-column and rail presets remain available when independent panes are disabled. The bundle remains over Vite's 500 KB advisory threshold.

Split verification checkpoint: 73 frontend files / 359 tests passed, strict TypeScript/service-worker checks and production build passed. Review added regression coverage for held keyboard navigation, same-channel reply preservation and pending-send destination guards. The single-pane popout mounted no Twitch iframe after workspace restoration.

## Action palette and editable shortcuts (#11)

Implemented 26 supported actions with explicit contexts/default bindings, a searchable keyboard-operated palette, and quick switches for joined send channels, named workspaces, tabs and panes. Workspace quick switches retain the existing preview/Apply flow. Binding edits show conflicts before saving, support chord recording and individual disabling, reject browser/privacy conflicts, and restore defaults independently of display/workspace preferences. IME composition, ordinary text editing, existing modal dialogs and privacy mode are respected. Pane-specific actions require independent layouts. Public reconnect replaces the old socket and pending retry; palette actions never send a chat message.

Shortcut preferences are included in the bounded public workspace bundle; malformed/conflicting imports are rejected and private/unknown fields are removed. Stale-tab edits and storage failures leave the active bindings intact. Popout workspace controls are read-only, and changing a pane send target preserves the reader node/hold. Archive context rebuilds its display visibility from retained public source keys when settings change.

Anonymous full-app browser checks searched and selected subcult_tv as the send target, displayed a duplicate-binding conflict with Save disabled, changed zoom-in to Alt+KeyU and used that physical chord to move chat text from 18px to 19px. Alt+KeyK opened action search; searching Watching and pressing Enter opened the workspace preview without navigating. No Twitch send or production deployment occurred.

Shortcut verification checkpoint: 76 frontend files / 373 tests passed, strict TypeScript/service-worker checks and production build passed. The main bundle is about 574 KB raw / 151 KB gzip, with Vite's existing advisory. Independent layouts merged in PR #52 as `9c23317` while the shortcut follow-up was being published. PR #53 now targets main and awaits review. Channel-capacity #8 is Ready; the milestone remains open.
