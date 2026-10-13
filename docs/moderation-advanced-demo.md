# Warnings, Shield Mode and numeric-ID moderation

Use the [local moderation fixture](moderation-workspace-demo.md). Rebuild the
production bundle, restart the fixture, and sign in as moderator with explicit
moderation-read consent. The fixture grants warning and Shield Mode permissions;
no request connects to Twitch.

1. In the composer, enter `/warn viewer respect the fixture rules` and select Send.
   This opens the moderation workspace, preserves the draft and stages a review.
   It makes no provider write. Review target ID `456`, channel ID `123`, actor role,
   reason and `moderator:manage:warnings`, then Confirm. The fixture records one
   confirmed private receipt. Warnings require a reason; acknowledgement happens
   in Twitch and its status is explicitly unavailable here. Issuing a new warning
   may replace an existing warning.
2. Close the workspace, enter `/shield`, and open its review from the composer.
   Confirm once, then Refresh: **Shield Mode: Active at this read** appears. Repeat
   `/shieldoff` to deactivate. Current status is a timestamped, scoped read;
   missing permission, role or valid provider data remains unavailable. The
   provider-configured overrides are not invented by this app.
3. Enter `/banid 999 numeric fixture`. This opens direct-ID mode with channel/ID
   context; the name, existence and suspension state are labelled unverified.
   No username lookup or ID-less name-match history is inferred. Positive numeric
   IDs are bounded to 30 digits. Confirm uses that exact reviewed ID; malformed
   IDs, self/broadcaster targets and expected-ID mismatches are refused before
   writing. Provider rejection remains possible for an unknown/suspended account.
4. `/untimeout viewer` stages the unban operation with its own alias visible in the
   private receipt. Advanced commands also complete at the composer caret. Saved
   numeric-ban presets use `/banid {userID}`, bound to the reviewed target.
5. Set `/fixture/mode?value=rejected` or `value=uncertain` before confirming a new
   action. Rejected and uncertain receipts remain distinct. Leave at least one
   second between confirmations: local send throttling records rejection without
   provider delivery. Missing/mismatched warning, numeric-ban or Shield response
   fields are uncertain even on a successful HTTP status; no write is retried.
6. Export the private journal. The observed native six-receipt download was 2,243
   bytes with confirmed warning, Shield, numeric-ban and untimeout actions, one
   local-rate rejection and one uncertain warning. It contains no token/CSRF
   fields. Provider write count stayed at five after the uncertain response.
   Account/privacy changes preserve the existing isolation and stale-request
   cancellation behavior.

Verification includes parser/translation tests, exact provider identity payloads,
malformed acknowledgements, no-write expected-ID/scoped refusal, direct-ID context
without login lookup, private scope allowlisting, composer interception/draft
preservation, keyboard completion, staged UI outcomes and native downloads.

API contracts checked against official Twitch documentation:
[warning](https://dev.twitch.tv/docs/api/reference/#warn-chat-user),
[Shield update](https://dev.twitch.tv/docs/api/reference/#update-shield-mode-status),
and [Shield read](https://dev.twitch.tv/docs/api/reference/#get-shield-mode-status).
Live moderation acceptance requires an approved channel, target and action. The
fixture and merged implementation do not establish provider acceptance.
