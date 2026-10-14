# Watched-channel browser companion (#36)

The optional Chromium Manifest V3 extension in `companion/browser` reads the active Twitch tab URL only after **Send watched channel**. It stages a validated channel login in a paired Chatty Cat tab. The web app then requires a destination review and **Open reviewed channel**; pairing, polling and receiving a channel do not change local workspaces.

## Install and pair

Open the browser's extension manager, enable developer mode and load `companion/browser` unpacked. The extension requests `activeTab` and `storage` only. It has no content scripts, persistent Twitch host permission, cookie access or native-messaging permission. Its externally-connectable allowlist is `https://chat.subcult.tv/*`; the protocol additionally accepts only that exact origin, the top-level app root and the paired tab. See Chrome's [external messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) and [activeTab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

In the extension popup, **Generate new pairing code (unpairs)** displays its extension ID and a five-minute one-use code. In the signed-in app's **Browser companion** panel, enter both and pair. No app CSRF value, OAuth secret, workspace record, private message or embedded-player identity is forwarded. A capability and account ID bind one app tab. The capability stays in extension session storage and the app page's memory; it is not synced or stored in app profiles. The extension's session storage uses its default restriction to trusted extension contexts.

Choose a saved destination workspace. Switching away from the active workspace is off until **Allow switching to the selected workspace** is checked. Pair and use **Return to chat; keep browser bridge connected** to keep the app's five-second poll alive. Ordinary close disconnects. Pairing expires after eight hours, or if the app heartbeat is absent for 30 seconds. Reload/account/session change, privacy, explicit unpair, tab removal and detected extension removal clear the bridge. Revocation on page teardown is best effort; the heartbeat expiry is the fallback.

On a Twitch channel page, open the extension and click **Send watched channel**. Only a canonical HTTPS `www.twitch.tv/<channel>` page is accepted; reserved routes, other hosts, credentials and arbitrary URLs are refused. Queries/fragment are not forwarded. The popup's **Focus paired Chatty Cat tab after sending** preference defaults off and is saved only in extension-local storage. It requests tab/window focus only on that explicit send action.

The app stages the latest channel for review. Confirming adds it to the selected saved workspace without removing existing channels, selects that send target, reconciles bounded panes and reloads the selected workspace. Existing reader records and preferences remain. Concurrent workspace edits or a changed account/destination invalidate review. No chat message is sent. Extension popup errors and app connection failures require explicit reconnect; no native process is available through this bridge.

## Verification and limits

Eight focused tests exercise the actual extension protocol and web controller/UI: exact origin/tab/account binding, one-use code, pairing/heartbeat expiry, poll cooldown, URL rejection, no secret forwarding, no mutation on pair/poll/review, stale-destination refusal, privacy/session revocation, channel-capacity refusal and layout/reader preservation. The extension worker serializes session-storage changes across popup and external messages. Only the latest watched channel is retained for two minutes, with a bounded sequence number.

The automated browser-runtime fixture is synthetic. An installed-extension round trip, browser removal and tab-focus behavior still need native acceptance in Chromium. Firefox and Safari are unavailable for this initial `externally_connectable` adaptation; no cross-browser claim is made. Installing an extension does not make the embedded Twitch player share the app's OAuth account. Chat and native playback work without the extension.
