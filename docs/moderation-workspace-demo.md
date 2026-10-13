# Moderation workspace demo

This fixture runs the real session, context and command handlers against a local
synthetic provider. It never connects to Twitch. Run from the repository root:

```sh
npm --prefix web ci
npm --prefix web run build
go run ./web/test-support/moderation
```

Use a fresh browser profile at `http://127.0.0.1:5197/fixture/seed`. Seed retained
history, then visit `/api/auth/login?channel=one&moderation=read` and choose
**Consent as moderator**. The three synthetic accounts are moderator `42`,
outsider `43` and broadcaster one `123`; all have action scopes, but only the
moderator/broadcaster have the selected channel role. No IRC scopes are returned.

1. Open **Moderation**, enter `viewer`, and refresh context/history. The actor is
   moderator, target ID is `456`, and channel ID is `123`. Ban state is explicitly
   unavailable to this moderator. The archive contains 201 equal-time public
   messages and one deletion notice. Three pages return 100 / 100 / 1 messages,
   with 201 unique message IDs. Deleted text is redacted and cannot be selected.
   Each row identifies stable-ID versus imported/ID-less login matching.
2. Select timeout and enter an action reason. **Preview moderation action** shows
   the target, channel, actor and required scope. `/fixture/stats` must still show
   zero writes. **Confirm reviewed moderation action** first saves a pending
   private receipt, rechecks role/identities and makes one command request. A
   successful fixture response records confirmed. Reasons are sent to the provider
   for ban/timeout and retained in the private journal.
3. Change the synthetic mode by opening `/fixture/mode?value=rejected` in another
   fixture tab. Refresh, preview and confirm: the result is rejected. Repeat with
   `value=uncertain`: the result is uncertain with no automatic retry. Leave at
   least one second between confirmations; the existing server send-rate limit
   otherwise rejects delivery locally, with that reason recorded in the journal.
4. Refresh/stage with confirmed mode, then switch to `value=revoked` before
   confirming. The membership recheck records rejected without a provider write.
   Repeat staging with confirmed mode, then set `value=identity-race` before
   confirmation: the context resolves target `456`, but the command lookup resolves
   `999`. The server refuses the expected-ID mismatch before writing. Restore
   confirmed mode afterward. Context reads are limited to 12 per account/minute.
5. Preview and download the private moderation journal. It includes account,
   reviewed IDs, commands/reasons, timestamps and local outcomes. The observed
   six-receipt file was 2,430 bytes, containing confirmed, rejected and uncertain
   outcomes, with no tokens or CSRF fields. The observed 46,180-byte public log
   download excludes the private reason and deleted body. Public stats still
   count only observed chat messages, not journal receipts.
6. Reconnect through the fixture login as outsider. Retained public history still
   loads; actor role is viewer, staging is refused and the private journal is empty.
   Reconnect as moderator: the original six receipts return. This tests real
   session boundaries and native IndexedDB, rather than changing only a UI label.
7. Change row/age limits and preview retention before applying. Editing the limits
   invalidates a pending preview; concurrent journal changes require a new one.
   Pending receipts survive automatic pruning. An explicit age preview/apply can
   remove an eligible old pending receipt; the native check removed exactly one
   synthetic 10-day-old receipt under a seven-day policy. Export a current private
   backup before removing real receipts. Privacy closes the workspace and clears
   the private preview/download state.

Automated regressions also cover concurrent transactional writers, pending-capacity
exhaustion, immutable terminal outcomes, delayed retention previews, account changes
during requests, unknown roles, normalized reasons and unsupported commands.
Journal bounds are 100–1,000 rows, 1 MB including reserved pending-outcome space,
and no age limit or 7/30/90 days. Exports are local action receipts, not Twitch
moderator audit history. Missing retained history remains unavailable.

Live moderation delivery is not accepted by this fixture. It requires an approved
channel/target/action and real provider consent. Discovery-read approval for
patrick__eff does not authorize moderation writes.
