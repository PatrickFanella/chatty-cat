# Local text extension framework (#37)

Version 1 accepts declarative JSON text commands/views, with a closed permission list and isolated execution. It does not execute JavaScript, HTML, native programs or Chatterino Lua. Existing Lua plugins are not compatible. The example is `companion/extensions/channel-note.json`.

## Manifest and permissions

A manifest uses `format: chatty-cat-extension`, `version: 1`, an ID/name, explicit permissions, and command/view arrays. Contributions have ID, title and template. Only `{{channel}}` and `{{input}}` substitutions are supported; there is no expression language, code field, URL loader, import, network API or private-state accessor. Unknown fields/placeholders/permissions and malformed/duplicate IDs are rejected.

| Permission | Supplied capability |
| --- | --- |
| `context:channel` | Current public channel login only. No message bodies, account credentials or other workspace data. |
| `input:text` | Up to 500 characters deliberately entered in the extension panel. It is not the chat draft or private note store. |
| `composer:stage` | Enables the separate Stage output button after a successful run. Normal Send is still separate. |

Import a JSON manifest in **Web extensions**, review the exact normalized manifest/permissions, then confirm installation. It starts disabled. Choose **Review enable permissions** and confirm separately. Enabled commands/views appear in this panel and the action palette; palette actions open the selected contribution rather than execute it. Run explicitly and inspect plain-text output. An extension can stage text only after its declared permission and a separate user click. Rendered output is a textarea value, never HTML or an automatic link/command action.

Disable cancels the current action and clears review/output. Remove requires review. Export downloads only the chosen manifest. Manifests/enabled flags are stored per signed-in account and excluded from device sync and workspace exports. Account/session changes and privacy clear pending review, supplied input, output and runtime frames. Stale cross-tab storage rejects further actions rather than overwriting it; reopen to load current state. No extension auto-runs on installation, enable, login or incoming chat.

## Isolation and limits

The interpreter runs in a fresh `srcdoc` iframe with `sandbox="allow-scripts"` and no same-origin permission. The frame contains only trusted interpreter code; the contribution template and explicitly permitted context arrive through a bounded message. Its CSP permits that nonce-authorized interpreter and denies network, workers, nested frames, forms and base URLs. It has no app closures. The response must come from that exact opaque-origin frame, match the request ID and carry bounded plain text. See [iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox) and [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).

Bounds are eight installed extensions / 128 KiB total, 16 KiB UTF-8 per manifest, 16 commands and eight views per manifest, 1,000 template characters, 500 input characters, 512 interpreter segments, 2,000 output characters, one running action, 20 invocations per extension per minute and a two-second frame deadline. The fixed interpreter stops output expansion at the limit; no untrusted loop or executable code is accepted. Deadline, disable, close, privacy and teardown remove the frame. This does not promise an operating-system memory quota for arbitrary plugins; arbitrary plugin code is unsupported.

## Compatibility and reproducible demo

The JSON manifest and opaque-frame contract are web adaptations. Desktop playback, IRC, cookies/tokens, private records, filesystem, custom HTML, fetch and Lua/JavaScript plugin APIs are unavailable. Browsers must support sandboxed `srcdoc`, CSP and postMessage; a denied/deadlined runtime reports an error and cannot silently run in the app origin. There is no fallback to an unsandboxed interpreter.

Run `npm --prefix web run dev -- --port 5174 --strictPort` and open `/test-support/extensions.html` in a separate profile. Use Fixture: stage example file, open Web extensions, review/install, then review/enable. Enter hello and run Format note: output is `Note for #one: hello`; the fixture draft stays empty. Stage output separately to populate only that draft. Run the channel view, then disable/remove through their controls. Enable privacy: the dialog closes, supplied input/output clear and no frame remains. No Twitch action occurs.

Native T3 browser verification on October 13, 2026 covered install/enable, real sandbox execution, separate draft staging, opaque-frame access refusal, zero API requests, frame cleanup and privacy clearing. Tests cover code/private/native permission rejection, undeclared placeholders, quotas, stale cross-tab writes, account isolation, disabled installation, reviewed enabling, cancellation and deadline cleanup. Production deployment and owner acceptance remain separate from this local evidence.
