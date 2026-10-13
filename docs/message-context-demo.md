# Twitch message context demo

Build the web app and run `python3 web/test-support/message-context-browser-fixture.py`. Open `http://127.0.0.1:5194/?channel=current,origin&video=off`. The fixture supplies public synthetic IRC-shaped events: a shared message in two destinations, a duplicate replay with another copy ID, a watch streak, and a known paid effect. Provider writes are rejected.

1. Four rows should remain from five events. The two shared rows retain their receiving channels and show **Shared origin #origin**. Known source badge images are labeled **Origin**; unknown origin names remain literal room IDs, and unknown source badges remain text. Receiving-channel role tags are not rewritten.
2. The streak states **10 streams · 450 points reported**. Its values come only from the supplied tags. The effect states **animated-message (text fallback)**. Reward IDs are displayed without guessing missing titles or costs. Unsupported visuals are not synthesized.
3. Reply to the shared copy in #current. The composer stays in #current, uses that copy's message ID, and explains that Twitch may relay the reply within Shared Chat. Nothing is sent automatically.
4. Search the local archive for `source:100 sourcebadge:subscriber is:shared reward:reward-one`. It returns the two receiving-context rows. `is:streak`, `streak:10`, and `effect:animated-message` target their supplied context. Missing context does not become a match. The same new context fields are available in bounded message rules.

## Identity and transport boundaries

The [official Twitch IRC shared-chat specification](https://dev.twitch.tv/docs/chat/irc/#shared-chat) distinguishes the receiving room/copy ID from source-room-id and source-id. Source badges remain scoped to their origin. Public metadata now includes a validated broadcaster ID when known, allowing joined origins to resolve without guessing a channel login or requesting arbitrary lookups.

The live store deduplicates canonical source IDs within each receiving channel, retains distinct destination copies, and upgrades an existing copy if later transport data supplies source context. Alert and rule counters use supplied source identity across destinations. Existing archive keys/schema remain unchanged; this does not rewrite historical rows or invent context omitted by older transports. Native emote ranges and reply IDs remain those of the received copy. The IRC parser preserves the raw context and now attributes USERNOTICE senders from a validated login tag.

Only recognized supplied reward/effect/streak tags produce labels. Watch-streak points are reported observations, not an assertion that this viewer earned points. The [pinned Chatterino handler](https://github.com/Chatterino/chatterino2/blob/v2.5.6/src/providers/twitch/IrcMessageHandler.cpp) recognizes the animated-message and gigantified-emote-message types used for explicit textual effect fallbacks.

October 13, 2026: full frontend suite (670 tests) passed, plus the added shared-alert regression; production build, full Go race suite, focused IRC race regression, vet and lint passed. Native T3 preview verified the four-row log, known origin badges, supplied streak/effect labels, receiving-copy reply context, and exact two-result archive query. Positive live Twitch shared-chat, reward and streak acceptance remains open.

This public-context step is partial #32. Account-private channel.chat.user_message_hold/update feedback and additional EventSub source metadata still require their own scoped implementation and live acceptance. No held private content enters this demo, live store or archive.
