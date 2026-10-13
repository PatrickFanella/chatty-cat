# Milestone 3 progress

All seven M2 issues are merged as of October 12, 2026, including user notes PR #71.
M2 production deployment and owner/provider acceptance remain separate from merged
code and local fixture checks. The original GIPHY provider gate remains in M0.

## Permission-aware moderation workspace — #21

Implementation starts from merged `11152cf`. The workspace is an independent
dialog with retained user history beside staged actions and a private journal.
History uses paged archive queries, stable author IDs where available and disclosed
name-match fallback, with retained moderation redaction. It does not fetch missing
chat history or replace the main reader.

Provider context verifies the actor as broadcaster, moderator, viewer or unknown.
Moderator membership requires explicit `user:read:moderated_channels` consent;
scans stop at five 100-channel pages and do not infer a role from a truncated list.
Public room settings are timestamped reads. Current ban/timeout reads are limited
to supported broadcaster authorization; unavailable state remains labelled.
Sources: [moderated channels](https://dev.twitch.tv/docs/api/reference/#get-moderated-channels),
[chat settings](https://dev.twitch.tv/docs/api/reference/#get-chat-settings), and
[banned users](https://dev.twitch.tv/docs/api/reference/#get-banned-users).

Preview has no provider writes. Confirm stores a pending private receipt, rechecks
role/scopes/identities, and sends once. The existing server command path checks
expected channel/user IDs before delivery. Confirmed, rejected and uncertain
outcomes remain distinct; uncertain outcomes have no automatic retry. Scope
consent alone does not establish moderator membership.

The journal uses a separate IndexedDB database, with transactional account states
and a 1 MB export bound. Defaults are 1,000 rows / 30 days; pending outcomes are
protected from automatic pruning. Explicit retention preview/apply can remove
eligible rows, including unresolved receipts, after a private recovery export.
Account/privacy changes clear private views and cancel stale work. Receipts never
enter public chat, archive or statistics. Provider writes in verification are
restricted to the local synthetic fixture until a live destination is approved.

Verification: 526 frontend tests, strict TypeScript and production build pass.
Full Go race tests, vet and zero-issue lint pass; the 515-row inventory is unchanged.
Native Chromium verified 201 unique equal-time messages in three pages, deletion
redaction, zero-write previews, confirmed/rejected/uncertain outcomes, revoked-role
and expected-ID rejection before provider writes, native journal/public downloads,
account isolation/restoration, explicit retention and privacy cleanup. The six-row
private download was 2,430 bytes; the 46,180-byte public log excludes the private
reason and deleted text. Reasons are sent to Twitch for ban/timeout actions.

Reproducible demo: [moderation workspace](moderation-workspace-demo.md).
Live moderation acceptance remains pending an approved channel/target/action.
The foundation is merged in PR #72; no M3 deployment or live write is recorded.


## Moderation buttons and timeout presets — #22

Channel-specific ordered quick actions use the same staged workspace and explicit
confirmation. Definitions are isolated by account, workspace and channel; limits
are 12 presets / 32 KB. Templates support only selected-user `{user}` and selected
message `{messageID}` substitutions within validated moderation commands. User
and message actions cannot hard-code another target. JSON definitions and imports
have replacement previews; backups require the same scope and no credentials.

Alt+Shift+1–9 stages the corresponding ordered preset while the modal is open and
focus is outside editable fields. It never confirms or sends. Scope/role/identity
checks, pending receipts and uncertain-outcome handling remain in the existing
workspace/provider path. Privacy/account changes clear preset transfers. Stale
writers and storage failure preserve saved definitions.

Verification: 531 frontend tests and production build pass, with Go race/vet/lint
and the 515-row inventory unchanged. Native Chromium staged a three-second timeout
from the physical keyboard shortcut with zero provider writes, then confirmed it
once. Ordered definitions persisted and a 338-byte native backup reopened for a
same-scope replacement preview. [Demo](moderation-presets-demo.md).

## Warnings, Shield Mode and numeric-ID commands — #42

The command path supports `/warn`, `/shield`, `/shieldoff`, `/banid` and
`/untimeout`. Composer submissions open a staged moderation review; they preserve
source drafts and do not send until separate confirmation. Required scopes,
channel/target IDs and current actor role appear before delivery. The existing
private journal keeps confirmed, rejected and uncertain results. Re-consent grants
warning/Shield scopes; the frontend auth allowlist preserves those permissions.

Shield state is a timestamped private read. Warning acknowledgement remains
explicitly unavailable. Direct numeric-ID mode does not infer names, suspension,
existence or login-matched history; numeric bans validate positive bounded IDs
and expected identities before delivery. Warning, numeric-ban and Shield response
fields must match the request before confirmation; malformed responses remain
uncertain and have no automatic retry.

Verification: 539 frontend tests and production build pass; full Go race suite,
vet and zero-issue lint pass. Native Chromium confirms warning/Shield/numeric-ban/
untimeout actions, fresh active Shield state, no inferred history for an unresolved
ID, source-draft preservation and an uncertain warning without a repeated write.
The private six-receipt download was 2,243 bytes and excluded token/CSRF fields.
Nine inventory rows now cite the verified presets/commands/completion adaptation;
all 515 upstream declarations remain accounted for. [Demo](moderation-advanced-demo.md).
No deployment or live moderation acceptance is recorded.

## Private AutoMod review queue — #23

Explicit `moderator:manage:automod` consent enables a server-held EventSub
WebSocket with version-2 held/update subscriptions. Provider acceptance establishes
channel eligibility; consent alone does not. The private queue validates actor,
channel, subscription and event identity before exposing held text. It never feeds
public chat, archive or statistics. Text renders as plain text.

One channel per account and four tabs sharing the same login session use one hub;
the service admits 16 hubs. Limits are 100 rows / 15 minutes, a 256 KB stream
snapshot, 1,000 replay identifiers and 12 connection attempts per session/minute.
Replay-budget exhaustion clears the queue rather than evicting resolution markers.
Earlier or missed holds remain unavailable. Version 2 reports public blocked terms;
private blocked-term coverage is not claimed.

Allow/Deny previews freeze the actor, channel, subject and observed held event.
Confirmation saves a pending private receipt before one provider request. The
server rechecks session, scope, channel identity and live held state. Only the
provider's 204 response confirms delivery; rejected and uncertain outcomes remain
separate. Uncertain rows cannot be submitted again. Duplicate events cannot restore
resolved rows. Reconnect transfers subscriptions after a new welcome; disconnect,
revocation and account/privacy changes clear stale views.

Verification: 546 frontend tests and production build; full Go race tests, vet and
zero-issue lint. Focused tests cover stream handoff, two clients, consent boundaries,
identity checks, idempotent receipts, uncertainty, capacity and expiry. Native
Chromium verified one shared connection across two tabs, inert held text, zero-write
preview, one confirmed decision, synchronized removal, duplicate suppression,
reconnect and revocation cleanup. All provider writes used synthetic fixtures.
[Reproducible demo](automod-demo.md). Live acceptance awaits an approved
channel/target/action; no deployment or Twitch moderation write is recorded.

Sources: [AutoMod subscriptions](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/),
[WebSocket handoff](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/),
[held-message decisions](https://dev.twitch.tv/docs/api/reference/#manage-held-automod-messages).

## Suspicious-user signals and treatment controls — #24

Explicit suspicious-user consent requests separate read/manage permissions.
Version-1 message/update subscriptions share the bounded server-held transport with
AutoMod. Each private row contains only observed Twitch fields: treatment, latest
message where present, recognized signal types, shared-ban channel IDs and provider
ban-evasion evaluation. Missing fields remain unavailable. An update lacking message
signals clears previous message details; older deliveries cannot undo newer state.
No provider report is presented as proof of evasion. No historical status is inferred.

`/monitor`, `/restrict`, `/unmonitor` and `/unrestrict` stage the same moderated
workspace actions and private receipts. Removing either treatment uses the supported
remove-status endpoint and does not infer user safety. Exact acknowledgement actor,
channel, subject, treatment and update timestamp must validate before confirmation.
Malformed success remains uncertain, with no automatic retry. Explicit scope,
role and expected identity guards apply before delivery. `/lowtrust [joined-channel]`
opens the private view without connecting or sending. Lead Moderator assignment
and additional Lead Moderator controls remain unavailable.

Bounds: 100 users / 15 minutes, four tabs/session, one channel/account per private
feed, a shared service limit of 16 AutoMod/suspicious hubs and 12 combined connection
attempts/session/minute. Snapshots and replay identifiers retain the AutoMod limits.
Account/privacy changes, disconnect and revocation clear private views. Signals
never feed public chat, archive, logs or statistics.

Verification: 551 frontend tests, strict TypeScript/production build, full Go race,
vet and zero-issue lint. Tests exercise shared streams and handoff, event/identity
filtering, deduplication, exact treatment acknowledgement and unavailable fields.
Native Chromium verified inert reported text, zero-write preview, one confirmed
restriction/private receipt, two tabs sharing one connection, synchronized treatment
updates, reconnect and revocation cleanup. Provider writes were synthetic only.
[Demo](suspicious-user-demo.md). Live acceptance requires an approved Twitch
channel/subject/treatment; no deployment or real moderation write is recorded.

Sources: [suspicious-user events](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/),
[add treatment](https://dev.twitch.tv/docs/api/reference/#add-suspicious-status-to-chat-user),
[remove treatment](https://dev.twitch.tv/docs/api/reference/#remove-suspicious-status-from-chat-user).

## Broadcaster poll lifecycle — #25

The broadcaster poll panel reads the latest 20 provider polls and restores active
state through explicit refresh/reconnect. Successful reads repeat every 15 seconds
while the view is open; account/channel/privacy changes or closing the workspace
cancel reads and clear private state. Scope and channel identity must establish the
signed-in account as broadcaster. Moderator membership does not grant poll access.
Explicit consent requests `channel:manage:polls`; supported read-only grants can
observe counts without enabling actions. Twitch decides channel eligibility.

Creation previews validate a 60-character title, two to five distinct choices of
25 characters, duration 15–1,800 seconds and optional Channel Points vote cost
1–1,000,000. Bits voting is unavailable. Confirmation starts a poll immediately.
End leaves the poll/results public; End and archive ends it and removes public
visibility. These are the provider's supported early-ending behaviors, not refunds
or a separate cancel operation.

A pending private receipt precedes each request. The server rechecks broadcaster
identity/scope, reads current provider state and requires the exact active poll ID
before ending. An active poll blocks new creation. Acknowledgements validate poll
identity, status, definition and explicit nonnegative counts. Malformed success is
uncertain; no write retries automatically. The view requires an explicit provider
refresh before another action after uncertainty. Server receipt replay is bounded
to 32 account-session requests and never sends an identical request twice.

Verification: 557 frontend tests, strict TypeScript/production build, full Go race
suite, vet and zero-issue lint. Tests cover definitions, provider response filtering,
CSRF/actor/identity guards, stale active IDs, replay, pending receipts, account
isolation and uncertainty. Native Chromium verified zero-write previews, creation
with Channel Points options, ACTIVE → TERMINATED, provider restoration after
closing/reopening, an uncertain archive with a retained receipt, and a separately
reviewed successful archive. Only synthetic provider writes were used.
[Demo](polls-demo.md). Live acceptance needs an approved eligible broadcaster
channel. Poll command aliases remain planned in the source inventory.

Sources: [read polls](https://dev.twitch.tv/docs/api/reference/#get-polls),
[create](https://dev.twitch.tv/docs/api/reference/#create-poll),
[end/archive](https://dev.twitch.tv/docs/api/reference/#end-poll).

## Broadcaster prediction lifecycle — #26

The prediction panel reads the latest 20 provider predictions and restores ACTIVE
or LOCKED state through explicit refresh/reconnect. Broadcaster identity is required
for this provider API; read-only prediction consent observes state/counts while
manage consent enables actions. Explicit creation review validates a 45-character
title, two to ten distinct outcomes of 25 characters and a 30–1,800-second window.
Creation begins participation immediately; Twitch decides eligibility.

Lock, cancel and resolve are separate staged actions. Resolution names the exact
winning outcome title and ID and discloses provider points distribution. Cancel
discloses provider refunds; lock stops further participation. Each confirmation
saves a pending private receipt before one request. The server rereads provider
state, verifies allowed ACTIVE/LOCKED transitions and requires a winner from the
same prediction. Exact acknowledgement identity/status/winner and explicit
aggregate participant/point counts are required. Missing data is unavailable;
participant identities and inferred payout calculations are not exposed.

Unknown or incorrect-winner responses stay uncertain, with no automatic retry.
An explicit provider refresh is required before another action after uncertainty.
Receipts replay at most once, with 32 cached account-session requests. Successful
reads repeat every 15 seconds while open; uncertainty, closure, account/channel
and privacy changes cancel reads/clear private state. Unchanged provider reads
preserve focused poll/prediction controls rather than replacing their DOM nodes.
Command aliases remain planned in the source inventory.

Verification: 564 frontend tests and production build, full Go race tests, vet and
zero-issue lint; all 515 reference declarations accounted for. Tests cover foreign
winners, missing counts, incorrect-winner acknowledgements, CSRF/identity/scope
refusal, receipt replay, pending-before-write, terminal-state updates, account
isolation and focus preservation. Native Chromium verified zero-write preview,
CREATE → ACTIVE, exact selected-winner RESOLVED, local rate refusal without a
provider write, separately reviewed LOCKED, reopening/restoration and CANCELED.
Only synthetic provider calls occurred. [Demo](predictions-demo.md).

The owner approved needed live M3 acceptance on October 13. The shared preview
currently reaches Twitch's username/password login form; login/consent and
broadcaster eligibility remain external prerequisites. No real M3 write or new
M3 deployment is recorded. Earlier sections' approval prerequisites are now met;
their provider acceptance remains pending login and deployment.

Sources: [prediction reads](https://dev.twitch.tv/docs/api/reference/#get-predictions),
[creation](https://dev.twitch.tv/docs/api/reference/#create-prediction),
[lock/cancel/resolve](https://dev.twitch.tv/docs/api/reference/#end-prediction).
