# Milestone 5 progress

M5 starts from merged main `857a413`. M4 remains open for #32's controlled live event acceptance; starting independent M5 work does not waive that gate.

| Issue | State | Next acceptance |
| --- | --- | --- |
| #35 desktop playback | PR #113 merged; paired Go helper and reviewed web launch verified locally | Desktop installation and real-stream playback; Linux/Windows native checks |
| #36 watched-channel browser companion | PR #114 merged; MV3 active-tab bridge with explicit pairing and reviewed workspace action | Installed-extension round trip, focus/removal acceptance |
| #37 sandboxed web extensions | PR #115 merged; versioned declarative text commands/views with reviewed grants and opaque-frame runtime | Deployed owner acceptance |
| #38 owner-configured IRC relay | PR #117 merged as `502ce9b` after all four hosted checks passed; account-bound TLS relay and isolated bounded history | Approved endpoint/credentials and live owner-network acceptance |
| #47 paired desktop overlay | Implemented paired macOS AppKit/WebKit host, reviewed controls and native recovery/geometry fixtures | PR/CI merge, installed production-origin and native menu-bar owner acceptance; Linux/Windows unavailable |

See [desktop playback setup, boundaries and demo](desktop-playback-demo.md). The playback contract is reusable by a desktop shell; an embedded Streamlink pane is not implemented by an external-player launch.

See [browser companion installation and evidence](browser-companion-demo.md). Chromium is the initial supported extension target; Firefox/Safari are explicitly unavailable in this slice.

See [web extension contract, compatibility and native-browser demo](web-extensions-demo.md). Version 1 is a bounded text-template adaptation; arbitrary JavaScript and Chatterino Lua plugins are unsupported.

See [IRC setup, supported subset and reproducible checks](irc-relay-demo.md). Local TLS fixtures and UI tests qualify the implementation; owner-network acceptance is still pending. PR #116 merged as `6ecbb07` after all four hosted push/PR checks passed, establishing the verification workflow for subsequent slices.

See [desktop overlay installation, recovery and native fixtures](desktop-overlay-demo.md). Native macOS fixture success does not establish production-origin use or Linux/Windows support. The browser-only OBS overlay remains independent of companion pairing.
