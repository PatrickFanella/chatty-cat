# Live testing deployment

The owner authorized deploying the current rebuild on October 11, 2026 after
Twitch rejected the preview browser. Full parity has not been accepted.

Release `20261011T232722Z` runs on NUC as `chatty-cat.service`, listening on
`10.0.0.56:3075`. Only Almaz is allowed through its ingress firewall rule.
Almaz's Caddy routes `chat.subcult.tv` through the existing wildcard tunnel.
OAuth uses the registered `https://chat.subcult.tv/api/auth/callback`.

The release directory is `/srv/apps/projects/chatty-cat/releases/20261011T232722Z`.
Its SHA-256 manifest identifies base commit `531e45d` and records inclusion of
the tested uncommitted changes. Binary, assets, license and source are retained.
Credentials are separate in a root-owned mode-600 environment file. The public
`/source.tar.gz` excludes credentials and host deployment configuration.

Verified: 210 frontend tests, strict production build, Go race/coverage tests,
vet, transferred release hashes, enabled/active service with zero restarts,
Caddy validation/reload and the LAN health route. The public browser rendered
live chat and received health/session responses. OAuth redirects to Twitch with
the exact public callback; the source download returned HTTP 200. Reboot and
regular-browser consent have not been tested. No live message or moderation
action was sent. Sessions end on service restart.

Raw Python HTTPS requests received an edge 403 while the browser received the
app and API responses. This distinction is retained in the evidence rather than
treated as an application failure.

## Rollback

Almaz retains the previous Caddyfile and post-deployment hash under
`/opt/server/management/data/chatty-cat-recovery/20261011T232722Z`. Its rollback
guard passed in `--check` mode and refuses subsequent unrelated Caddyfile edits.
NUC's service rollback check also passed. Actual rollback has not been executed.

```sh
# On Almaz: withdraw the route first.
sudo python3 /opt/server/management/data/chatty-cat-recovery/20261011T232722Z/rollback-edge.py 20261011T232722Z
# On NUC: stop this service and remove only its ingress rule.
sudo /srv/apps/projects/chatty-cat/recovery/rollback-service.sh
```

Rollback retains releases and credentials. The original frontend and user
browser storage remain available.

The owner subsequently reported that public login worked in their regular
browser. This confirms login/consent from the owner's test; it does not verify
sending, logout, expiry recovery, whispers or moderator actions.

The owner later sent `Chatty Cat parity test` and a reply through the rebuild in
their approved `patrick__eff` channel and confirmed that the reply appeared.
An independent public preview observed the parent message with its broadcaster
and subscriber badges and name color. Local-echo adoption, rejection handling,
logout, expiry recovery, whispers and moderation remain separate checks.

## October 11 evening update

NUC now runs release `20261012T000818Z` (UTC), retaining the prior release.
It includes four public metadata adapters, rate/burst details, page-observation
gaps and the other tested continuation changes. The service is active with zero
restarts after activation; auth remains enabled. Tests: 229 frontend tests,
strict build, full Go race suite, vet and golangci-lint. Public browser requests
returned Wikipedia and YouTube cards with ten-minute TTLs.

Frontend revision `20261012T001230Z` added a source-download footer link keyed by
the current bundle. The same backend SHA-256 was verified before this static
update; PID 3277827 was preserved. Previous assets/source/manifest are retained
under `/srv/apps/projects/chatty-cat/recovery/frontend-20261012T001230Z`.
The public footer download returned HTTP 200 and 354228 bytes, matching SHA-256
`083f9535d05c0bdbecc1476ab3f1e52cb6faeab43c7d3a29980201c40ab46229`.
The unversioned archive URL can retain the earlier edge cache until it expires;
the footer's bundle-specific query bypasses that copy. `scripts/build-release.py`
now places corresponding source inside the served asset directory and records
all release hashes. Source excludes credentials and private deployment files.

Release rollback: first verify `current` still points to
`releases/20261012T000818Z`, then atomically replace that symlink with the retained
`releases/20261011T232722Z` and restart `chatty-cat.service`. Verify health and the
public bundle afterward. Actual rollback has not been run. The earlier edge and
service withdrawal scripts remain available. Backend restart requires sign-in
again; the frontend-only correction did not restart it.
