# October 16 deployment

Merged main `b95b7fb58547bf53c898cc69a7357e4ea050506f`, through PR #167, is
deployed at https://chat.subcult.tv. Both merged-main hosted checks passed before
activation. This release includes the later panel, emote and storage-worker stages
that followed the October 15 release. It does not complete issue #137 or the
remaining resource/provider qualification gates.

NUC runs `chatty-cat-chat-1` with immutable image
`sha256:8f31931f83ab9298290990a56e711bb37c1045227cf0d5d4621de201df32e239`.
The current link selects `releases/chatty-cat-b95b7fb-20261016` under
`/srv/apps/projects/chatty-cat`. The actual previous image was
`sha256:6b3c8d9fc77b62ec31fafedfe561dda446cc54eb9d22260c263522e7aec870f7`;
it and the previous release remain available for rollback.

The clean release builder passed strict TypeScript and production compilation.
All 4,036 transferred manifest hashes matched. A loopback staging container with
separate empty upload/sync directories passed readiness and packaged binary,
HTML, main entry, storage-worker and source hashes, then was removed. Activation
preserved the two Compose files, private environment bytes, upload/sync binds and
existing resource/security limits. The production container is healthy with zero
restarts, readiness returned 200, and both retained data files remained byte for
byte unchanged. In-memory OAuth sessions end on backend replacement.

The public browser received readiness/session 200, connected to anonymous chat,
and loaded `assets/main-BXud-HSc.js`. Main, storage worker and release-specific
source responses returned 200 with hashes matching the release manifest. Source
was 3,146,173 bytes. The prior service worker offered Update ready; the normal
Reload control activated the new bundle-specific worker. Its active URL and
cached storage-worker asset were read back after reload. No edge cache purge,
DNS, firewall or provider configuration change was needed.

Root-only recovery is `recovery/storage-b95b7fb-20261016`. It retains the previous
selector/configuration/link/image, environment hash, data backup and guarded
activation/rollback script. The rollback guard passed without mutation:

```sh
sudo python3 /srv/apps/projects/chatty-cat/recovery/storage-b95b7fb-20261016/deploy.py check
```

Use `rollback` instead of `check` to restore the previous release and retained
actual image while preserving current data. Automatic rollback on activation
failure was available and was not needed. Actual rollback, reboot, authenticated
provider actions, disconnected offline loading and production CPU/GPU
qualification were not exercised. Exact public/runtime observations are in the
[deployment evidence](deployment-2026-10-16-evidence.json).

Statistics snapshot serialization work prepared after this deployment is not
included in this release.
