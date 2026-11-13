# Desktop app

The desktop app runs Chatty Cat without the website. It is an Electron shell
(`desktop/main.cjs`) around the same Go server and web build that production uses:

1. On launch it starts the bundled `chatty-cat-server` on `127.0.0.1:47830`, with settings
   only from the shell: no `.env` file and no `TWITCH_*` or `CHATTY_CAT_*` values
   from the user's environment. The registered public Twitch client ID ships in
   `desktop/twitch-client.json`; no client secret is included.
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
| Browser build | `chatty-cat-browser-<commit>-linux-x64.tar.gz` and `chatty-cat-browser-<commit>-mac-arm64.tar.gz` |
| Browser companions | Chromium `.zip` and unsigned Firefox `.xpi` |

Intel Macs, Linux on ARM and Windows have no build. While the repository is
private, downloading a release needs a Gitea sign-in.

Each app is larger than the 100 MB request limit of Cloudflare, which sits in
front of git.subcult.tv. The publish job therefore uploads to Gitea through
Almaz's Caddy on the LAN, and Gitea's attachment limit is 500 MB. A failed publish
can be rerun from the Actions page on `main`: it reuses the release and skips
files already uploaded.

- **macOS:** the app is ad-hoc signed, not notarized, so Gatekeeper blocks the
  first open. Open it with right-click > Open, or run
  `xattr -dr com.apple.quarantine "/Applications/Chatty Cat.app"`.
- **Linux:** the `.deb` installs the Chromium sandbox helper and an AppArmor
  profile. The AppImage needs FUSE 2 (`libfuse2`), which Debian 13 doesn't install
  by default. Without it, run the AppImage with `APPIMAGE_EXTRACT_AND_RUN=1`.

## Browser build

The `chatty-cat-browser` archives run the same server without Electron and show Chatty Cat
in your own browser. Each archive is about 19 MB; the Linux app is 116 MB as a
`.deb` and 143 MB as an AppImage.

1. Extract the archive for your computer. On macOS, first run
   `xattr -dr com.apple.quarantine chatty-cat-browser-<commit>-mac-arm64`; the binary is
   ad-hoc signed, not notarized.
2. In a terminal, run `./chatty-cat` from the extracted folder. It starts
   `chatty-cat-server` on `127.0.0.1:47830` with the desktop app's settings, then opens
   `http://localhost:47830` in your default browser. Set `BROWSER` to use another
   command. The launcher needs `curl`.
3. Press Ctrl+C to stop the server. As with quitting the app, this signs you out.

If the desktop app or another launcher is already serving port 47830,
`./chatty-cat` opens the browser on that server instead of starting a second one.

Differences from the app:

- Settings, history and saved layouts live in your browser's storage for
  `http://localhost:47830`, separate from the app's profile.
- Pop-outs and links open as browser windows and tabs, and **Player sign-in**
  opens Twitch in a tab. Whether the embedded player then sees your Twitch
  sign-in depends on your browser's third-party cookie settings.
- There is no app menu, so no **Check for Updates…**; compare your archive's
  commit with the newest release.

## Checking for updates

On macOS, choose **Chatty Cat → Check for Updates…**; on Linux, choose
**Help → Check for Updates…**. The dialog shows your installed build ID.
Choose **Open Downloads** to open the releases page in your default browser.
Compare the newest release's build ID with the installed one, then download
its installer. Sign in to Gitea in your browser if asked.

Quit Chatty Cat before replacing it with the downloaded version. Settings live
in the separate app profile described above. The Mac build remains ad-hoc signed,
so macOS may require first-open approval again.

This is a manual check through the browser. The app does not store a Gitea token,
automatically compare private releases, download installers, or install updates.
The build ID also appears in **About Chatty Cat**. Older builds need one manual
replacement to gain this menu item.

## Twitch sign-in

Click **Log in with Twitch**, then **Open Twitch in your browser**. Approve
Chatty Cat in your regular browser and return to the app; it detects approval
and opens chat. If prompted, enter the code displayed in the app. The desktop
uses Twitch's device-code flow with a Public client. The registered redirect
URL is `http://localhost:47830/api/auth/callback`, but device sign-in does not
use a redirect callback.

The local server validates the token, owns the session and refreshes tokens
without a client secret. Tokens are kept in memory; quitting the app signs you
out. Settings and saved account names stay in the app profile. Twitch metadata
and account emotes use the signed-in account. Third-party emotes and emoji can
be browsed without signing in; inserting and sending require sign-in.

For a development server, set `TWITCH_PUBLIC_CLIENT=true`, `TWITCH_CLIENT_ID`
and a loopback `CHATTY_CAT_PUBLIC_URL`; leave `TWITCH_CLIENT_SECRET` unset.
The hosted website continues to use its confidential client and callback.

## What doesn't work yet

- **Image uploads and device sync:** both need a shared server, so the desktop
  server has them turned off.
- **Port 47830 in use:** the app reports it and quits. If the app is killed
  without quitting (for example with `kill -9`), its server keeps the port until
  you stop `chatty-cat-server`.
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
profile and an unused loopback port, waits until the status leaves "Connecting…",
checks that Twitch login is enabled, the visible Emotes button opens a
populated picker, and the update menu exists, then saves a screenshot and
prints what rendered:

```sh
xvfb-run -a desktop/dist/linux-unpacked/chatty-cat --smoke=/tmp/smoke.png
```

CI runs it on Linux under Xvfb with `--no-sandbox`, because the job runs as root,
and on the soyuz macOS runner, where it also checks the signature with
`codesign --verify`.

The browser build needs only Go, Node 24 and Python 3, and cross-compiles both
platforms from Linux or macOS:

```sh
npm --prefix web ci
python3 scripts/build-browser-release.py dist-browser
```

The script runs `scripts/build-release.py` once per platform and adds the
launcher (`scripts/browser-launcher.sh`, shipped as `chatty-cat`) and
`desktop/twitch-client.json`. CI extracts the Linux archive, runs the launcher
with `BROWSER=echo`, and checks that it serves the UI and prints the address it
would open.

## Verification, November 3, 2026

On Dozor (Debian 13), from `9b774a4` plus this change, the unpacked app and the
AppImage (with `APPIMAGE_EXTRACT_AND_RUN=1`) both passed the smoke check. Each
started the bundled server, reached `connected` and rendered 35 live #hasanabi
rows with emotes, badges and stream information. No server process remained
after quitting. Without FUSE the AppImage refused to start, as described above.
The `.deb` was inspected but not installed.

On November 4, Desktop run 18201 built `4402a89` on soyuz (Apple Silicon).
`codesign --verify --deep --strict` accepted the ad-hoc signature, and the smoke
check reached `connected` with 35 live rows. Nobody has yet opened the
downloaded dmg on a Mac, so the Gatekeeper first-open steps above are untested.
