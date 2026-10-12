# Chat Thing rebuild

Go service and strict TypeScript client, served together on one origin.

The target is full behavior parity with the existing frontend and relay before
cutover. This directory is the first migration checkpoint, not the replacement
release. The original files and nested relay repository remain unchanged.

## Current checkpoint

- Go serves built frontend assets and a same-origin `/api/chat` WebSocket.
- Anonymous Twitch reading, up to six channels, reconnects and recent-message
  backfill run through Go. Each browser currently has its own upstream session.
- IRC parsing preserves tags, replies, notices and moderation command data.
- The TypeScript client validates incoming JSON, deduplicates message IDs,
  renders text and reply quotes safely, and bounds history.
- Recent history and a light/dark preference persist in a separate storage
  namespace. It does not overwrite or import the original application's data.
- Go caches and coalesces public 7TV/BTTV/FFZ emote and badge requests, and polls
  stream uptime, viewers and title. Provider failures leave other sets usable.
- The client renders native and third-party emotes, zero-width overlays,
  emote-only enlargement, badge icons/fallbacks and a persisted animation freeze.
- Twitch authorization-code login and logout use server-held tokens and opaque
  browser cookies. Validation and refresh run in Go.
- Authenticated messages and replies use Twitch's HTTP API. The composer has
  per-channel drafts, sent-input history, length checks and explicit send results.
- The composer grows with multiline drafts, handles Enter/Shift+Enter and IME,
  and completes channel nicknames and known emote codes with keyboard selection.
- Replies can jump to loaded parents; message links use `?mid=` and wait for
  available backfill if their target has not arrived.
- The emote picker supports search, enabled providers, grouped/mixed mode,
  recent selections, live-usage/A–Z ordering, animation filters/pause, name labels,
  zoom and a saved resize. Caret insertion is available after login.
- Advanced picker behavior, original layouts, moderator actions and most other
  advanced features are not implemented yet.

See [architecture](docs/architecture.md) and the
[parity checklist](docs/parity.md) for the complete migration scope.

## Run locally

Requires Go 1.26+ and Node 22.12+ (including the test runner).

```sh
cd rebuild/web
npm ci
npm run build
cd ..
go run ./cmd/chatthing
```

Open `http://127.0.0.1:8080`. Choose channels using the input or
`?channel=hasanabi,otherchannel`.

`CHATTHING_ADDR` overrides the default loopback listener.
`CHATTHING_ASSETS` overrides `web/dist` (relative to the working directory).
Keep the public site behind an HTTPS reverse proxy with WebSocket forwarding.
The current build is deployed for owner-authorized live testing at
https://chat.subcult.tv. See [verification and rollback](docs/live-testing-deployment.md).

For frontend development, keep Go running and run `npm run dev` in `web`.
Vite proxies `/api` including WebSockets to Go on port 8080.

## Twitch login

The registered callback is `https://chat.subcult.tv/api/auth/callback`.
Go reads the root `../.env` when started from `rebuild`, with these keys:

```dotenv
TWITCH_CLIENT_ID=your-client-id
TWITCH_CLIENT_SECRET=your-client-secret
CHATTHING_PUBLIC_URL=https://chat.subcult.tv
```

Existing process environment takes precedence. `CHATTHING_ENV_FILE` selects a
separate file; only plain or single/double quoted assignments are supported,
without shell expansion or multiline values. Never use a `VITE_` variable for
credentials. Root environment files are excluded from Git and Neocities uploads.

Open the configured public origin to start login. The reverse proxy must preserve
its Host header. The local preview's login button targets the configured public
origin; it cannot complete a production callback until that origin serves Go.
For local real-account testing, register an additional callback
`http://localhost:8080/api/auth/callback` in Twitch and start Go with
`CHATTHING_PUBLIC_URL=http://localhost:8080`. Twitch's HTTP development exception
uses the literal `localhost` hostname, rather than `127.0.0.1`. Use that exact host and port in the
browser, including when testing a built frontend rather than Vite's other port.
The application must be registered as a Confidential client for this server flow.

Login requests the `user:write:chat` permission for the send API. Tokens stay in bounded service memory and never
appear in session responses or browser storage. Sessions last seven days and
end on logout, failed validation, or service restart. OAuth state expires after
ten minutes and is bound to the initiating browser. Tokens are validated at
login and every thirty minutes, with refresh attempted after a validation 401.
Logout clears the local session; it does not disconnect the application from
Twitch's account settings. Durable encrypted session storage is still a release
task.

The fake-provider tests exercise consent denial, callback replay, browser state
binding, incorrect client/scopes, refresh encoding, identity changes, capacity
limits, and origin/CSRF protection. The owner confirmed that public login worked
in their regular browser. The public build is available for live testing;
full parity has not been accepted.

## Sending checkpoint

After logging in at the configured origin, select one of the joined channels,
enter a message, and click Send (or press Enter). Shift+Enter adds a newline to
an autogrowing draft; sending turns newlines into spaces and trims the edges.
The limit is 500 Unicode characters in that outgoing line. The counter warns
at 460 characters and disables sending beyond the limit. IME composition Enter
never sends. Type `@` plus a nickname prefix or `:` plus an emote prefix for
completion; Tab on a bare word of at least three characters opens emote matches.
Tab/Shift+Tab or Up/Down selects, Enter inserts, and Escape dismisses completion.
Suggestions use the current send channel's loaded chatter names, public provider
emotes, and native codes observed in its messages. This is not yet the complete
account subscriber-emote catalog. Reply buttons select the original channel and parent message;
Cancel reply returns to normal sending. Outside completion, Up/Down browses up to 50 sent inputs per channel at the
outer lines of the draft; interior arrows retain normal caret movement. Drafts are kept in sessionStorage; sent input history is kept in
localStorage. Twitch credentials are never stored there.

Go resolves the channel through Helix and derives the sender ID from the
validated session. Send requests require that session's CSRF value and the
configured origin. Each session is limited to one new send per second, with
Twitch's own channel restrictions and rate limits still authoritative.
Recent outcomes are retained for 32 request IDs per session. Repeating one ID
with the same payload returns its recorded outcome; changed payloads are
rejected. An explicit Twitch 401 can trigger one validated token refresh and
retry. Timeouts, network failures and uncertain outcomes are never retried by
Go. The browser preserves its request ID after an ambiguous failure; check chat
before retrying. This bounded record is not a durable delivery guarantee.

A message clears only after Twitch confirms it was sent. Rejected text remains
editable. Successful posts appear through the normal incoming IRC stream and
its message-ID deduplication; this checkpoint does not synthesize an optimistic
echo. Slash commands, whispers, moderator actions and cross-tab echoes remain
release tasks. Twitch user-token sends may reach other rooms participating in
a shared chat session; that behavior is controlled by Twitch.

The sending tests use fake services only. No live Twitch message has been
posted, and real account/channel restrictions remain unverified.

## Emote picker checkpoint

Emotes opens a nonmodal picker. Search matches provider codes and the original
emoji keywords. Provider checkboxes enable Twitch, 7TV, BTTV, FFZ and Emoji;
Mix providers combines their grids. Native emotes currently come from observed
chat tags, with native precedence for a duplicate code. Account entitlement and
complete subscriber/global emote catalogs remain open.

The picker tracks the last 24 selected or successfully sent known codes for
each channel. Recent chat usage orders by latest live observation, then count;
replay does not increment usage. StreamElements seeds and the original age-row
and family-order rules are not yet ported. Storage validates options and caps
recent/usage data; it uses the rebuild namespace, leaving original data intact.

The grid renders 200 results at a time with Show more. Live updates coalesce to
one second and hold while hovered when enabled. Search/filter changes apply
immediately. Animated/still filters, image fallback, animation pause, name labels
and five zoom levels are available. CSS resize stores the panel size; drag,
pinning, hold+, use flashes, reorder animations and advanced geometry remain
open. Anonymous users can browse; insertion requires a signed-in session.
Selecting inserts at the textarea selection with surrounding spacing and keeps
the picker open. Escape closes it and restores focus to its trigger.

## Checks

```sh
cd rebuild
go test -race -cover ./...
go vet ./...
cd web
npm run build
npm test
```

The Go integration tests use local fake Twitch and history services. They verify
the connection handshake, PING/PONG, channel isolation, replay and live events,
origin rejection, and unavailable-history behavior without depending on Twitch.

## License

This rebuild is part of the AGPL-3.0 project. Retain the root and relay licenses,
attribution and source availability when distributing or operating modified code.
