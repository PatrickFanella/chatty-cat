# Desktop app

The desktop app runs Chatty Cat without the website. It is an Electron shell
(`desktop/main.cjs`) around the same Go server and web build that production uses:

1. On launch it starts the bundled `chatthing` on `127.0.0.1:47830`, with settings
   only from the shell: no `.env` file and no `TWITCH_*` or `CHATTHING_*` values
   from the user's environment.
2. When the server is ready, the app opens `http://localhost:47830` in its own
   Chromium window. The UI files come from the bundled build, and chat, emotes and
   metadata go from the bundled server straight to Twitch and the emote providers.
   Nothing loads from chat.subcult.tv.
3. Pop-out panes and channels open as app windows. Every other link opens in the
   default browser.
4. Quitting stops the server. A second launch focuses the running window.

The port is fixed because the page origin decides where settings, history and
saved layouts are kept. They live in the app's own profile, separate from the
website's: `~/.config/Chatty Cat` on Linux, `~/Library/Application Support/Chatty Cat`
on macOS.

## Downloads

Every push to `main` that changes shipped code runs the Desktop workflow. It
publishes a Gitea release tagged `desktop-<commit>` with these files and a
`SHA256SUMS` file:

| Platform | Files |
| --- | --- |
| Linux x86-64 | `.deb` and `.AppImage` |
| macOS, Apple Silicon | `.dmg` and `.zip` |

Intel Macs, Linux on ARM and Windows have no build.

- **macOS:** the app is ad-hoc signed, not notarized, so Gatekeeper blocks the
  first open. Open it with right-click > Open, or run
  `xattr -dr com.apple.quarantine "/Applications/Chatty Cat.app"`.
- **Linux:** the `.deb` installs the Chromium sandbox helper and an AppArmor
  profile. The AppImage needs FUSE 2 (`libfuse2`), which Debian 13 doesn't install
  by default. Without it, run the AppImage with `APPIMAGE_EXTRACT_AND_RUN=1`.

## What doesn't work yet

- **Twitch login:** the server signs in with a client secret, and an app that
  anyone can download can't hold one. Login, sending and other features that need
  Twitch app credentials are off; anonymous chat works. Adding login needs a
  public Twitch client using the device-code flow.
- **Image uploads and device sync:** both need a shared server, so the desktop
  server has them turned off.
- **Port 47830 in use:** the app reports it and quits. If the app is killed
  without quitting (for example with `kill -9`), its server keeps the port until
  you stop `chatthing`.
- **Desktop playback and the native overlay:** the separate `chatty-companion`
  still needs installing. Set its web origin to `http://localhost:47830`. The
  browser companion extension doesn't apply to the desktop app.

## Building it

On Linux or an Apple Silicon Mac, with Go, Node 24 and Python 3:

```sh
npm --prefix web ci
npm --prefix desktop ci
python3 scripts/build-desktop.py
```

The script runs `scripts/build-release.py` for the host platform into
`desktop/build/server`, so the app bundles the same manifest, `LICENSE`,
`NOTICE.md` and `source.tar.gz` as a production release. It then packages the
app into `desktop/dist`. To test without packaging, run `npm --prefix desktop start`
after the build.

`--smoke=<file.png>` is the check CI runs. It starts the app with a throwaway
profile, waits until the status leaves "Connecting…", saves a screenshot and
prints what rendered:

```sh
xvfb-run -a desktop/dist/linux-unpacked/chatty-cat --smoke=/tmp/smoke.png
```

CI runs it on Linux under Xvfb with `--no-sandbox`, because the job runs as root,
and on the soyuz macOS runner, where it also checks the signature with
`codesign --verify`.

## Verification, November 3, 2026

On Dozor (Debian 13), from `9b774a4` plus this change, the unpacked app and the
AppImage (with `APPIMAGE_EXTRACT_AND_RUN=1`) both passed the smoke check. Each
started the bundled server, reached `connected` and rendered 35 live #hasanabi
rows with emotes, badges and stream information. No `chatthing` process remained
after quitting. Without FUSE the AppImage refused to start, as described above.
The `.deb` was inspected but not installed. The macOS build has not run yet; the
first Desktop workflow run is its first check.
