# Visibility-aware emote animation

Issue #136 now has an implementation for virtualized readers. Each reader owns
one IntersectionObserver rooted in its scroll container, with 150 px of animation
overscan inside the existing 500 px mounted-row overscan. Animated emotes with a
distinct static variant use that variant until their row intersects this region.
Leaving it, hiding the document, evicting a row or stopping a pane switches the
image back to still. Visibility changes update existing images without rebuilding
rows. Observers and listeners are disposed with their owner.

Manual freeze and animation preferences remain separate from automatic pause.
Re-entry cannot undo either. The picker pauses while hidden or closed; Hold+
release cannot restart it while hidden. Failed animated assets stay on their
static fallback through later visibility changes. Images without a distinct
static variant retain their existing behavior; the diagnostic readout reports
them as `withoutStatic` rather than counting them as paused.

The first decoded image aspect ratio is retained across swaps. CSS continues to
set emote height, scale, maximum width and overlay geometry. Virtual rows use
`content-visibility: auto` and measured heights for intrinsic-size containment.
The existing key/offset anchoring and measured-height cache remain authoritative.

The resource readout adds `animatedEmotes` with playing, paused and missing-static
counts for mounted images. These are selected-source counts, not decoder, CPU or
GPU measurements. No polling timer was added.

Local validation passed 852 frontend tests across 183 files, strict TypeScript,
production build, formatting and diff checks. The production entry is 153.20 kB
gzip (523.33 kB raw); the existing large-main warning remains. Tests cover manual
freeze/automatic pause composition, permanent error fallback, ratio retention,
hidden construction, row eviction/disposal, hidden Hold+ release and close.

The native-browser fixture uses 2,000 cached rows with eight animated GIFs per
row and a deliberately different static-image aspect ratio. At the initial edge,
25 mounted rows selected 120 animated and 80 static images. Controlled hide
selected 0 animated and 200 static images; resume restored 120/80. A history
viewport mounted 38 rows: after manually freezing one image, 159 played and 145
paused; hide paused all 304, then resume restored 159/145. Reader key 991,
offset 23 and scrollTop 31,961 stayed unchanged. Row heights and all image
dimensions matched before/after; the original image node was preserved. Detached
cached rows retained their still source.

The local production app also loaded successfully with the new readout. During
its controlled hidden check, all 74 tracked images paused and repeating timers
were zero. Read-only live chat continued; no account or provider write was sent.
The exact samples are in [local evidence](emote-animation-local-evidence-2026-10-15.json).

To repeat the geometry fixture, run the Vite development server and open
`/test-support/emote-animation.html`. It uses inline synthetic assets and exposes
`qa.snapshot()`, `qa.view.reveal(key)` and cached records for inspection. This
fixture is outside the production build. Its source URLs and animation counts
can be inspected without contacting an emote provider.

Visibility was controlled by overriding `document.hidden` in an isolated test
tab and dispatching `visibilitychange`, then restoring native properties. This
does not establish natural browser background throttling. External CPU/GPU
measurements and a comparable busy-channel live/history session remain required
by #136; keep the issue open for that qualification. This change is not deployed.
