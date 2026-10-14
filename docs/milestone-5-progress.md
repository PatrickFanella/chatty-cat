# Milestone 5 progress

M5 starts from merged main `857a413`. M4 remains open for #32's controlled live event acceptance; starting independent M5 work does not waive that gate.

| Issue | State | Next acceptance |
| --- | --- | --- |
| #35 desktop playback | PR #113 merged; paired Go helper and reviewed web launch verified locally | Desktop installation and real-stream playback; Linux/Windows native checks |
| #36 watched-channel browser companion | PR #114 merged; MV3 active-tab bridge with explicit pairing and reviewed workspace action | Installed-extension round trip, focus/removal acceptance |
| #37 sandboxed web extensions | PR #115 merged; versioned declarative text commands/views with reviewed grants and opaque-frame runtime | Deployed owner acceptance |
| #38 owner-configured IRC relay | Implemented account-bound TLS relay, reviewed private/channel conversations and isolated bounded history | PR/CI merge, approved endpoint/credentials and live owner-network acceptance |
| #47 paired desktop overlay | Planned | Native window host, recovery/geometry/account checks and platform limits |

See [desktop playback setup, boundaries and demo](desktop-playback-demo.md). The playback contract is reusable by a desktop shell; an embedded Streamlink pane is not implemented by an external-player launch.

See [browser companion installation and evidence](browser-companion-demo.md). Chromium is the initial supported extension target; Firefox/Safari are explicitly unavailable in this slice.

See [web extension contract, compatibility and native-browser demo](web-extensions-demo.md). Version 1 is a bounded text-template adaptation; arbitrary JavaScript and Chatterino Lua plugins are unsupported.

See [IRC setup, supported subset and reproducible checks](irc-relay-demo.md). Local TLS fixtures and UI tests qualify the implementation; owner-network acceptance is still pending. PR #116 merged as `6ecbb07` after all four hosted push/PR checks passed, establishing the verification workflow for subsequent slices.
