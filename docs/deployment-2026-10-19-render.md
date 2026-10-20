# Render diagnostics deployment, October 19, 2026

Production runs merged main `655eff6bac0d03d9b1d46df22ab050b7bff78980`,
including PRs #182–#184. Each final PR head passed all four hosted checks;
the deployed merge passed both push checks. This deploys committed bundle
budgets, the reused picker collator and nested render-phase diagnostics.

The clean release was built with Node 24.18.0. A separate extraction of its
source archive rebuilt identical main, overlay and worker assets and entry HTML.
All 56 bundle budgets passed. Main uses 150,699 gzip bytes; overlay uses 27,127.

The existing deployment guards preserved both selector/Compose files, the old
image, current target and data backup. Isolated loopback staging passed readiness
and packaged-hash checks before activation. Production then became healthy with
zero restarts; its two retained data files matched the backup. Read-only rollback
guards passed after activation. Recovery is retained under
`/srv/apps/projects/chatty-cat/recovery/storage-655eff6-20261019`.

The public browser loaded `assets/main-D3HIvF30.js`; readiness returned 200.
Main, storage worker and overlay hashes matched the release. The application's
build-qualified source-download link also matched. The bare `/source.tar.gz`
URL still returned an older Cloudflare cache HIT; the app already includes the
main bundle path in its download query to distinguish releases. Verify that
actual link when checking corresponding source.

A request during container recreation returned 502; the next navigation loaded
the app. Subsequent smoke observation captured no runtime error or error banner.
This is bounded deployment verification, not full provider delivery or a new
CPU/GPU/performance acceptance run. The previous image remains
`sha256:d5ec9332c63d5f70f3cc1a11bb32e1bfecab1587f055a53b4f47641543948c91`.

See the [machine-readable receipt](deployment-2026-10-19-render-evidence.json).
