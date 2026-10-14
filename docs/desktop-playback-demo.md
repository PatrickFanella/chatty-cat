# Optional desktop playback (#35)

The separately installed `chatty-companion` launches owner-configured players from an explicit web review. It is not part of the public server. Chat and native Twitch playback remain usable without it. A desktop shell can reuse the launch contract; this release does not embed a player or ship a desktop application.

## Installation and configuration

Build on the viewer's computer with `go build -o chatty-companion ./cmd/chatty-companion`. Review `companion/config.example.json`, then copy it outside the checkout. Set the exact web origin and absolute executable/dependency paths for the local installation. Run `./chatty-companion -config /path/to/config.json`. The helper listens only on IPv4 loopback `127.0.0.1:47831`. Do not publish the port or run it on the production host for remote viewers.

The Streamlink example uses its documented player option and stream-quality argument: [CLI](https://streamlink.github.io/cli.html), [quality/audio-only examples](https://streamlink.github.io/latest/cli/tutorial.html). Availability of a quality, stream, authentication and successful playback is decided by Streamlink and the player. Chatty Cat OAuth credentials are never forwarded. The owner may configure VLC or another player through Streamlink; fixed local arguments are owner-trusted. Do not configure a shell/interpreter that evaluates the substituted URL as code.

Only whole `{url}` and `{quality}` arguments may be substituted. The browser supplies a validated joined-channel login and a closed quality choice; the helper constructs `https://www.twitch.tv/<login>`. No arbitrary URL, file, executable or argument text crosses the API. Custom URI schemes and automatic chat-command-driven execution are unavailable. The executable is invoked directly with an argument vector, without a shell.

In the signed-in web app, open **Desktop playback**, paste the terminal's code and choose **Pair local companion**. Codes are one-use, expire after five minutes and allow five attempts. Pairing binds the exact configured origin and selected Twitch account ID. That ID is an isolation label chosen in the locally approved pairing; the helper does not authenticate Twitch independently. The browser retains the random capability only in this page's memory, never profile storage or sync. Pairing expires after eight hours. Restart the helper to pair again after unpair or reload.

The action palette also offers **Open desktop playback setup and review** and **Open native overlay setup and review**. Both are configurable in Shortcuts and unbound by default. They select the current send channel and focus the appropriate setup controls; they do not pair, review automatically or launch anything. They require the signed-in main workspace and retain the normal editable/dialog/IME/privacy guards.

The local command `/streamlink [joined channel]` opens this same setup panel. With no argument it selects the current send channel; a `#` prefix and uppercase letters are normalized. Only one channel argument is accepted: URLs, quality arguments and executable options are refused. It sends no Twitch message or companion request and does not select a tool or launch a player. Choose your configured Streamlink tool and quality, then review and confirm separately. The signed-in account, privacy, main-view, open-dialog and pending/uncertain-request guards still apply. An unjoined channel is refused without changing the workspace. This is a reviewed web adaptation of Chatterino’s direct launch command.

Choose a joined channel, available configured tool and quality (including Audio only), then **Review external playback**. The review expires in 60 seconds. Only **Launch reviewed playback** starts a process. **Check companion status** shows pending/running/exited jobs and an exit code; exit 0 does not prove audible playback. Network failures do not retry automatically. An uncertain launch may retry only the same reviewed request ID; the helper deduplicates all 32 allowed requests for the session. After an expired uncertain review, check status or unpair/restart rather than issuing a fresh launch. At most two managed processes run at once. No child output is exposed to web content.

**Unpair and request playback stop**, privacy, account/session change and page teardown clear local capability/reviews and attempt revocation. Revocation cancels managed processes; shutdown/Ctrl+C also cancels and reaps them. Losing the local connection cannot guarantee revocation delivery; use the terminal recovery action. Pair expiry ends managed launches. A separately spawned player/descendant may need to be closed manually. This release does not manage complete OS process trees.

## Compatibility

| Environment | Supported contract / limitation |
| --- | --- |
| macOS | Native Go helper and absolute local executable paths; loopback fixture and child lifecycle verified. Streamlink/mpv/VLC must be installed separately. |
| Linux | Helper cross-compiles; local player/display/session and browser local-network policy need native acceptance. |
| Windows | Helper cross-compiles; configure absolute `.exe` paths with JSON escaping. Player installation and process-tree handling need native acceptance. |
| Browser | May prompt for local-network access or refuse loopback by policy. Connection errors require explicit retry; browser chat stays usable. See [local-network access](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access). |
| Public server/container | No companion listener, executable launch endpoint or configuration is added. |

## Reproducible native-browser fixture

Run `npm --prefix web run dev -- --port 5174 --strictPort`, then `go run ./web/test-support/desktop-playback`. Open `http://127.0.0.1:5195` in a separate browser profile. Its synthetic Alice account and prefilled temporary code are test-only; the configured child checks exact canonical arguments and exits without accessing Twitch or launching a player.

Open Desktop playback; no launch occurs. Pair; the configured child is available and Missing player is disabled. Select Audio only and review: there are still zero launch requests. Confirm once and check status: one launch request, `one / audio_only: exited (exit 0)`. Change the fixture account and call its auth-change hook: pairing/review/code clear without another launch. Restart the fixture before another pairing test.

For the setup-action fixture, open **Fixture actions** and choose **Open native overlay setup and review** before pairing. The dialog selects `one`, focuses Native overlay opacity, and leaves both confirmations disabled. Close it, open Fixture shortcuts, bind the overlay action to `Alt+Shift+KeyO`, save, then press that chord outside text fields/dialogs. It opens the same setup section with zero loopback companion requests. Reopening setup discards earlier playback/overlay reviews. This native T3 browser check passed on October 13, 2026; it opens no native window or player.

Verified in the native T3 browser on October 13, 2026. Unit tests additionally cover foreign/opaque origin refusal, account mismatch, consumed/expired pair capability, invalid plans, request-ID conflicts, real child-process cleanup, no requests before pairing, no launch on review/privacy and late pairing after account change. Full frontend suite: 734 tests at this checkpoint; Go race/vet and strict web build pass. This is local integration evidence, not deployed real-stream playback, audibility or Linux/Windows runtime acceptance.

The local command fixture at `/test-support/desktop-command.html` (Vite on port 5182) exercises synthetic account 42 and joined channels one/two without a companion. Native T3 browser checks verify the named-channel selection, disabled launch, zero requests and invalid-channel refusal. Unit tests cover parsing and account/view guards; the full suite passes 769 tests and the strict build. Real-stream playback acceptance remains pending.
