# Private AutoMod fixture

Run `npm --prefix web run build`, then `go run ./web/test-support/automod`.
Open `http://127.0.0.1:5198/fixture/seed` in an isolated browser profile and load the
seeded workspace. This fixture has no Twitch connection.

1. Open Moderation. Sign in as the synthetic moderator. Grant AutoMod consent
   explicitly and choose the moderator again. Connect the private queue.
2. Open the same workspace in a second tab with the same browser profile, then
   open Moderation and connect. `/fixture/stats` should report one socket.
3. Request `/fixture/event?kind=hold`. Both queues show inert held text.
   Preview ALLOW stages the exact message; `privateWrites` remains zero.
4. Confirm the reviewed decision once. `privateWrites` becomes one and both
   tabs remove the row. `/fixture/event?kind=duplicate` does not restore it.
5. `/fixture/event?kind=reconnect` transfers the connection. Then
   `/fixture/event?kind=revoke` clears both queues and closes the socket.
6. Reconnect and inject a hold again. Set `/fixture/mode?value=uncertain` before
   confirming DENY. The private receipt and row remain uncertain, with no retry.
   Provider resolution uses `/fixture/event?kind=resolve`.
7. `/fixture/event?kind=disconnect` clears stale state. Reconnect is explicit.
   Switching account/channel or entering privacy mode clears the private view.

Modes also include `confirmed` and `rejected`. No held text belongs in public
logs, archive or statistics. The private journal stores message identifiers and
outcomes, not held-message bodies. Backend tests exercise CSRF, expected identity,
receipt replay, capacity, expiry and concurrent decisions. Live acceptance is a
separate check requiring an approved Twitch channel, subject and decision.
