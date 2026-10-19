# Storage task attribution, October 19, 2026

PR #172 merged as `141e121`; its final head passed four hosted checks and merged
main passed both push checks. #138 is closed under the owner's accepted
renderer-specific idle scope. #137 remains open: its first 15-minute observation
showed long tasks but lacked enough attribution to distinguish their source.

This slice adds maximum synchronous callback duration and the count over 50 ms
for each native repeating timer and shared-clock task. The resource readout also
reports explicit synchronous `chat.render`, `storage.dispatch.<operation>` and
`storage.reply` boundaries. Errors still propagate; returned promises retain their
identity and are not awaited or timed. No message bodies, accounts, stacks or
per-call records are retained. The fixed operation aggregates are capped at 128
owners, sampled only while the readout records, and cleared by Reset sample.
These counters add no timer or background polling.

The boundaries measure JavaScript work inside the named callbacks. They do not
measure worker execution, the browser's full message deserialization, promise
continuations, layout/paint after the render function returns, or every API/storage
entry point. Nested samples overlap and their totals must not be added together.
An overall long task can exceed 50 ms even when each measured boundary is below
that threshold. The readout's overall long-task observer remains separate.

## Reproduction

Build the frontend, then run the local fixture with a bounded replay warmup:

```sh
npm --prefix web run build
CHATTY_FIXTURE_SEED=100000 go run ./web/test-support/wave5-fixture
```

Open a fresh profile at
`http://localhost:5198/?channel=one&video=off&scrollback=100000&font=system&eonly=0`.
The fixture sends 100,000 synthetic replay rows, then the original live workload
of 100 messages/second. The default seed is zero; only this local test-support
program reads `CHATTY_FIXTURE_SEED`. It rejects invalid values outside 0–100,000.
Wait for the 100,000-row cap, open the resource readout, reset the sample and
record the desired interval without a diagnostic refresh timer. Record visible
panels because the picker and Stats change the work being measured.

The dated JSON receipt records a 60-second diagnostic sample of the emitted
build, its hashes and the observed boundaries. This is not a replacement for the
full 15-minute #137 acceptance session, an improvement claim, a provider check or
a production deployment. Production remains on `b95b7fb`; the existing guarded
recovery check passed read-only on October 19.

## Observed paths

The 60,235 ms diagnostic sample held 100,000 retained rows, a visible picker and
27 mounted chat rows. `chat.render` ran 444 times, each exceeding 50 ms, with a
229.6 ms maximum. `picker.refresh` ran 60 times, each exceeding 50 ms, with a
149.1 ms maximum. These two instrumented UI paths account for 53,637 ms of
synchronous work; the overall observer recorded 504 long tasks totaling 56,876 ms
with a 242 ms maximum. This identifies expensive UI boundaries; it does not yet
localize the individual functions inside them or claim a measured improvement.

The storage scheduler's maximum callback was 1.8 ms. All individual storage tasks
had zero callbacks over 50 ms, with maxima at or below 1.3 ms. Worker request
dispatch was at most 0.4 ms and reply handling at most 0.7 ms, with no calls over
50 ms. Both ledger and rate saves ran twice. There were no captured runtime
errors. The Stats dialog was open, but this sample did not run Stats query/paint
tasks, so it must not stand in for the earlier Stats-open acceptance workload.

The next discriminating measurement is inside `chat.render` and the visible
picker refresh, followed by the same workload after any repair. A new full
15-minute storage run must also exercise Stats queries and retain the unmeasured
async/browser work boundary. #137 remains open. See the
[raw receipt](storage-task-attribution-local-evidence-2026-10-19.json).
