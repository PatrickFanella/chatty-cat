# M4 message context progress

Public IRC context for #32 is implemented and verified locally: shared origins/source badges, receiving-copy replies, supplied rewards/streaks/effect fallbacks, archive/rule predicates, source-aware counters and replay dedup. See [message-context-demo.md](message-context-demo.md).

Private own-message hold/update feedback is implemented in [user-message-feedback-demo.md](user-message-feedback-demo.md). Supplemental public EventSub source/reward/effect/streak metadata is now implemented with explicit connection, shared admission, bounded snapshots and strict matching to existing public bodies. See [the contract and reproducible demo](eventsub-public-context-demo.md). Positive live consent/event acceptance remains open. Positive live shared-chat/reward/streak acceptance is also open; fixtures do not close it. This step does not close #32 or M4.
