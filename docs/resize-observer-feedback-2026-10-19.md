# Floating resize feedback, October 19, 2026

The reported browser error was reproduced with the real FloatingPanel at UI zoom
1.25. Its observer read a scaled screen rectangle and wrote the dimensions back
as logical CSS width/height during ResizeObserver delivery. Each notification
therefore enlarged the panel again. A 300×220 CSS-pixel panel grew to 1570×960
screen pixels and emitted seven instances of
`ResizeObserver loop completed with undelivered notifications.`

The repair converts captured geometry, viewport bounds and pointer movement to
logical CSS pixels. Resize notifications coalesce into one animation frame;
geometry writes happen after observer delivery. Stopping the panel cancels the
pending frame. Keyboard movement, pin/unpin, saved geometry and viewport clamping
keep their existing behavior at scale 1. No error event is hidden or suppressed.

The same Chromium fixture now retains 300×220 CSS pixels (375×275 screen pixels
at scale 1.25), at logical position 20,20, with no captured errors. Unit tests
cover repeated zoomed captures, zoomed pointer movement, observer coalescing and cancellation, in addition
to the existing floating-panel behavior. All 935 frontend tests in 190 files,
strict TypeScript/production build and formatting pass.

To reproduce in Vite, open `/test-support/floating-resize.html` in an isolated
preview profile. The fixture uses only its own test storage key and exposes
`window.__floatingResize` for errors and panel geometry. It has no provider
transport. Check pinning, keyboard/pointer movement, CSS resizing and viewport
clamping at scale 1.25. This reproduces a concrete source of the reported error;
it does not establish that every ResizeObserver callback in the application is
free of feedback under every layout.

The repair is prepared for review separately from the deployment of merged main
`bd2e2bf`. See the [October 19 deployment receipt](deployment-2026-10-19.md).

Pinning and keyboard movement also passed at zoom 1.25. At a 390×844 viewport,
the panel clamped to 288 CSS pixels (360 screen pixels) and stayed on screen
without observer errors. See the [raw receipt](resize-observer-feedback-2026-10-19-evidence.json).

## Production follow-up: live chat losing its position

The owner confirmed the repeated error and scroll jump occur on production.
Production still runs merged main `bd2e2bf`; PR #174 merged during this investigation as `e2ec4e7`, containing the floating
repair but not the subsequent virtual-log repair. The original floating-panel fixture alone did not
cover this newly reported chat-log behavior.

A separate real VirtualLog fixture with 1,000 wrapped rows reproduced lost live
following without user scrolling. The log restored a position computed from its
estimated height prefix after painting the actual rows; that could leave it away
from the real DOM end. Queued programmatic scroll events then interpreted the
layout adjustment as manual scrolling. Narrowing the fixture left a 1,216-pixel
gap and following disabled. The same issue could recur when new wrapped rows
arrived, even after the initial restore was corrected.

The log now restores the actual DOM edge while following. Its owned scroll writes
are recognized by both VirtualLog and the parent column handler, so delayed layout
scroll events do not cancel live intent. A wheel/touch scroll or a different scroll
position still pauses normally. ResizeObserver callbacks only collect row heights;
the next animation frame validates current nodes/revisions and updates geometry,
scroll and DOM together. Obsolete entries are discarded and disposal clears pending
measurements. No ResizeObserver error is suppressed.

The repaired wrapped-row fixture stayed at a zero-pixel live gap through five
400/180-pixel width changes and 20 new wrapped rows. The complete emitted app then
ran a 30-second synthetic workload at 100 messages/second, growing from 14,230 to
17,230 retained messages. All 31 once-per-second samples were within 0.5 pixels
of the live edge, the Jump to latest control stayed hidden, and there were no
captured errors or runtime-error banner. The viewport also changed between
1280×800 and 600×800. Unit coverage includes actual versus estimated heights,
observer deferral/coalescing, held-reader remeasurement, queued scroll events and
parent-column follow intent. Deliberate scroll-away behavior remains covered.

These are local receipts, not a production fix claim. The floating repair is merged in PR #174. The separate virtual-log repair is
submitted in PR #175; its production deployment remains a separate step. The virtual-log fixture
did not independently emit the observer error before repair; it reproduced the
lost-follow symptom. The earlier floating fixture reproduced the exact error.
