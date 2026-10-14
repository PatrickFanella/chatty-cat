# M4 message context progress

Public IRC context for #32 is implemented and verified locally: shared origins/source badges, receiving-copy replies, supplied rewards/streaks/effect fallbacks, archive/rule predicates, source-aware counters and replay dedup. See [message-context-demo.md](message-context-demo.md).

Private own-message hold/update feedback is implemented in [user-message-feedback-demo.md](user-message-feedback-demo.md). Supplemental public EventSub source/reward/effect/streak metadata is now implemented with explicit connection, shared admission, bounded snapshots and strict matching to existing public bodies. See [the contract and reproducible demo](eventsub-public-context-demo.md). Positive live consent/event acceptance remains open. Positive live shared-chat/reward/streak acceptance is also open; fixtures do not close it. This step does not close #32 or M4.


The context/feedback implementation is deployed in release 5892994. The M4 closeout review retained #32 as the final open delivery issue: controlled positive shared-chat/reward/streak/effect and private own-message hold/update events remain unverified. These require the owner's signed-in browser and suitable Twitch events; a healthy anonymous route or fixture cannot establish them. No additional implementation gap was found in this bounded review.


Public-context connection acceptance: on October 13, the owner granted the required access and connected from the signed-in browser. The panel reported “Live public context (latest 100 relevant messages / 15 minutes, snapshots every two seconds); bodies excluded”. This passes consent/connection and does not establish a positive shared-chat, reward, streak, effect or private hold/update event. Those controlled-event checks remain open under #32.
