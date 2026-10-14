# Optional paired desktop overlay

The macOS overlay host opens one floating AppKit window with a fresh, nonpersistent WebKit session for public read-only chat. It uses the installed companion's existing origin/account pairing. It does not transfer Twitch cookies, OAuth credentials, provider writes or private conversations into the overlay. The paired account ID is an isolation label from local approval; the companion does not authenticate Twitch independently.

## Install and recover

On the viewer's Mac, build a new app bundle and the Go companion:

```sh
scripts/build-macos-overlay.sh /absolute/path/ChattyOverlay.app
go build -o /absolute/path/chatty-companion ./cmd/chatty-companion
```

The build script refuses to replace an existing output. This is a locally built, unsigned application, not a signed/notarized distribution. Review `companion/macos/config.example.json`, copy it outside the checkout, set the exact web origin and your app's absolute executable path, then run `chatty-companion -config /path/to/config.json`. Playback tools may also be configured; an overlay-only configuration uses an empty tools array.

Open **Desktop playback** in the signed-in web app and pair using the companion's one-use terminal code. Pairing alone opens no window. Select a joined channel, choose opacity (0.2–1), scale (0.5–2), content width/height (within the displayed bounds), shadow and interactive/click-through mode. Review **Open native overlay**, then confirm. Settings updates require another review. Recovery and close are immediate actions because they restore control or stop the window.

**Cat Overlay** in the macOS menu bar remains available while the chat window ignores mouse input. Its actions recover interaction, reset geometry and close. Escape also recovers interaction while the overlay receives keyboard input. Recovery raises opacity to at least 0.6 and brings the window forward. The window becomes interactive after ten seconds without an acknowledged browser status lease; the browser renews that lease every two seconds while an overlay is active. A connection failure stops renewal and shows the recovery instructions. Menu-bar access and OS policy can still affect recovery; close the helper with Ctrl+C as a separate fallback.

Unpair, privacy, account/session change and page exit clear browser capability/reviews and request companion revocation. Delivered revocation, pairing expiry and companion shutdown cancel and reap the native host. If the helper cannot be reached, browser teardown cannot guarantee closure: use the native menu or Ctrl+C. Closing the playback dialog alone keeps the paired overlay and its lease active.

Window position and size are saved locally in a geometry-only preferences suite, keyed by the paired account and exact origin. Reopening restores saved geometry and clamps it into the current visible display bounds; saved size can override the initial requested size. A reviewed settings update sets a new size. Scale, opacity, shadow and click-through are requested anew. No web cookies or chat history are persisted by the native host. Another paired account uses a separate geometry key.

## Operation boundary and compatibility

The browser sends closed operations (open, update, recover, close) and bounded settings to the loopback helper. It cannot supply executable paths, argument vectors, file paths or arbitrary URLs. The helper constructs only the configured origin's `/?channel=<login>&overlay=1&video=off`, then invokes the owner-installed host directly with a JSON configuration argument. No shell is used. The native view refuses unrelated navigation, login pages and new browsing destinations.

One overlay is allowed per pairing. Up to 128 successful operation receipts remain for duplicate-request lookup; retrying an identical request returns its receipt without opening another window. Receipts describe the accepted operation, not the window's current state; status reports current state. Changed request bodies are refused. Failed/uncertain operations require inspection or explicit recovery, with no automatic operation retry. The existing five-minute pairing-code and eight-hour capability limits still apply.

macOS is the initial native target. Floating-window levels and auxiliary full-screen behavior do not guarantee placement over exclusive full-screen applications, protected windows or every space/display policy. Click-through affects the entire native window, including its title bar; the separate menu-bar recovery action remains available. Shadow is a window setting, not a web text effect. Automatic game/process detection is unsupported.

Linux and Windows report the native overlay unavailable in this version. There is no X11/Wayland or Windows window host to install, and cross-compiling the Go helper does not implement those controls. Browser content cannot provide OS click-through. The existing OBS browser source at `?overlay=1&channel=<login>` remains usable without installing or pairing any companion; its public-chat behavior is unchanged.

## Reproducible verification

The native fixture uses only a local synthetic page, with no provider connection:

```sh
python3 scripts/verify-macos-overlay.py /absolute/path/ChattyOverlay.app/Contents/MacOS/ChattyOverlay
```

It opens a real AppKit window, verifies click-through, waits for lease-expiry recovery, changes opacity/scale/shadow/size, restores geometry after relaunch and checks another account's geometry. It creates temporary synthetic geometry entries in the local preferences suite. The script prints bounded native state; it does not claim real-stream acceptance or inspect a production account.

For the native-browser pairing demo, run Vite on 5174, then:

```sh
CHATTHING_OVERLAY_FIXTURE_HOST=/absolute/path/ChattyOverlay.app/Contents/MacOS/ChattyOverlay go run ./web/test-support/desktop-playback
```

Open `http://127.0.0.1:5195` in a separate browser profile. The synthetic Alice identity and prefilled pairing code are test-only. Pairing and review open no window; confirmation opens the synthetic public-chat window. Recover and close through the web controls, then change the fixture account and invoke its auth-change hook to verify teardown. The existing child-player fixture remains independent and makes no provider request.

Local verification on October 13, 2026 passed the full Go race suite/vet, 754 frontend tests and strict production build. The actual macOS host passed the geometry, lease recovery and settings fixture. Native T3 browser pairing, reviewed opening, recovery, closing and account teardown were exercised against the synthetic page. Hosted Linux checks cover the Go command protocol and frontend tests; they do not compile or run AppKit. Installed production-origin use and OS menu-bar click-through recovery still need owner acceptance. M4 controlled live events and other M5 acceptance gates remain open.
