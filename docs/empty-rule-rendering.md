# Empty-rule render path

At 100,000 retained synthetic messages, the render-phase readout identified
item preparation and virtual-log updates as expensive synchronous boundaries.
Both paths evaluated the rule engine for each retained row, including the
default state with no configured rules. Empty evaluation still performed
per-message cache and pane-key lookups.

The render now selects an engine only when its configured rule list is nonempty.
An empty list cannot hide, highlight or otherwise match any global or pane rule.
Configured rules retain the existing evaluation path. Each render captures the
current engine; rule preference changes already schedule a new render and
invalidate visual rows. Filtering, moderation, similarity and reader behavior
remain in their existing paths.

The integration test verifies that an empty-rule rerender does not invoke the
engine, then adds an ignore rule through the storage-event path and observes all
matching history items disappear. Removing the rule restores those items and
stops evaluation again. The delayed-history tests retain their original
live/saved-reader assertions. All 943 frontend tests across 191 files passed
under Node 24.18.0; strict TypeScript and all 56 bundle budgets passed too.

The browser comparison uses a local production build, 1280×800 viewport,
100,000 retained rows, 100 synthetic messages/second, selected system font and
open picker, Stats and resource readout. Named boundaries are synchronous and
nested; their totals overlap. No external CPU/GPU, provider or production
performance qualification follows from these measurements.

A separate weak item-cache experiment was rejected: its first sample increased
average preparation time to 85.7 ms versus the 68.3 ms baseline. Its code was
discarded before this change. The empty-rule candidate's first sample averaged
55.4 ms for preparation and 78.7 ms for enclosing render, versus 68.3 ms and
111.5 ms in the baseline. Every candidate enclosing render still exceeded 50 ms.
Repeated measurements are recorded with their actual loaded bundle identities.

Two warm observations per build produced these average synchronous durations:

| Build/sample | Calls | Item preparation | Virtual-log update | Enclosing render |
| --- | ---: | ---: | ---: | ---: |
| Baseline 1 | 481 | 68.3 ms | 43.1 ms | 111.5 ms |
| Baseline 2 | 367 | 80.1 ms | 48.2 ms | 128.5 ms |
| Candidate 1 | 494 | 55.4 ms | 23.2 ms | 78.7 ms |
| Candidate 2 | 611 | 51.0 ms | 22.6 ms | 73.8 ms |

The candidate's averages were lower in both observations. Maxima still overlap:
candidate preparation reached 119.3–123.8 ms versus baseline 118.9–191.6 ms.
All enclosing renders still exceeded 50 ms. Two sequential observations on a
shared host support this limited shortcut, not a broad throughput guarantee or
completion of busy-session UI optimization. Candidate 2 reused its warm document;
the samples have different callback counts and scheduler cadence.

See the [raw samples and summaries](empty-rule-rendering-evidence-2026-10-19.json).
