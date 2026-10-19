# October 19 floating-resize repair deployment

Merged main `e2ec4e798ad83c154fa8d85e03604c2239a240b3`, through PR #174, is
now deployed at https://chat.subcult.tv. This includes the zoomed floating-panel
ResizeObserver repair and the corrected release source list. The separate
virtual-log live-follow repair in PR #175 is not included in this deployment.

The clean release builder passed strict TypeScript and compilation. Its public
source archive now includes overlay, test-support and companion imports directly;
an independent build of that archive reproduces the selected main, worker,
overlay and HTML hashes without packaging supplements. Both merged-main hosted
checks passed before activation.

NUC selects `releases/chatty-cat-e2ec4e7-20261019`, with immutable image
`sha256:a8ea94dbf5fa05f26637e30c84607fc159335613f92d2932b6427d09f7873079`.
All 4,041 manifest hashes matched. An isolated staging container passed readiness
and packaged binary/HTML/main/worker/source checks and was removed. Guarded
activation preserved Compose/environment bytes and data binds. Production is
healthy with zero restarts and readiness 200; both retained data files match
the pre-activation backup.

The public browser loaded `assets/main-1GbpM8zh.js`, connected to anonymous chat
and activated its matching bundle-specific service worker. Browser-fetched main,
worker, overlay, HTML and source hashes match the release manifest. Existing
production tabs need the normal Update ready / Reload transition to adopt the
new bundle. Fresh-browser verification does not establish that every existing
client completed that transition or that all resize paths are free of errors.

Root-only guarded recovery is:

```sh
sudo python3 /srv/apps/projects/chatty-cat/recovery/storage-e2ec4e7-20261019/deploy.py check
```

That read-only check passed. Its `rollback` restores the retained source-complete
`bd2e2bf` package/image while preserving current data. Actual rollback was not
needed or exercised. Authenticated provider writes, reboot and disconnected
offline behavior remain unqualified. See the [exact receipt](deployment-2026-10-19-resize-evidence.json).
