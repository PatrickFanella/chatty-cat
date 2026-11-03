# Minimal UI and Settings window deployment, November 3, 2026

Production runs merged main `8a80132f234233b6b9696265857082fe80381e45`. That
commit contains the minimal shell and Settings window (#197) and the #136
qualification records (#198, #199). Both main checks passed before the release was
built. The [machine-readable receipt](deployment-2026-11-03-minimal-ui-evidence.json)
has the hashes.

## Release

- **Build:** made on Dozor from a clean clone of `8a80132`, in a throwaway builder
  image with Node 24.22.2 and Go 1.27.2. The repository Dockerfile uses the same
  toolchain.
- **Checks:** `scripts/build-release.py` ran the strict build and all bundle
  budgets. It recorded 4,038 files and no uncommitted changes.
- **Source archive:** extracting the bundled `source.tar.gz` and building it again
  gave eight identical artifacts: both HTML entries, the main JS and CSS, the
  Settings chunk, the companion chunk, the storage worker and the overlay JS.

## Activation

The guarded `deploy.py` from the previous release was adapted to this one and kept
in `/srv/apps/projects/chatty-cat/recovery/storage-8a80132-20261103`.

- **Staging:** it built `chatty-cat:8a80132-20261103` from `Dockerfile.release`
  and ran it in an isolated container with separate data directories. The
  container passed readiness, and ten packaged hashes matched the manifest.
- **Activation:** it moved `current` to `releases/chatty-cat-8a80132-20261103`
  and started image
  `sha256:cbedbc1190ea04ef9d7f277a3d2c0361f00aafd1fcc5ed09e788327b5340d28a`.
  The container started at `2026-11-03T23:12:38Z`, became healthy and has zero
  restarts.
- **After activation:** read-only rollback guards passed. Both retained server
  data files match the pre-deployment checkpoint.

The restart ended in-memory OAuth sessions, so signed-in users need to sign in
again.

## Public checks

- **Assets:** the public page loads `main-C17z3amt.js` and readiness returns 200.
  Eight public artifacts match the release hashes: main JS, main CSS, the Settings
  chunk, the storage worker, the companion chunk, the overlay JS, `overlay.html`
  and the build-qualified source download.
- **1280×800:** the minimal shell rendered live #hasanabi chat. Ctrl+, opened the
  Settings window with 11 pages, and the current page has no accent edge.
- **390×844:** the document stayed 390 px wide, the login button ended at 384 px,
  and no error banner showed.
- **Failed requests:** the only ones were native Twitch emotes' `animated` URLs
  returning 404 before the app falls back to their static image. That behaviour
  is unchanged since the previous release.

## Found after activation

Escape does not close the Settings window in Chrome. The dialog's close watcher
works, because `requestClose()` closes it, but Chrome never delivers the Escape
key to it. A plain test dialog in the same page closes normally. The fix in the
same PR as this receipt closes the window explicitly on an unhandled Escape. It is
not deployed yet.

## Rollback

On NUC, after checking for later changes:

```sh
sudo python3 /srv/apps/projects/chatty-cat/recovery/storage-8a80132-20261103/deploy.py check
sudo python3 /srv/apps/projects/chatty-cat/recovery/storage-8a80132-20261103/deploy.py rollback
```

Rollback restores the previous `image.env`, points `current` back to
`releases/chatty-cat-2cb8dea-20261020` and starts image
`sha256:ed23e75bfba8ecd685cc6929d60d6f1d436d7056d074d4b837a0147430787be0`.
It has not been run.

## Not verified

Signed-in flows (login, sending, moderation, whispers), the installed browser
companion and native OBS were not exercised against this release. #32, #36 and
#38 remain open.
