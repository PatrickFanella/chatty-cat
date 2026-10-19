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
to the existing floating-panel behavior. All 930 frontend tests in 190 files,
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
