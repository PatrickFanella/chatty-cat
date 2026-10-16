# Narrow and portrait panel sheets

Issue #133 gives managed panels one compact layout at widths up to 700 CSS
pixels, or when the viewport is portrait/square. Docked, floating and default
panels share a full-width lower sheet. The sheet takes at most 48% of the
workbench, leaving chat and its composer above it. The picker, video and whispers
use this same path rather than their feature-specific floating geometry.

Open panels have a scrollable tab strip. Only the selected panel is visible and
focusable; switching tabs keeps its DOM, draft inputs and feature lifecycle
intact. Opening an existing panel selects its tab. Arrow keys, Home and End move
between tabs. Escape within the sheet closes the active panel through its own
handler. An inactive picker no longer consumes that Escape event.

Resize changes presentation without assigning the sheet dimensions to saved
floating boxes or dock sizes. Returning to landscape above 700 px restores the
desktop placement in the same session. Existing automatic rail behavior still
follows the display option, and persisted-layout parsing keeps its existing
viewport clamping on page reload. Compact mode does not add a new saved layout
format. A title drag docks the panel at the bottom; the title keeps pointer
capture and `touch-action: none`. Desktop dragging and resizing retain their
existing behavior. Privacy mode hides the tab strip with the panel chrome.

Local browser checks used 600×800, 390×844 and 800×1000 CSS viewports. Presentation,
provider preferences, public context, device sync, archive search, emotes and
video all occupied full-width sheets inside the viewport, with no horizontal
overflow within their panel roots. At the two requested sizes, the signed-out
chat log retained about 255 and 278 px of height, respectively. Synthetic
authenticated whispers and moderation also fit at both sizes; the fixture
recorded zero provider writes. Video was checked without a live embedded player,
and incoming whispers were disabled in the synthetic identity.

Native keyboard input verified Home/End tab focus and Escape closing Presentation
while leaving its inactive picker open. A draft value survived tab changes and a
desktop/compact/desktop round trip, with the saved floating box unchanged. A
synthetic touch PointerEvent drag kept the picker on screen and assigned its
desktop placement to the bottom dock. This is not physical-device touch or mobile
browser qualification. Exact measurements, build provenance and limits are in the
[local evidence](compact-panels-local-evidence-2026-10-15.json).

The full frontend suite passed 860 tests in 185 files. Thirty focused tests passed
after the final tab-focus adjustment. Strict TypeScript, production build,
formatting and diff checks passed. Main JavaScript is 153.84 kB gzip; the existing
large-main warning remains. These changes are not deployed.

To repeat the layout checks, serve the production frontend, set a requested
viewport and open each panel from Menu. Open two panels to test the tab strip,
edit a draft, switch tabs and use Escape. On desktop, dock or float a panel, resize
to compact and back, and compare its saved geometry and draft. For authenticated
panels, use `go run ./web/test-support/moderation` and its local synthetic consent;
inspect `/fixture/stats` to confirm zero provider writes. Do not use real private
messages or moderation actions for geometry checks.
