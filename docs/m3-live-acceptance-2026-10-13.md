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

## Remaining gates

The signed-in session lacked the optional AutoMod, suspicious-user, poll and
prediction scopes. The shared preview was navigated to the combined Twitch consent
flow for those permissions, moderator-membership reads and followed-channel reads.
The provider page could not be inspected: preview snapshot and evaluation each
timed out after 15 seconds. Consent completion remains pending. Reauthentication
temporarily clears the current app session; it must finish before further writes.

Warnings, timeouts, numeric bans and suspicious treatment need a controlled second
account. The broadcaster cannot be used as its own ban/timeout target. AutoMod and
suspicious-event acceptance need actual provider-delivered events. Poll and
prediction tests need Twitch-established broadcaster eligibility. These checks,
message deletion and the newly merged broadcaster controls remain unverified live.

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
