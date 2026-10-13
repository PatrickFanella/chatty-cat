# Account profile demo

From the repository root, use a fresh browser profile:

```sh
npm --prefix web ci
npm --prefix web run build
go run ./web/test-support/profiles
```

Open `http://127.0.0.1:5196/fixture/seed`, then **Seed and open account profiles**.
This fixture replaces its origin's synthetic public history/profile preferences.
It serves the production frontend and real Go OAuth/session handlers against a
local consent/token provider. No Twitch reads or writes occur; other public API
requests return 404. Stop the fixture after testing.

1. Open **Accounts → Add Twitch account**, then **Consent as alice**. Wait for
   **Signed in as alice**. The composer contains `alice retained draft` and Freeze
   emotes has `aria-pressed=true`. The registry contains only ID/login metadata.
2. Set a display preference, such as shade 1, and pause the reader above the bottom.
   Add Bob through **Accounts → Add Twitch account → Consent as bob**. Bob gets
   his own draft (`bob retained draft`), sent history and dark display preferences.
   Existing whisper/private panels clear and permissions/emotes reload from the
   new session. No Send action is part of this demo.
3. Select **Switch to alice**, but consent as Bob. The callback refuses the wrong
   user ID, shows an account-mismatch message and keeps sending disabled. Select
   Alice again and consent as Alice; her draft/preferences and saved workspace
   reader return. The native check preserved the paused message with an observed
   offset difference of 0.2421875 pixels; this is fixture evidence, not a universal
   layout guarantee. Reader restoration occurs after saved layout settings.
4. Forget an inactive profile. Its saved name disappears, while its account data
   remains on the device. Forget the active profile; its server session signs out
   and the name disappears. Reconnecting the same Twitch ID restores its data.
   Separate private feature controls handle deletion of bookmarks/read state.
5. Privacy hides Accounts and clears an open account list. Unit tests cover
   malformed/stale registry storage, eight-profile capacity, same-account echo
   sync, different-account rejection and unknown-identity cleanup. An old pending
   send is aborted; its late response cannot finish a new account's send or clear
   the new draft. A Go regression blocks a send after session lookup, logs out,
   then verifies rejection before delivery without clearing a replacement cookie.

Switching requires fresh Twitch consent. Saved profiles are remembered identities,
not a browser token vault. Twitch may need its account selection/sign-out controls
to choose the requested identity; wrong-account consent is explicitly refused.
Tokens stay in bounded server memory, so restarting the service requires login.
Requests already accepted by Twitch cannot be undone by switching.

Signed-in preferences/workspaces use new account keys. Existing unsigned settings
and unscoped drafts remain untouched; unowned drafts/history are never assigned
to another account. Public history, archive retention, observed metrics and the
privacy policy stay shared device resources. Offline startup can use the last
known preference scope, with sending/private account actions disabled until auth
returns. Real Twitch account consent and production deployment remain unverified.
