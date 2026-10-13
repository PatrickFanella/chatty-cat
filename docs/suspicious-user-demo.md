# Suspicious-user fixture

Build with `npm --prefix web run build`, then run
`go run ./web/test-support/suspicious`. Open
`http://127.0.0.1:5199/fixture/seed` in an isolated browser profile and seed synthetic
history. No Twitch connection or real provider writes occur.

1. Sign in as moderator. Open Moderation, grant suspicious-user consent explicitly
   and select moderator again. Connect private suspicious-user signals.
2. `/fixture/event?kind=hold` delivers one private message with reported restricted
   treatment, type, shared-ban channel and evaluation. Text is inert.
3. Preview restrict opens exact actor/channel/subject review. `/fixture/stats`
   still reports zero private writes. Confirm once: one confirmed private receipt.
4. In a second tab on the same origin/profile, open Moderation and connect.
   Both tabs share one socket. `/fixture/event?kind=resolve` updates treatment
   to no_treatment; message/types/evaluation become unavailable in both tabs.
5. `/fixture/event?kind=reconnect` transfers subscriptions. A duplicate earlier
   message cannot overwrite the newer update. `/fixture/event?kind=revoke` clears
   both views and closes the provider socket.
6. Reconnect, inject a message and preview monitor. Set
   `/fixture/mode?value=uncertain` before confirming. The journal records uncertain;
   no retry is sent. `rejected` and `confirmed` modes exercise explicit outcomes.
7. `/lowtrust one` opens the joined-channel view without connecting or sending.
   An outsider or missing consent cannot subscribe or stage authorized writes.
   Account/privacy changes clear the view; private signals do not enter public logs.

Backend tests verify identities/scopes, exact acknowledgement fields and stream
handoff. Real provider acceptance remains separate and needs an approved channel,
subject and treatment. Lead Moderator assignment remains unavailable.
