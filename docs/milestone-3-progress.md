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
