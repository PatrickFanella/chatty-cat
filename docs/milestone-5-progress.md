# Milestone 5 progress

M5 starts from merged main `857a413`. M4 remains open for #32's controlled live event acceptance; starting independent M5 work does not waive that gate.

| Issue | State | Next acceptance |
| --- | --- | --- |
| #35 desktop playback | PR #113 merged; paired Go helper and reviewed web launch verified locally | Desktop installation and real-stream playback; Linux/Windows native checks |
| #36 watched-channel browser companion | PR #114 merged; MV3 active-tab bridge with explicit pairing and reviewed workspace action | Installed-extension round trip, focus/removal acceptance |
| #37 sandboxed web extensions | PR #115 merged; versioned declarative text commands/views with reviewed grants and opaque-frame runtime | Deployed owner acceptance |
| #38 owner-configured IRC relay | PR #117 merged as `502ce9b` after all four hosted checks passed; account-bound TLS relay and isolated bounded history | Approved endpoint/credentials and live owner-network acceptance |
| #47 paired desktop overlay | PR #118 merged as `27174e7` after all four hosted checks passed; paired macOS host and native recovery/geometry fixtures | Installed production-origin and native menu-bar owner acceptance; Linux/Windows unavailable |

See [desktop playback setup, boundaries and demo](desktop-playback-demo.md). The playback contract is reusable by a desktop shell; an embedded Streamlink pane is not implemented by an external-player launch.

See [browser companion installation and evidence](browser-companion-demo.md). Chromium is the initial supported extension target; Firefox/Safari are explicitly unavailable in this slice.

See [web extension contract, compatibility and native-browser demo](web-extensions-demo.md). Version 1 is a bounded text-template adaptation; arbitrary JavaScript and Chatterino Lua plugins are unsupported.

See [IRC setup, supported subset and reproducible checks](irc-relay-demo.md). Local TLS fixtures and UI tests qualify the implementation; owner-network acceptance is still pending. PR #116 merged as `6ecbb07` after all four hosted push/PR checks passed, establishing the verification workflow for subsequent slices.

See [desktop overlay installation, recovery and native fixtures](desktop-overlay-demo.md). Native macOS fixture success does not establish production-origin use or Linux/Windows support. The browser-only OBS overlay remains independent of companion pairing.

The [M5 declaration review](chatterino-coverage.md#m5-declaration-review--october-13-2026) reconciles merged behavior against exact upstream controls. Configurable, initially unbound playback/overlay setup actions now open the selected-channel review flow without any companion request. Public bindings are included in workspace/device-sync validation; page-local pairing capabilities remain excluded. Focused tests cover old snapshots, text fields, dialogs, privacy and hidden views; the full frontend suite passed 758 tests, build and Go race/vet passed.

Overlay appearance now has background-only alpha and bounded content-shadow opacity/color/offset/blur controls, with reviewed Chatterino import, public preference persistence/sync and a validated paired-native projection. [Browser/WebKit rendering checks](overlay-appearance-demo.md) passed; normal chat has no added filter and OBS remains independent of pairing. The full suite passed 762 frontend tests, build and Go race/vet.

The browser-companion panel now has a bounded account-local registry of up to eight named compatible IDs, with manual pairing retained and one active bridge. Selecting/remembering/forgetting IDs makes no extension request. Registry data excludes codes/capabilities and stays out of workspace export/sync. [Registry fixtures](browser-companion-demo.md#verification-and-limits) cover account/stale-write boundaries and paired-field locking; installed Chromium acceptance remains pending.

Independent gaps remain: exact Chatterino action arguments/defaults and direct native-command semantics, native-messaging registration/process attachment and the documented native/IRC/plugin limits. CSS shadow rasterization does not establish Qt pixel identity. Family implementation is not declaration parity. Playback/overlay setup actions are a reviewed web adaptation, not automatic native execution.

The local `/streamlink [joined channel]` command now opens desktop playback setup without a companion request or native execution. Current/named channel parsing, joined-channel/account/view guards and explicit pairing/tool/quality/review/confirmation remain bounded by the existing panel. The full frontend suite passes 769 tests and build; native browser setup checks are recorded in [playback evidence](desktop-playback-demo.md). Direct automatic command launch remains unsupported.

Overlay first-open guidance now follows a successful current-account native receipt, with account-local activation, a request-free reopen button and late-response guards after teardown. The upstream knowledge-level row remains partial because native bit-field import/sync is unsupported. [Guide fixtures](desktop-overlay-demo.md#first-open-guide), all 772 frontend tests and build passed; installed acceptance is still pending.
