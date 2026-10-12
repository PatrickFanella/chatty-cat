# Go + TypeScript chat conversion

This repository rebuilds [HasanAbi Chat Thing](https://github.com/mxmilkiib/hasanabi.neocities.org)
and its [Twitch relay](https://github.com/mxmilkiib/twitch-chat-relay) as one
self-hosted Go service with a TypeScript frontend. The intended origin is
`https://chat.subcult.tv`. Full feature parity is required before cutover.
The original app remains the reference; this conversion is still in progress.

[Parity checklist](docs/parity.md) records release gates and checkpoint evidence.
[Architecture](docs/architecture.md) describes ownership and deployment boundaries.
[Design system](docs/design-system.md) records the identity, brand roles and interface rules.

## Run locally

Requires Go 1.26+ and Node 22.12+.

```sh
npm --prefix web ci
npm --prefix web run build
go build -o bin/chatthing ./cmd/chatthing
./bin/chatthing
```

Go serves the frontend and APIs at `http://127.0.0.1:8080`. Anonymous chat works
without OAuth credentials. It merges up to six rooms, reconnects to Twitch IRC
and restores available public backfill. Bounded metadata/preview caches keep
external provider failures separate from chat transport.

The service reads `../.env` by default for the current side-by-side conversion.
Environment variables already set take precedence. For a standalone checkout,
set `CHATTHING_ENV_FILE` to your private environment file path, or supply values
through the process environment. Keep this file out of Git.

| Variable | Default / purpose |
| --- | --- |
| `CHATTHING_ADDR` | `127.0.0.1:8080` |
| `CHATTHING_ASSETS` | `web/dist` |
| `CHATTHING_ENV_FILE` | `../.env`; optional file, missing is allowed |
| `CHATTHING_PUBLIC_URL` | `https://chat.subcult.tv`; HTTPS origin, loopback HTTP allowed |
| `TWITCH_CLIENT_ID` | Server-side Twitch application ID |
| `TWITCH_CLIENT_SECRET` | Server-side Twitch application secret |
| `GIPHY_API_KEY` | Optional browser integration key for explicit GIF title searches |

Register `https://chat.subcult.tv/api/auth/callback` on the Twitch developer app.
For local OAuth, register the exact loopback callback and use that loopback
origin for `CHATTHING_PUBLIC_URL`. The public callback requires working HTTPS
routing to this service; a local preview alone does not complete public login.

Go keeps OAuth credentials and opaque sessions in memory. Restarting signs
users out. Authenticated sending uses Twitch's API and server-held user tokens;
credentials never enter browser storage. Public VOD and Twitch emote metadata
use a separate server-held app token. Scope/account permission checks, bounded
request receipts and explicit handling of uncertain sends apply to commands,
replies, actions and whispers. Tests use fake Twitch services. The owner also confirmed live consent, posting,
replies, subscriber emotes, whisper sending and the approved test-message deletion
on the hosted build. See [acceptance evidence](docs/parity.md).

## Self-hosting

[Deployment instructions](deploy/README.md) cover the combined Go/frontend image,
loopback service binding and optional Caddy HTTPS proxy. Container runtime and
public-domain acceptance must pass before cutover.

## Implemented checkpoints

Chat includes replies, permalinks, room/own-user state, moderation notices,
retained history, per-channel drafts/completion, local echoes and cross-tab public
chat coordination. Private whispers use a separate ephemeral pane and a shared
server EventSub subscription per account. Whispers remain outside public
archive, usage stats and cross-tab broadcast.

Display settings cover original palettes/fonts, filters, motion, subscription
chips, reverse flow, columns/rail, header modes, saved slots, OBS transparency and
composer autohide. The picker includes public/account emotes and original emoji,
provider/animation filters, usage seeds, recents, age layouts, hold+, use feedback,
zoom, pin/drag/resize and shared geometry. Stats, curated resources, pronouns,
public profile/emote/link cards, explicit media loading, stream video and PWA
history/update behavior are available. Feature-family parity gates remain open
until the remaining controls and live acceptance checks are complete.

## Verify

```sh
go test -race -cover ./...
go vet ./...
golangci-lint run
npm --prefix web test
npm --prefix web run build
```

Use the local browser preview for layout and live anonymous chat checks.
`GET /api/health` checks the service process; it does not prove Twitch, OAuth,
external providers or video playback are working. `GET /api/ready` returns 503
during shutdown or when the application shell is missing, and 200 when ready.

## Regenerate curated resources

The generated content is committed, so ordinary builds need no original checkout.
To update it from the original app:

```sh
python3 scripts/port-resources.py /path/to/original/index.html
```

## License

AGPL-3.0. See [LICENSE](LICENSE) and [attribution](NOTICE.md). Retained assets keep
their applicable upstream licenses. Provide corresponding source when operating
a modified version for remote users as required by the license.
