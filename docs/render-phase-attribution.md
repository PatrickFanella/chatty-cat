# Render-phase attribution

The [busy-session diagnostic](storage-task-attribution.md) localized long tasks to
chat rendering and the visible picker, while measured storage callbacks were
short. The resource readout now divides synchronous chat work into `chat.items`
(filtering and LogItem preparation), `chat.contexts` (existing pane-context
refresh) and `chat.virtualLog` (virtual-reader update and synchronous DOM work).
`picker.query` measures catalog filtering/sorting separately from the enclosing
picker refresh callback. `chat.render` remains the enclosing aggregate.

These are nested measurements. Their totals overlap and must not be added.
They use the existing capped, opt-in resource sampler, retain only fixed owner
aggregates, and add no timer, per-message record, stack or content capture.
Returned values and thrown errors retain the existing measurement behavior.
Promise continuations and later browser layout/paint remain outside these
synchronous boundaries. This change supplies a discriminating next measurement;
it does not itself improve latency or attribute every long task.

The real main-application test verifies that its normal render produces all four
chat aggregates. Main startup/reader-restoration, capacity, picker and sampler
tests pass, as do strict TypeScript, an isolated production build, formatting,
the overlay guard and all 56 bundle budgets. Loaded main JavaScript measures
150,699 gzip bytes against the 154,748-byte limit. Browser phase measurements
and hosted CI remain separate verification steps.

The ongoing 15-minute storage acceptance sample keeps its original served bundle.
Its assets were not replaced by the isolated build used for this change. After
that sample is captured, repeat the same workload with these phases enabled to
select the next actual bottleneck. #137 and #136 acceptance remain independent.
