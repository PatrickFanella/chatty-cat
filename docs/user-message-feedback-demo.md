# Private own-message feedback

Open **Own message feedback**, choose a joined channel, and follow **Grant own-message feedback permission** if needed. This explicitly adds `user:read:chat`; ordinary sign-in does not add it. After returning, choose **Connect own-message feedback**. Closing or disconnecting clears the view. Status is read-only: it does not resend messages or make moderation decisions. An approved status alone does not prove public delivery.

The [official Twitch subscriptions](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchatuser_message_hold) use the chatting user's `user_id`, the selected `broadcaster_user_id`, and version 1 for channel.chat.user_message_hold/update. This implementation verifies the returned subscription identity and checks every event's account, broadcaster, subscription, type, version, timestamp and replay ID. OAuth tokens remain on the server and are absent from socket handshakes and browser snapshots.

The feed uses the existing private EventSub transport with a separate account-keyed hub/state/row type. Two tabs share subscriptions for the same account/channel; four peers and sixteen total private hubs are allowed. Read setup is limited to twelve attempts per account per minute. Socket frames are bounded to 64 KiB; snapshots to 256 KiB, rows to 100 / fifteen minutes, text to 500 code points, and replay/resolution identities to 1,000 each. Exhausting replay capacity closes the view rather than evicting tombstones. Update-before-hold and late holds cannot resurrect resolved content. Revocation, connection loss, expiry, account/permission change, close, disconnect, channel change and privacy mode clear private text. Reconnect is explicit after loss; an allowed provider socket handoff preserves subscriptions and replay state.

Private feedback is rendered with textContent in a dedicated dialog. It is not converted to a public ChatMessage, sent to the public relay, or written to the archive, drafts, logs, journal, exports, workspace snapshots, browser storage or cross-tab messages. Public history continues to arrive through its own existing path. Unknown provider metadata is omitted from the private allowlisted snapshot. Same-origin checks and live session/scope checks gate reads, including writes of changed snapshots to SSE peers.

## Reproducible real-handler demo

Run `npm --prefix web run build`, then `go run ./web/test-support/user-holds`, and open `http://127.0.0.1:5195/?channel=one&video=off`. OAuth, Helix, EventSub socket and consent are synthetic loopback services; the app's actual auth/private feed handlers run. No Twitch requests are made.

1. Open Own message feedback, grant the fixture permission, and choose **Sign in fixture Alice**. Reopen and connect. The status becomes live after two verified user-condition subscriptions.
2. Use **Fixture: hold own message** and **Fixture: approve own message**. The canary changes from held to approved and `<script>` remains inert text. The fixture controls are moved into the private dialog for this demo only.
3. Press Alt+Shift+P. Private content clears and the dialog closes. Exit privacy mode, sign out, then grant permission as **Sign in fixture Bob** and connect again. Only Bob's own message should appear.
4. Close the view and inspect fixture counts: zero sockets remain and chatOrModerationWrites stays zero. Subscription creations are expected setup writes, not chat/moderation actions.

October 13, 2026: 673 frontend tests, production build, full Go race suite, vet and lint (zero issues) passed. Backend tests verify exact private scope, out-of-order resolution, revocation, budgets, two-tab sharing, socket migration without resubscription, explicit consent, and cross-origin/scope rejection. Browser tests verify inert text and late-event rejection. Native T3 preview exercised Alice's hold→approved status, privacy clearing, account switch to Bob, zero chat/moderation writes, no canary in public log/local storage, and zero public IndexedDB archive rows.

Positive live Twitch acceptance still needs deployment, interactive user:read:chat consent, and a real own-account held/update event in a channel where that account can be held. A broadcaster/moderator's messages may bypass AutoMod. This closes no live acceptance gate by itself.
