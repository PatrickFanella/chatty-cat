# Storage acceptance, October 19, 2026

The #137 busy-session observation completed for 900,861 ms with 100,000 retained
synthetic messages. The local fixture replayed 100,000 rows, then sent 100
messages per second. The picker, Stats and resource readout were open. Stats
paint ran 180 times, and ledger buckets/ranks, rate queries and summary requests
ran through the worker. No provider messages were sent. The page remained
visible to the browser, with no visibility changes or captured runtime errors.

The measured storage scheduler had a 7.4 ms maximum. Individual storage tasks
stayed at or below 3 ms. Worker dispatch stayed at or below 5 ms, and 14,332
reply handlers stayed at or below 0.6 ms. All these measured boundaries recorded
zero calls over 50 ms. Archive append/prune ran 300 times each; ledger and rate
saves ran 30 and 31 times. Retention stayed at 100,000, with 21 mounted rows and
a 2,048-entry row cache at capture.

This satisfies the readout observation gate at its recorded attribution scope.
The readout times synchronous named callbacks. It does not fully attribute
promise continuations, browser deserialization, layout or paint. It cannot prove
that every portion of every overall long task is unrelated to storage.

The overall observer recorded 5,837 long tasks, with a 421 ms maximum. The
`chat.render` boundary reached 392.4 ms and the picker callback reached 185.5 ms.
Those remain separate UI performance findings. Nested boundary totals overlap;
they must not be added together. This observation makes no external CPU/GPU or
production performance claim.

The observed build came from `818c6f2`, before the picker collator optimization
and render-phase diagnostics in PRs #183 and #184. Its main and worker assets
were fetched through the browser after capture and matched the recorded disk
hashes. The resource readout stopped sampling after its one-shot final capture.
There was no recurring diagnostic refresh timer.

The archive, stats, rate, moderation-journal and storage-worker-client suites
passed under Node 24.18.0: 15 files and 122 tests. They cover worker-shim queries,
bounded transfer, private-message exclusion, quota/retention rollback, isolated
accounts, stale plans, cancellation and recovery. This check ran on `ac432a4`,
whose four hosted checks also passed before PR #184 merged as `655eff6`.

See the [raw observation](storage-acceptance-2026-10-19.json) for counters,
environment, hashes, timestamps and limits, and the earlier
[attribution report](storage-task-attribution.md) for measurement semantics.
