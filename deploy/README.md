# Self-hosting

The image contains the Go service and built TypeScript frontend. Serve both at
one HTTPS origin. The default origin and registered Twitch callback are:

- `https://chat.subcult.tv`
- `https://chat.subcult.tv/api/auth/callback`

Full parity and live acceptance remain open. These files prepare a deployment;
they do not authorize or perform a cutover.

## Existing reverse proxy

From the repository root, use the private environment file already maintained
outside Git. In the current side-by-side checkout it is `../.env`:

```sh
docker compose --env-file ../.env config --quiet
docker compose --env-file ../.env build chat
docker compose --env-file ../.env up -d chat
```

Only the named Twitch credentials, public origin and optional Giphy integration
key are passed into the service.
Credentials are runtime configuration; the build context excludes environment
files. Do not share expanded Compose configuration, which can contain secrets.
For a standalone checkout, replace `../.env` with your private file path.
`GIPHY_API_KEY`, when configured, is a client integration key exposed through
public configuration for direct browser requests. It is separate from the Twitch
client secret. Leave it empty to retain GIF-title search links.

The service binds host loopback port 8080. Route the HTTPS domain to
`127.0.0.1:8080`, preserving Host and WebSocket upgrades. An example Caddy
configuration is [Caddyfile.host](Caddyfile.host). A proxy on another host cannot
reach this loopback binding; explicitly configure a protected LAN binding if
that is your deployment topology.

## Included HTTPS proxy

If this machine owns ports 80/443 and the domain's DNS points to it:

```sh
docker compose --env-file ../.env --profile https up -d --build
```

The optional Caddy service routes to `chat:8080` and maintains its certificates
in named volumes. Keep those volumes across upgrades. The included Caddyfile
uses `chat.subcult.tv`; change it and the app's public origin together if hosting
elsewhere. Caddy manages HTTPS and WebSocket proxying. See the official
[HTTPS quick-start](https://caddyserver.com/docs/quick-starts/https) and
[reverse proxy reference](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Verification status

The native Linux arm64 image built and served live anonymous chat in a local
read-only, non-root container. Health, static assets and shutdown passed. Both
Caddy examples and Compose configurations validated. An amd64 build was
interrupted when Docker became unavailable; that target and public HTTPS/OAuth
acceptance remain unverified. No public deployment has occurred.

## Check and update

```sh
docker compose --env-file ../.env ps
curl --fail https://chat.subcult.tv/api/health
```

Health checks cover the service process. Verify the frontend, live chat, Twitch
consent/callback, message acceptance, whispers, permissions, media and reconnects
at the HTTPS origin before switching users. OAuth sessions are currently held in
memory, so replacing the service signs users out. Browser history stays local.

For a reviewable release, set `CHATTHING_IMAGE` to an immutable image tag, build
that tag, and retain the previous image. Rollback selects the previous tag and
runs `docker compose up -d --no-build chat`. Preserve the private environment file
and proxy certificate volumes; rollback does not restore OAuth sessions.
Provide the corresponding source for the deployed revision under the AGPL.
The container includes its license and attribution files.
