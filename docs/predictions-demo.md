# Broadcaster prediction fixture

Build `npm --prefix web run build`, then run
`go run ./web/test-support/predictions`. Open
`http://127.0.0.1:5201/fixture/seed` in an isolated browser profile. Sign in as
broadcaster one. Open Moderation, grant prediction consent and select broadcaster
one again. No Twitch traffic or real Channel Points settlement occurs.

1. Refresh/reconnect predictions. Set a title, two outcome lines and a 30-second
   window. Preview new prediction: `/fixture/stats` reports zero writes.
   Separate confirmation creates ACTIVE provider state.
2. Preview resolution for One. The review displays winning outcome title and ID,
   broadcaster/channel and points-distribution effect. Confirm once: RESOLVED,
   matching winner and aggregate counts. No payout amount is inferred.
3. Create another prediction. Wait one second between confirmed actions; the
   local rate guard otherwise rejects without another provider write. Preview
   LOCKED and confirm. Reopen the workspace and refresh to restore LOCKED state.
4. Preview CANCELED and confirm; Twitch's real action would refund participants.
   The fixture returns CANCELED with a timestamped acknowledgement.
5. For uncertainty, create another prediction and preview its terminal action.
   Set `/fixture/mode?value=uncertain` before confirming. The private receipt
   remains uncertain, no retry occurs, and another action requires explicit refresh.
6. Read-only consent disables action controls. Account/channel/privacy changes
   clear private state. Unchanged reads preserve focused action controls.

Tests cover missing/foreign winners, incorrect acknowledgement winners, stale
state, CSRF, scope, identity, replay, pending receipts and account isolation. The
fixture does not simulate natural locking, real participants or settlement. Live
acceptance is separate; the owner has authorized needed M3 checks, but Twitch
login/consent in the shared browser remains required. Command aliases are planned.
