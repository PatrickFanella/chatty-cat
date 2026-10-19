# Overlay background and content shadow

Presentation now has seven overlay-only appearance controls: row-background opacity, content-shadow enablement, shadow opacity/color, horizontal/vertical offset and blur radius. Background and shadow opacity use 0–255; offsets use -20–20 CSS pixels and blur uses 0–40 CSS pixels. Colors are validated six-digit hex values.

Defaults preserve the existing transparent browser source: background opacity 0 and no added content shadow. Chatterino's defaults differ; importing its supported fields is reviewed and maps its values, including three-digit hex colors. Numeric imports are bounded and reported. Native code, credentials and unsupported settings remain excluded.

## Browser source and paired native view

Open the normal app's Presentation panel, search for Overlay, preview the values, then Apply to save or Cancel to restore. These controls affect overlay content at `/overlay.html` and legacy `?overlay=1` URLs. Regular chat keeps its normal background and has no added content filter. Background alpha changes the rows' background colors, not their text/emote opacity. The current overlay-view theme provides the colors; explicit alternating backgrounds and keyword highlights retain their colors with the chosen alpha.

For OBS, configure Presentation in the same browser-source storage/session that loads the overlay. Temporarily use the normal root URL without the overlay query parameter to reach the settings UI, apply the preferences, then restore `/overlay.html?channel=…`. A separate regular browser/profile does not share OBS's preference store. Installing or pairing a desktop companion is unnecessary for this browser-only view.

The paired macOS overlay review includes a bounded copy of these seven public appearance values. The Go helper and native host independently validate them. WebKit receives only the two generated CSS variables, applied on load and after reviewed settings updates; no private account settings, cookies, credentials, arbitrary CSS or JavaScript are transferred. Appearance changes made after review invalidate confirmation through the existing settings comparison.

The native **window opacity** and **window shadow** remain separate controls. To leave the foreground at full native opacity while fading row backgrounds, set window opacity to 1 and use Presentation's background-opacity control. The native view uses its isolated theme; the main browser's custom theme is not copied by this seven-field projection.

Content shadow uses a CSS `drop-shadow` filter on the rendered log, so it includes text, badges and images. It is independent of the OS window shadow. CSS blur/rasterization and native zoom do not promise pixel identity with Qt's graphics effect. Enabling the filter adds rendering work; it stays off by default. It provides no OS click-through, window ordering or process detection.

## Verification

Run the focused browser/model/import checks and the native fixture:

```sh
npm --prefix web test -- src/overlay-appearance.test.ts src/overlay-appearance-ui.test.ts src/chatterino-import.test.ts
go test -race ./internal/companion ./internal/devicesync
python3 scripts/verify-macos-overlay.py /path/to/ChattyOverlay
```

On October 13, 2026, the native WebKit fixture loaded the actual stylesheet, received reviewed appearance values and observed background alpha about 0.502, foreground CSS opacity 1 and the configured content drop shadow. Its existing lease recovery, geometry restoration and account-isolation checks still passed. Chromium's actual Presentation preview produced the same background alpha/foreground result, normal chat kept `filter: none`, and Cancel restored background 0 and no added shadow. Those checks used synthetic local content; no provider write occurred.

The full frontend suite passed 762 tests, strict build and Go race/vet passed. Fixtures additionally cover bounded fields, invalid CSS/URL color refusal, preview/cancel/save and reviewed Chatterino mapping. Installed OBS capture, production-origin native appearance and exact Qt pixel equivalence were not accepted by these checks.

## Dedicated entry qualification, October 18

The dedicated entry preserves public appearance preferences and redirects legacy
root overlay URLs without rewriting their raw query. Both the Go server and Vite
dev/preview servers provide that redirect. The build counts shared JavaScript and
rejects an overlay closure at or above 25% of main.

A native OBS browser source in an isolated temporary profile rendered the final
build at 1280×720, including background alpha 0.502, foreground opacity 1 and the
configured content shadow. A 30-second connected idle source recorded no DOM
mutations, intervals, workers or database opens and zero measured renderer CPU.
Total OBS CPU on the software compositor averaged 2.27%, compared with 0.72% for
a hidden, shut-down source. This does not establish near-zero total OBS CPU or
hardware-accelerated behavior. See the [Wave 5 report](wave5-2026-10-18.md).

On October 18, the owner accepted the renderer-specific idle result for #138.
The accepted gate is zero measured idle renderer CPU and DOM work; total OBS CPU
and hardware-accelerated behavior remain separate observations and are no longer
closure prerequisites. #138 awaits merge of PR #172.
