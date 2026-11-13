# Automatic production deploy on NUC

Every push to `main` runs the Verify workflow. Once its Go and frontend jobs
pass, the **Deploy to production** job deploys that commit to NUC. A deploy
restarts the service, which ends all in-memory sign-in sessions, so it is skipped
when nothing that ships in the release changed (for example a docs-only merge).

## How it works

1. **CI job:** connects to `onnwee@10.0.0.56` with the `NUC_DEPLOY_KEY`
   repository secret and passes no input. NUC's `authorized_keys` restricts that
   key to `restrict,from="10.0.0.0/24",command="/usr/local/bin/chatty-cat-autodeploy"`,
   so it can do nothing else. The host key is pinned in the workflow.
2. **`chatty-cat-autodeploy`:** runs as `onnwee`. It fetches `main` with the
   `subcult-agent` credential helper and requires both Verify push checks to have
   passed on that exact commit, waiting up to 10 minutes. It compares the commit
   with the live release's `baseCommit`:
   - If no path under `cmd/`, `internal/`, `web/` or `companion/` changed, nor
     `go.mod`, `go.sum`, `.go-version`, `NOTICE.md`, `LICENSE` or
     `scripts/build-release.py`, production stays as it is.
   - Otherwise it builds the release with `scripts/build-release.py` in a builder
     container (Node 24 with Go 1.27.4, as in the repository `Dockerfile`).
3. **`release.py`:** runs as root through `sudo`.
   - `install` copies the build into `releases/<name>` as root.
   - `prepare` writes a recovery checkpoint, builds the image from
     `Dockerfile.release` and starts it in an isolated staging container. Staging
     must pass readiness, and every packaged file must match the manifest.
   - `activate` switches `image.env` and `current` and waits for the container to
     report healthy. Any failure restores the previous image and release.
4. **Public check:** the autodeploy script confirms that https://chat.subcult.tv
   serves the new main bundle with matching bytes and that readiness returns 200.
   If not, it runs `release.py rollback`. It finishes with the read-only
   rollback guards.

A lock file allows one deploy at a time. Releases, images and recovery
checkpoints are kept; nothing is pruned automatically.

## Installed files on NUC

| Path | Owner | Source |
| --- | --- | --- |
| `/usr/local/bin/chatty-cat-autodeploy` | root, 755 | `deploy/nuc/chatty-cat-autodeploy` |
| `/usr/local/lib/chatty-cat-deploy/release.py` | root, 644 | `deploy/nuc/release.py` |
| `/srv/apps/projects/chatty-cat/Dockerfile.release` | onnwee, 644 | `deploy/nuc/Dockerfile.release` |
| `/srv/apps/projects/chatty-cat/build/` | onnwee | created by the script: clone, builder, temporary output |

The installed copies are not updated from the repository automatically. After
changing one of these files here, review it and install it again by hand, for
example:

```sh
sudo install -o root -g root -m 755 deploy/nuc/chatty-cat-autodeploy /usr/local/bin/chatty-cat-autodeploy
sudo install -o root -g root -m 644 deploy/nuc/release.py /usr/local/lib/chatty-cat-deploy/release.py
install -m 644 deploy/nuc/Dockerfile.release /srv/apps/projects/chatty-cat/Dockerfile.release
```

Hold `/srv/apps/projects/chatty-cat/deploy.lock` while you do this, so
`release.py` cannot run halfway through. Install `release.py` and `Dockerfile.release` together:
`release.py` passes the binary's name to `Dockerfile.release` as `BIN`, and the
image always runs it as `/app/chatty-cat-server`. Releases built before the
binary was renamed ship it under its old name; `release.py` reads the name from
the release manifest, so it can stage either.

`Dockerfile.release` sets no application settings. `compose.nuc.yaml`,
`compose.m4.yaml` and `shared/app.env` set them for production, and `release.py`
sets them for the staging container.

### Rename transition, November 2026

Settings moved from `CHATTHING_*` to `CHATTY_CAT_*`, and the binary from
`chatthing` to `chatty-cat-server`. Production must set both names while a
release from before the rename can still be activated or rolled back to. Before
merging the rename, under `sudo flock /srv/apps/projects/chatty-cat/deploy.lock`:

1. Install `release.py` and `Dockerfile.release` as above.
2. In `compose.nuc.yaml`, change the image line to
   `${CHATTY_CAT_IMAGE:-${CHATTHING_IMAGE:?Set an immutable release image}}` and
   add `CHATTY_CAT_ADDR`, `CHATTY_CAT_ASSETS` and `CHATTY_CAT_ENV_FILE` beside
   the old names, with the same values.
3. Install `deploy/compose.m4.nuc.yaml` as `compose.m4.yaml`; it sets both names.
4. Add `CHATTY_CAT_PUBLIC_URL` to `shared/app.env` with the value of
   `CHATTHING_PUBLIC_URL`.

After a later release has replaced the first renamed one (so rollback no longer
reaches a release from before the rename), remove the `CHATTHING_*` lines from
these files, rewrite `image.env` as `CHATTY_CAT_IMAGE=…`, drop the nested image
fallback, and remove the transition lines from `release.py` and
`compose.m4.nuc.yaml`.

## Operating it

- Deploy the current green `main` by hand: `chatty-cat-autodeploy` on NUC.
- Build and stage without activating: `chatty-cat-autodeploy --stage-only`. Delete
  the staged release, its checkpoint and its image afterwards.
- Roll back the live release:
  `sudo python3 /usr/local/lib/chatty-cat-deploy/release.py check <name>`, then
  `... rollback <name>`, where `<name>` is the target of `current`.
- Turn automatic deploys off: remove the `chatty-cat-actions-deploy` line from
  `~onnwee/.ssh/authorized_keys` on NUC. The CI job then fails and nothing deploys.
  The copy from before installation is in
  `~/.local/state/chatty-cat-autodeploy/authorized_keys.before-20261104`.
