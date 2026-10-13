# Live M3 acceptance — October 13, 2026

## Live clip and marker acceptance — 17:36–17:38 UTC

After the owner started a test stream, fresh provider context verified `patrick__eff`
/ actor and broadcaster ID `69674313`, broadcaster role and live stream
`321789911385`. The previously approved broadcaster/clip consent was renewed in
the regular browser for the same account. The empty journal was backed up separately
before the new writes; the earlier four-receipt backup was preserved.

One separately reviewed `/clip` request received published confirmation. The
confirmed clip is
[`TacitWittyMangetoutSeemsGood-pp-SfURRwfhChFNP`](https://clips.twitch.tv/TacitWittyMangetoutSeemsGood-pp-SfURRwfhChFNP).
Its receipt `b9835ed8-62b8-4d22-a1e1-3183ff745179` is confirmed at
`2026-10-13T17:36:34.450Z`. Capture acceptance alone was not treated as publication;
the application waited for the matching published clip response.

One separately reviewed `/marker Chatty Cat acceptance test` request received
provider confirmation for marker `89acf4250b90b3c8700ddca5f4c50762` at 200 seconds.
Its receipt `4fa34a46-c807-48bf-93cd-dc74a163ba10` is confirmed at
`2026-10-13T17:37:07.767Z`. The server validates marker ID, timestamp, position and
matching description before reporting confirmation. No provider request was retried,
no chat message was sent and no title, category or room setting was changed.

Both confirmed receipts were saved in a separate 1,006-byte private backup with
`0600` permissions. After page reload and authenticated workspace reopen, the same
two IDs and confirmed outcomes were verified in the reviewed export and backed up
separately. This verifies this reload only; the earlier empty journal remains
unexplained. An initial workspace click during bootstrap was replaced by a later
authenticated render; reopening after bootstrap allowed the journal read.

The owner reports force-quitting Vivaldi because it reached about 14 GiB of memory.
That report does not establish the exact quit/loss ordering or a database eviction.
After restart, a process snapshot measured 7,794 MiB total resident memory across
55 Vivaldi processes, with a largest process of 384 MiB. Browser-wide RSS is distinct
from one tab's JavaScript heap and from Activity Monitor's memory accounting.
Raw CDP memory counters were unsupported by the browser bridge, so neither a
Chatty Cat memory leak nor the cause of the reported spike was established.
Client data-volume free space measured 2.8 GiB; no data or cache was cleared.

Poll/prediction creation and successful commercials remain blocked by the lack of
an Affiliate/Partner broadcaster. Actual AutoMod and suspicious-user event/decision
acceptance and production journal retention across a browser restart remain open.

## Follow-up after theme deployment and renewed sign-in — 17:26 UTC

The regular browser completed ordinary sign-in as `patrick__eff`. The moderation
workspace and reviewed private export both identified account `69674313`. Refresh
returned zero receipts with the unchanged 1,000-row / 30-day policy. The private
backup from the controlled moderation check still contains four confirmed receipts
for that same account, with file permissions `0600`. An empty reviewed export was
saved separately; the backup was not overwritten or imported.

The previous four-receipt reload check remains a dated successful observation,
but retention across the subsequent deployment/sign-in sequence is not accepted.
No retention apply, profile forgetting or site-data clearing was performed by the
agent during this follow-up. Current sign-out and Forget profile code retain local
journal data; no browser eviction log or database transition was captured. This
does not establish sign-in or deployment as the cause. Issue #82 remains open.

Fresh broadcaster context at `2026-10-13T17:26:55.022Z` verified actor and broadcaster
ID `69674313`, broadcaster role, offline state and no Affiliate/Partner status.
The owner can provide a test stream but has no eligible Affiliate/Partner channel.
Live clip/marker checks are pending; poll/prediction creation and commercial checks
remain blocked by broadcaster eligibility.

Browser control disconnected during renewal of previously approved broadcaster
consent. Consent completion could not be verified. No clip, marker or commercial
action was previewed or confirmed during this follow-up, and no provider write was
submitted. New live writes were paused at this checkpoint. The later clip/marker
run above used separate backups before and after each provider-confirmed write.

The owner authorized the controlled live checks and signed in as `patrick__eff`.
The server verified account and broadcaster ID `69674313` for that account's own
channel. No action targeted another channel or an unrelated chatter.

## Controlled second-account moderation at 17:06–17:08 UTC

The owner supplied `subcult_tv` and its recent test message in `patrick__eff`.
Provider context resolved target ID `1415704837`, broadcaster/account ID `69674313`,
and an initial not-banned/not-timed-out state. The rendered message had no moderator
badge; the documented provider restriction and accepted deletion provide evidence
of deletion eligibility at delivery, rather than a claim of a fresh moderator-list
read. No moderator role was added or removed for testing.

On deployed #83, the exact message `2e482102-1ff9-4eba-bdd6-cebb785606a3` from
`2026-10-13T17:01:23.622Z` was selected and separately reviewed. Twitch confirmed
its deletion at `17:06:32.413Z`. A fresh retained-history read showed
`[removed message]` and disabled message selection, preserving redaction.

A separately reviewed 30-second timeout was confirmed at `17:07:27.825Z`.
Fresh context at `17:07:33.368Z` observed a timeout through `17:07:58Z`.
A separately reviewed `/untimeout subcult_tv` was confirmed at `17:07:45.179Z`.
Fresh context at `17:07:50.754Z`, before natural expiry, reported the target not
banned or timed out. Room settings and inactive Shield Mode stayed unchanged.
No public chat message was sent by the agent and no provider request was retried.

The journal contained four confirmed receipts: the earlier unchanged-title write
plus these three moderation actions. A reviewed 1,771-byte private recovery JSON
was saved locally with private permissions before reload. After reload, the same
four receipt IDs and confirmed outcomes were verified through the private export
preview. These are new retained receipts, not recovery of the original four lost
metadata receipts. The original disappearance remains unexplained; #82 stays open.

The owner has no eligible Affiliate/Partner broadcaster available. Successful
poll/prediction creation and live clip/marker/commercial checks remain blocked by
external channel conditions. Actual AutoMod and suspicious-user event/decision
acceptance also remains pending; a subscription with zero events is insufficient.
Warnings, role changes and suspicious treatment were not exercised in this run.

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

At this earlier checkpoint, only the `patrick__eff` account profile was available.
The controlled second-account follow-up is recorded above. Twitch's
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
