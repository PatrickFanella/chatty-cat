# Reuse the picker's English family collator

The earlier [storage attribution sample](storage-task-attribution.md) measured a
149.1 ms maximum in the visible picker's refresh callback. Its family comparator
called `localeCompare` with English locale/options for each comparison. Reusing
one `Intl.Collator('en', { sensitivity: 'base' })` retains those comparison rules
while avoiding repeated locale setup during sorting. Family-stem extraction,
usage ranking, filtering and stable tie ordering are unchanged.

The local paired microbenchmark sorts all Emoji 17 entries plus mixed-case,
accented, numeric and punctuation-containing emote names: 3,958 values total.
It alternates old/new order for eight pairs under Node 24.18.0. Median sort time
was 64.055 ms for the previous comparator and 5.569 ms for the exported repaired
comparator, about 91.3% less time in this local sort. Both produce identical
complete ordering. Concurrent browser qualification adds timing noise; this is
not a browser picker-refresh, overall CPU or end-to-end latency improvement claim.
See the [raw samples](picker-collator-2026-10-19-evidence.json).

Reproduce from the repository root:

```sh
mise exec node@24 -- node --experimental-strip-types scripts/benchmark-picker-order.mjs
```

The semantic regression compares the complete catalog ordering with the previous
implementation. All 32 picker/order/model tests pass, as do strict TypeScript,
an isolated Vite production build, the overlay ratio guard and all 56 committed
bundle budgets. The loaded main JavaScript is 150,690 gzip bytes, 38 bytes above
the budget baseline and below its 154,748-byte limit. No timing threshold is
enforced in CI. Browser/runtime validation after merge remains separate.

The current 15-minute storage sample keeps its original emitted build; its
served assets were not replaced by this measurement. This repair does not close
#137's storage acceptance or #136's external CPU/GPU gate.
