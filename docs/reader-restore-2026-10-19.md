# Delayed history can override an explicit jump to live

Investigation of [#177](https://git.subcult.tv/subculture-collective/chatty-cat/issues/177)
found a reproducible startup race in the real application. A workspace's saved
reader position remains pending until its message is loaded from local history.
Selecting Latest messages resumed the log but left that pending position intact.
When history arrived, the next render restored the old position and paused the
log again. This can explain a jump back after resuming; it does not prove that
this race caused the earlier production observation.

The repair clears the pending workspace reader position at the start of the
Latest messages action. Delayed history still loads normally. A user who does
not choose live still receives the intentionally saved reader position.

The regression boots the actual main application with delayed history. Its three
cases cover fresh live startup, saved paused startup, and resuming before history
arrives. Before the repair, the resume case restored the old reader and failed;
the controls passed. With the repair, all three pass, including the actual log's
following state. The full frontend suite passes 938 tests across 191 files;
strict TypeScript/production compilation, the overlay bundle guard and formatting
also pass.

A Chromium fixture using the real main, workspace, history hydration and virtual
log code reproduces the same failure on unchanged main `2e0ae34`: after choosing
Latest messages and releasing 1,000 delayed history rows, the log ends 31,171
pixels behind, with Latest messages visible. The repaired application ends at a
zero-pixel gap, with that button hidden. It remains at zero after narrowing to
600 pixels and appending 20 synthetic live messages. Both captures contain no
browser error events. See the [raw receipt](reader-restore-2026-10-19-evidence.json).

To reproduce locally, start Vite on a dedicated disposable origin and open
`/test-support/reader-restore.html`. This fixture clears localStorage on its own
origin and substitutes synthetic API/socket responses; use an isolated browser
profile and a dedicated port. Wait for `window.__readerRestore.ready`, select
Latest messages, call `__readerRestore.releaseHistory()`, and read
`__readerRestore.read()` after hydration. Call `__readerRestore.append()` to add
live messages. Reload without choosing Latest messages to verify intentional
paused restoration; `?mode=fresh` starts without saved readers.

This repair is not yet merged or deployed. Production remains on `4a97004`.
#177 stays open for merged/deployed qualification, including the normal update
reload and startup paths. This does not close #137's performance acceptance gate
or establish that all ResizeObserver callbacks are free of feedback.
