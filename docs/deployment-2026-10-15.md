# October 15 deployment

Merged main `3b87d3a016dd8c751ed5729e21bb1e0e41d8859c`, through PR #157,
is deployed at https://chat.subcult.tv. It includes the lazy panel lifecycle,
on-demand reference data and visibility-aware clocks. The subsequent #136 emote
work is not part of this release.

NUC runs `chatty-cat-chat-1` with immutable image
`sha256:6b3c8d9fc77b62ec31fafedfe561dda446cc54eb9d22260c263522e7aec870f7`.
The current link selects `releases/chatty-cat-3b87d3a-20261015` under
`/srv/apps/projects/chatty-cat`. The earlier systemd unit is inactive; the actual
Docker runtime was inspected before activation. The preceding runtime was the
SEO image `sha256:5e8ead8266dc7ef591e80042f227f00244c2af4c5592e5104feb5dd88d2189fb`,
whose selection used additional Compose overrides. Recovery retains that actual
image rather than assuming the old image selector identified the running image.

The clean release builder passed strict TypeScript and production compilation.
All 4,034 transferred manifest hashes matched. An isolated loopback staging
container passed readiness and packaged binary, HTML, entry and source hash
checks, using separate empty upload/sync directories. Staging was removed before
activation. Local validation also passed 847 frontend tests, Go race tests and
vet. At the last hosted readback, merged-main CI still reported both checks
pending; these local results do not establish hosted success.

Activation preserved the two base Compose files, private environment bytes,
upload/sync binds, UID/GID 10001, read-only root, 512 MiB and 128-PID limits.
No edge, DNS or firewall change was needed. The container is running and healthy
with zero restarts after activation. Both retained data files matched the
pre-activation backup byte for byte after the restart. In-memory OAuth sessions
end when the backend is replaced.

The public browser received readiness 200 and the signed-out auth session route
200, connected to anonymous chat, and loaded `assets/main-viS6fz2P.js`.
The deployed entry hash is
`cad7d0d44ea72ac8b37cec1b73c41dd7f171d7ab2178ac72f551ee7b576bc8d7`.
Both hashed reference JSON files returned 200 with their expected hashes.
The release-specific source archive returned 200, 3,121,984 bytes and SHA-256
`31b3100b83002d63a89b713be67760ff3c49399895712298bfac9c18219dce3f`.

The unversioned `/sw.js` still returned an earlier Cloudflare cache HIT. The app
already registers the worker with its bundle-specific `?build=` query; that new
module worker installed, offered Update ready, and activated after clicking it.
Its 4,314 bytes matched SHA-256
`24dd524398243cc8a77ddf7b6de916d3d663a55568097944503e6b105bc240bb`.
The active worker URL and new app bundle were read back after reload. No cache
purge or edge policy change was made. Reboot, authenticated provider actions and
production CPU/GPU qualification were not exercised.

Root-only recovery is `recovery/scheduler-3b87d3a-20261015`. It contains the prior
configuration/selector/link/image, private environment hash, data backup and
guarded deployment script. Its rollback guard passed without mutation:

```sh
sudo python3 /srv/apps/projects/chatty-cat/recovery/scheduler-3b87d3a-20261015/deploy.py check
```

For rollback, use the same command with `rollback` instead of `check`. It checks
the current image/link/configuration first, restores the old selector and link,
and starts the retained actual SEO image through an explicit image override.
It preserves current upload/sync data. Activation had an automatic rollback path
on failure; it was not needed. Actual rollback was not exercised.
