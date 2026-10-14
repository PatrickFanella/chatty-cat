# Optional provider read-service demo

Build with `npm --prefix web run build`, then run `python3 web/test-support/provider-events-browser-fixture.py` from the repository root. Open `http://127.0.0.1:5198/?channel=room&video=off`. This synthetic fixture replaces provider sockets and serves public metadata; it does not announce a real account or write provider activity.

1. In a fresh browser profile, verify four public rows, one chat socket and zero optional sockets (`window.fixtureProviderSockets.length`).
2. Open **Provider and badge preferences**. Select BTTV cosmetics, 7TV cosmetics and 7TV event connections. Edits and **Review** leave the socket count at zero. **Apply** saves the profile and opens the read connections.
3. Inspect each fixture socket's `sent` array: BTTV sends one `join_channel`; 7TV sends six `op:35` read subscriptions for the global/channel sets, owner and three channel cosmetic event types. There is no `broadcast_me`, Identify/Signal or presence request.
4. Invoke `window.fixtureDeliverBadges()`. The first public row gains separately attributed BTTV and 7TV cosmetic labels. Its supplied native moderator/subscriber tags remain unchanged. Synthetic nonexistent images fall back to their attributed text labels.
5. Invoke `window.fixtureHint()`. `/fixture-count` shows another metadata read. The boot ID and one chat socket remain unchanged. Repeated hints coalesce through the existing 30-second metadata cooldown.
6. Enable privacy mode. Both optional sockets close (readyState 3), and cosmetic labels disappear on the next render. Leaving privacy does not reconnect them automatically. The fixture's write count remains zero.

The native T3 preview passed these checks on 2026-10-13. Automated checks cover three-socket/24-channel/80-subscription bounds, capability revocation, authentication/profile changes, late configuration and frame callbacks, malformed/oversized input, missed heartbeats, manual retry and badge retention. The full frontend suite passed 722 tests; Go race tests, vet, lint and the production build also passed.

The first full suite exposed an unnecessary cosmetic-clear callback scheduling a render after the test removed its UI. The client now requests that render only when it actually clears assigned badges, and avoids it during page teardown. The focused boot/capacity test and full suite then passed without unhandled errors.

This proves local behavior. Production configuration, a real public cosmetic assignment and a controlled provider emote-set change remain acceptance gates. The Chatterino catalog's previously observed 403 is a separate service issue. Activity announcements are not part of this read layer.
