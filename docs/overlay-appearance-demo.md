# Overlay background and content shadow

Presentation now has seven overlay-only appearance controls: row-background opacity, content-shadow enablement, shadow opacity/color, horizontal/vertical offset and blur radius. Background and shadow opacity use 0–255; offsets use -20–20 CSS pixels and blur uses 0–40 CSS pixels. Colors are validated six-digit hex values.

Defaults preserve the existing transparent browser source: background opacity 0 and no added content shadow. Chatterino's defaults differ; importing its supported fields is reviewed and maps its values, including three-digit hex colors. Numeric imports are bounded and reported. Native code, credentials and unsupported settings remain excluded.

## Browser source and paired native view

Open the normal app's Presentation panel, search for Overlay, preview the values, then Apply to save or Cancel to restore. These controls affect only `?overlay=1` content. Regular chat keeps its normal background and has no added content filter. Background alpha changes the rows' background colors, not their text/emote opacity. The current overlay-view theme provides the colors; explicit alternating backgrounds and keyword highlights retain their colors with the chosen alpha.

For OBS, configure Presentation in the same browser-source storage/session that loads the overlay. Temporarily remove the overlay query parameter to reach the settings UI, apply the preferences, then restore the overlay URL. A separate regular browser/profile does not share OBS's preference store. Installing or pairing a desktop companion is unnecessary for this browser-only view.

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
