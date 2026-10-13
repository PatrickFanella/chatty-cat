# Account profiles and user notes

Account profiles #27 is the prerequisite for private user notes #48. Implementation
starts from merged PR #69. Work is isolated from the existing deployment checkout.

Saved profiles remember public Twitch user IDs and login names on this device,
with a limit of eight. Add and Switch sign out the current session and request
fresh Twitch consent. Switching to a saved profile binds the expected user ID to
the OAuth state; returning another account refuses activation. No token is saved
in browser storage. Forget removes the saved identity and signs out if active,
while retaining local account data for a later reconnect.

Preferences and workspace snapshots use account-specific keys. Signed-out
preferences retain their existing keys; existing unscoped drafts/sent history
are left untouched and never assigned to a signed-in account. Profile changes
reload the view after disabling the sender, allowing all settings editors to
start in the correct scope. Public history, observations and archive retention
remain shared device resources; privacy remains a device-wide control.

Drafts and sent history use account/channel keys. Whisper text is never persisted.
Whisper/inbox state already clears on identity changes; inbox read state uses
account keys. Accepted-echo sync now uses account-specific channels and stops
when identity is unknown. Pending sends abort on session/identity changes;
stale responses cannot clear a new draft, publish an echo or finish a new send.
Server sends recheck their session after acquiring its lock. A request already
accepted by Twitch cannot be undone by switching accounts.

Verification: all 503 frontend tests and strict production build pass, along with
the full Go race suite, vet, zero-issue golangci-lint and the 515-row inventory.
Native Chromium checks cover local consent, wrong-account refusal, Alice/Bob
draft/preferences, active/inactive Forget, retained data and paused-reader recovery
(same message, observed offset difference 0.2421875 pixels). Tests cover privacy,
malformed/stale registry data, bounds, echo scopes and delayed sends. Real Twitch
consent and production deployment remain unverified. See [the demo](account-profiles-demo.md).
After this PR is reviewed, user cards can use stable user IDs and per-account
private note storage with explicit backup/delete controls.
