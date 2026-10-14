# Feature roadmap

Delivery is tracked in the [Gitea roadmap](https://git.subcult.tv/subculture-collective/chatty-cat/issues/3) and [project board](https://git.subcult.tv/subculture-collective/chatty-cat/projects/2). The parity implementation was merged in [PR #2](https://git.subcult.tv/subculture-collective/chatty-cat/pulls/2).

The adoption reference is [Chatterino 2.5.6](https://github.com/Chatterino/chatterino2/tree/v2.5.6), reviewed on 2026-10-11 against the [official wiki](https://wiki.chatterino.com/) and [release notes](https://chatterino.com/changelog). This is a delivery plan, not a claim that Chatty Cat already implements every Chatterino feature. The [completed coverage audit](chatterino-coverage.md) maps exact settings, commands and hotkeys to implementation evidence, platform limits and delivery issues.

## Delivery stages

| Milestone | Outcome |
| --- | --- |
| M0 — Parity release acceptance | Review PR #2, preserve deployed acceptance evidence and resolve or explicitly accept the external GIPHY cache/proxy gap. |
| M1 — Workspaces and daily chat workflow | Named workspaces and conversation inbox first, followed by independent splits, bounded channel capacity, rules, hotkeys, commands, discovery and streamer privacy. |
| M2 — Conversation history and insights | Structured archive search, bookmarks, threads, VOD context, stream comparison and portable logs. |
| M3 — Moderation and broadcaster operations | A permission-aware moderation workspace, custom actions, AutoMod and suspicious-user workflows, polls and predictions. |
| M4 — Portability, emotes and media | Account profiles, safe imports, optional device sync, custom themes, media uploads, provider updates and composer refinements. |
| M5 — Companion and ecosystem | Opt-in external playback, browser companion, sandboxed extensions and owner-configured IRC support. No automatic native execution from web content. |

## Live acceptance checkpoint — October 13, 2026

The owner completed these checks at `chat.subcult.tv` as `patrick__eff` in regular browsers:

- **Image hosting (#30):** reviewed upload, public image display, receipt persistence after reload, owner deletion and public-link 404 passed.
- **Device sync (#29):** published saved workspaces, fetched the same revision after reload and in a second isolated browser, applied the snapshot with the expected channels/layout, then deleted it. A subsequent fetch showed no active snapshot; both browsers retained their local workspaces. The agent also verified the published revision in the production store before deletion.
- **Provider activity (#31):** reviewed `patrick__eff` in `#hasanabi` with BTTV and 7TV, started the session and observed Live, then stopped it. The owner confirmed the session ended and the active toolbar indicator disappeared. This proves the observed browser flow; BTTV sends are not delivery receipts, and independent provider-side presence readback was not captured.

M4 remains open. Controlled live emote changes and cosmetic badge events, supplemental public/own-message EventSub cases with consent and suitable external conditions, remain outstanding. The earlier source-cache mismatch has cleared on public-browser recheck; both source URLs now match the deployed release hash. Sync conflict/lost-receipt/recovery cases retain fixture evidence; they were not repeated in production. Upload persistence across a server restart or reboot was not exercised. Native feature limitations and earlier M3 private-event/journal and eligible broadcaster gates remain separate.

## Implementation issues

| Issue | Deliverable | Blocking issues |
| --- | --- | --- |
| [#5](https://git.subcult.tv/subculture-collective/chatty-cat/issues/5) | Audit Chatterino 2.5.6 feature coverage and web adaptations | None |
| [#6](https://git.subcult.tv/subculture-collective/chatty-cat/issues/6) | Save and switch named channel workspaces | #2 |
| [#7](https://git.subcult.tv/subculture-collective/chatty-cat/issues/7) | Add independent channel splits and tabbed layouts | #6 |
| [#8](https://git.subcult.tv/subculture-collective/chatty-cat/issues/8) | Support larger workspaces with channel admission limits | #7 |
| [#9](https://git.subcult.tv/subculture-collective/chatty-cat/issues/9) | Build a unified mentions, replies and whispers inbox | #2 |
| [#10](https://git.subcult.tv/subculture-collective/chatty-cat/issues/10) | Add reusable message filters and highlight rules | #2 |
| [#11](https://git.subcult.tv/subculture-collective/chatty-cat/issues/11) | Add customizable hotkeys and a quick switcher | #6 |
| [#12](https://git.subcult.tv/subculture-collective/chatty-cat/issues/12) | Add custom commands and reusable message actions | #2 |
| [#13](https://git.subcult.tv/subculture-collective/chatty-cat/issues/13) | Add streamer privacy mode for capture and sharing | #2 |
| [#14](https://git.subcult.tv/subculture-collective/chatty-cat/issues/14) | Add followed/live channel discovery and a viewers panel | #6 |
| [#15](https://git.subcult.tv/subculture-collective/chatty-cat/issues/15) | Add structured archive queries and saved searches | #2 |
| [#16](https://git.subcult.tv/subculture-collective/chatty-cat/issues/16) | Bookmark messages and conversations with personal notes | #2 |
| [#17](https://git.subcult.tv/subculture-collective/chatty-cat/issues/17) | Add a persistent public reply-thread viewer | #9 |
| [#18](https://git.subcult.tv/subculture-collective/chatty-cat/issues/18) | Jump from archive and bookmarks to matching VOD time | #15, #16 |
| [#19](https://git.subcult.tv/subculture-collective/chatty-cat/issues/19) | Compare observed stream activity on a shared timeline | #2 |
| [#20](https://git.subcult.tv/subculture-collective/chatty-cat/issues/20) | Export channel logs with retention and recovery controls | #2 |
| [#21](https://git.subcult.tv/subculture-collective/chatty-cat/issues/21) | Build a permission-aware moderation workspace | #15 |
| [#22](https://git.subcult.tv/subculture-collective/chatty-cat/issues/22) | Customize moderation buttons and timeout presets | #21, #12 |
| [#23](https://git.subcult.tv/subculture-collective/chatty-cat/issues/23) | Add an AutoMod held-message review queue | #21 |
| [#24](https://git.subcult.tv/subculture-collective/chatty-cat/issues/24) | Add suspicious-user monitoring and restriction controls | #21 |
| [#25](https://git.subcult.tv/subculture-collective/chatty-cat/issues/25) | Create and manage broadcaster polls | #2 |
| [#26](https://git.subcult.tv/subculture-collective/chatty-cat/issues/26) | Create and resolve broadcaster predictions | #2 |
| [#27](https://git.subcult.tv/subculture-collective/chatty-cat/issues/27) | Support isolated signed-in account profiles | #2 |
| [#28](https://git.subcult.tv/subculture-collective/chatty-cat/issues/28) | Import Chatterino layouts and settings without credentials | #6, #27, #12 |
| [#29](https://git.subcult.tv/subculture-collective/chatty-cat/issues/29) | Add optional self-hosted cross-device sync | #6, #16, #27 |
| [#30](https://git.subcult.tv/subculture-collective/chatty-cat/issues/30) | Add opt-in image paste and drag-and-drop uploads | #2 |
| [#31](https://git.subcult.tv/subculture-collective/chatty-cat/issues/31) | Add live provider updates and cosmetic badge controls | #2 |
| [#32](https://git.subcult.tv/subculture-collective/chatty-cat/issues/32) | Render shared-chat, reward and watch-streak context | #10, #15 |
| [#33](https://git.subcult.tv/subculture-collective/chatty-cat/issues/33) | Add smarter completion, local nicknames and optional spellcheck | #2 |
| [#34](https://git.subcult.tv/subculture-collective/chatty-cat/issues/34) | Add validated custom theme import and live preview | #2 |
| [#35](https://git.subcult.tv/subculture-collective/chatty-cat/issues/35) | Add an opt-in desktop playback companion | #6 |
| [#36](https://git.subcult.tv/subculture-collective/chatty-cat/issues/36) | Add a browser companion for the currently watched channel | #6 |
| [#37](https://git.subcult.tv/subculture-collective/chatty-cat/issues/37) | Add a capability-limited extension framework | #12 |
| [#38](https://git.subcult.tv/subculture-collective/chatty-cat/issues/38) | Add owner-configured IRC networks and private conversations | #7 |

## Audit follow-ups

The [Chatterino inventory](chatterino-coverage.csv) and [report](chatterino-coverage.md) identified additional slices:

- [#40](https://git.subcult.tv/subculture-collective/chatty-cat/issues/40) — Dispatch local Chatterino commands without sending them to Twitch.
- [#41](https://git.subcult.tv/subculture-collective/chatty-cat/issues/41) — Add permission-aware clip, marker and broadcaster management actions.
- [#42](https://git.subcult.tv/subculture-collective/chatty-cat/issues/42) — Add warnings, Shield Mode and ID-based moderation commands.
- [#43](https://git.subcult.tv/subculture-collective/chatty-cat/issues/43) — Add Chatterino message and interface presentation controls.
- [#44](https://git.subcult.tv/subculture-collective/chatty-cat/issues/44) — Add configurable safe link previews and selection search.
- [#45](https://git.subcult.tv/subculture-collective/chatty-cat/issues/45) — Add a versioned Unicode emoji catalog, categories and style controls.
- [#46](https://git.subcult.tv/subculture-collective/chatty-cat/issues/46) — Add bounded similar-message filtering with explicit highlight behavior.
- [#47](https://git.subcult.tv/subculture-collective/chatty-cat/issues/47) — Add an optional paired desktop overlay with click-through controls.
- [#48](https://git.subcult.tv/subculture-collective/chatty-cat/issues/48) — Private per-user notes in account-isolated user cards.

## Operating the board

- PR #2 is merged. The coverage audit is complete; named workspaces #6 and the conversation inbox #9 are the first implementation priorities.
- Internal dependencies remain Backlog until their blockers are satisfied. Move the next available tickets to Ready and apply `ready-for-agent`; a closed but unmerged PR does not satisfy the baseline.
- Use In Progress for owned work, Review for an attached PR, Blocked for external impediments, and Done after acceptance evidence is recorded.
- Each issue has a demoable outcome, acceptance criteria and native dependency links. Delivery issues remain unassigned until work is owned; milestone dates are unset until an owner commits to delivery.
- Keep web features usable without native integrations. Streamlink/player launch, watched-channel bridging and process-aware privacy require explicit companion pairing.
- Chatterino import must exclude its stored credentials. Provider-specific unavailable features are disclosed rather than invented.

## Legacy parity exception

The remaining original GIPHY cache/proxy gate is tracked in [#4](https://git.subcult.tv/subculture-collective/chatty-cat/issues/4). Direct client lookup works. Provider approval or explicit acceptance of that supported adaptation is required to close the gate.


Public-context connection acceptance: on October 13, the owner granted the required access and connected from the signed-in browser. The panel reported “Live public context (latest 100 relevant messages / 15 minutes, snapshots every two seconds); bodies excluded”. This passes consent/connection and does not establish a positive shared-chat, reward, streak, effect or private hold/update event. Those controlled-event checks remain open under #32.
