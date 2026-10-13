# Live M3 acceptance — October 13, 2026

The owner authorized the controlled live checks and signed in as `patrick__eff`.
The server verified account and broadcaster ID `69674313` for that account's own
channel. No action targeted another channel or an unrelated chatter.

## Verified live

The moderation workspace read the broadcaster role, room settings, current target
state and inactive Shield Mode. A reviewed `/shield` command received a confirmed
provider result at 10:19:56 UTC. A separately reviewed `/shieldoff` received a
confirmed result at 10:20:05 UTC. Both appear as confirmed private journal receipts.
A fresh read afterward confirmed Shield Mode inactive and the original observed
room settings retained. The intermediate active state was not separately verified
by a read; confirmation validated the provider response.

## Further acceptance in the regular browser

The combined consent flow completed in the owner's regular browser. The shared
preview remained signed out because it has a separate browser session. A separate
agent-created tab in the regular browser reused the successful `patrick__eff`
session; no credential or session-cookie transfer was needed.

On the deployed release through PR #79, broadcaster context verified the account,
channel ID and offline state. Poll and prediction reads returned zero existing
items. AutoMod and suspicious-user EventSub feeds both reached their live states
with zero observed holds/users. This verifies consent and subscription acceptance;
it does not verify event delivery or decisions. Both test feeds were explicitly
disconnected afterward.

Four separately reviewed metadata writes received confirmed results and exact
server readback:

| UTC receipt time | Action | Outcome |
| --- | --- | --- |
| 10:36:44 | Temporary test title | Confirmed |
| 10:37:20 | Restore original title | Confirmed |
| 10:38:44 | Science & Technology, exact ID `509670` | Confirmed |
| 10:39:00 | Restore Just Chatting, exact ID `509658` | Confirmed |

Additional fresh reads verified the temporary title/category and their restoration.
The regular browser's private journal displayed all four confirmed receipts before
the persistence check below. The two earlier Shield receipts were observed in the
shared preview's separate local journal.
Previewing clip, marker and commercial actions while offline refused each action
before confirmation. No clip, marker or commercial request was sent.

Only the `patrick__eff` account profile was available. User-targeted live moderation
still needs a controlled second account and a recent test message. Twitch's
[message deletion API](https://dev.twitch.tv/docs/api/reference/#delete-chat-messages)
cannot delete broadcaster or other moderator messages. No unrelated chatter was
selected and no chat message was sent for this test.

The channel reported no Affiliate/Partner status. Poll/prediction creation was not
attempted; it needs an eligible broadcaster. Twitch's
[poll API guide](https://dev.twitch.tv/docs/api/polls/) restricts running polls to
Affiliates and Partners. Read access alone does not prove write eligibility.
Clip/marker/commercial delivery additionally needs a suitable live stream. Actual
AutoMod holds and suspicious-user signals remain external event gates. M3 is open.

### Journal persistence is not accepted

After closing/reopening the workspace and opening/closing Accounts without an
account switch, the regular-browser test tab reported a closing IndexedDB connection.
After reload and authenticated reopen, refresh displayed zero receipts. No retention
apply, forgetting or storage-clearing action was performed by the agent. External
browser storage changes and the database-close cause remain unverified. The provider
acknowledgements and metadata restoration were already verified; no write was retried.

A local synthetic test in the same browser preserved one confirmed receipt across
workspace close/reopen and page reload. Thus the close/reopen path alone does not
establish the cause. Production journal persistence remains an M3 acceptance gate;
capture a private backup before further live writes and diagnose the storage transition.

## Earlier consent interruption

The first signed-in session lacked the optional AutoMod, suspicious-user, poll and
prediction scopes. The shared preview was navigated to the combined Twitch consent
flow for those permissions, moderator-membership reads and followed-channel reads.
The provider page could not be inspected: preview snapshot and evaluation each
timed out after 15 seconds. Consent completion remains pending. Reauthentication
temporarily clears the current app session; it must finish before further writes.

Warnings, timeouts, numeric bans and suspicious treatment need a controlled second
account. The broadcaster cannot be used as its own ban/timeout target. AutoMod and
suspicious-event acceptance need actual provider-delivered events. Poll and
prediction tests need Twitch-established broadcaster eligibility. These checks,
message deletion and live-stream broadcaster controls remained unverified at that
checkpoint. The subsequent results above supersede its sign-in and metadata gates.

## Channel replacement defect

Replacing a saved single-channel workspace with `patrick__eff` displayed a false
layout-capacity error and restored the old channel. Adding the test channel beside
the existing channel worked and enabled the Shield checks above. The root cause
was a duplicate insertion: remapping an empty pane first assigned the new channel,
then the new-channel pass added it again, causing layout validation to fail.
The correction skips new channels already present in live panes, preserving pane
preferences and clearing reader anchors for departed channels. The focused
regression failed before the correction and passed afterward. This correction
does not itself establish production acceptance until deployed and retested.
Verification: six focused capacity/layout tests, all 572 frontend tests, strict
TypeScript and the production build pass. Native Chromium replaced `one` with
`patrick__eff` in the local built application and retained the new channel after
navigation, without the false capacity error. The synthetic fixture does not
provide public chat for that test channel; this check verifies the join flow only.
