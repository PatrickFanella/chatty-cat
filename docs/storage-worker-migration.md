# Storage worker migration

Issue #137 moves persistence and retained-data queries off the main thread in
bounded stages. The first stage moves the private moderation journal; the second
moves archive reads and queries. The third moves appends and bounded recovery.
The fourth moves read-only retention preview. Pruning, reviewed retention apply,
statistics and rate-timeline work remain on their existing paths. These stages do not satisfy the issue's 15-minute busy-channel performance acceptance.

## First stage: private journal

`ModerationJournal` keeps its asynchronous public interface and delegates to a
dedicated module worker. `JournalStore` contains the original IndexedDB
implementation, unchanged except for its class name. Database name, version,
account keys, validation, capacity reservation, retention signatures and terminal
outcomes are unchanged. Existing records need no format or schema migration.

The versioned protocol explicitly permits list, begin, finish, retention preview,
retention apply and stop. It carries account identifiers and structured-clone
arguments/results, with correlated request IDs. It carries no auth tokens and
has no provider transport. Capacity checks and the journal's serialization run
inside the worker. Explicit export formatting still runs on user request.

Provider handlers continue awaiting a committed pending receipt before sending.
An unavailable worker, message decoding failure or lost acknowledgement closes
the client to new operations. There is no automatic retry, worker restart or
main-thread storage fallback. A timeout cannot establish whether an operation
committed; reload and inspect retained receipts before another action. Transaction
errors, including quota denial, preserve their names and existing recovery
behavior. Stop drains admitted operations, closes the database and acknowledges
before the client terminates the worker. Each journal instance has its own
worker; IndexedDB still serializes writes across instances and tabs.

Vite emits the worker as an immutable build asset. The build adds that asset to
the shell manifest so the existing service worker includes it in its precache;
a missing worker/manifest fails the build. This avoids a first-use dependency on
an uncached worker after the app has installed.

## Verification

The existing journal and moderation, AutoMod, poll, prediction and broadcaster UI
tests run through an asynchronous structured-clone shim using the same worker
host. They retain the durable-before-send, account-switch, uncertain outcome,
pending-capacity, stale-retention, database-close and version-change checks.
Additional checks cover quota rollback/recovery, request/response isolation,
shutdown drain, out-of-order replies, worker failure, lost acknowledgements,
malformed replies, queue capacity and refusal to send when a worker cannot start.

The full frontend suite passed 872 tests in 186 files; all 52 focused journal,
transport and provider-UI tests also passed. Strict TypeScript,
production build, formatting and diff checks passed. The worker is 11,145 bytes
raw / 3,857 bytes gzip; the main entry is 153.85 kB gzip and the moderation panel
is 22.62 kB gzip. The existing large-main warning remains.

Native Chromium checked the built worker while a Window-level guard rejected
every attempt to open the journal database on the main thread. Journal refresh
and reviewed export succeeded with zero guarded opens. A synthetic receipt was
pending before completion, rejected stale retention after completion, isolated a
different account and remained confirmed after worker shutdown and recreation.
The local synthetic provider recorded zero writes. The worker asset was present
in both the manifest and shell cache; disconnected offline loading was not
tested. Exact results are in the [local evidence](storage-worker-journal-local-evidence-2026-10-16.json).

To repeat native checks, build the frontend and run the existing moderation
fixture. Use its synthetic consent, open Moderation and refresh/preview the private
journal. A Window-level `indexedDB.open` guard for `chatthing-moderation-journal`
must not fire. The worker URL is in `asset-manifest.json` under
`src/storage-worker.ts`. Its operations can be exercised with synthetic accounts
through version-1 messages; never use real private receipts in a QA export.

## Second stage: archive reads and queries

The private-journal stage merged in PR #162 at main `2062797`; all four PR-head
hosted checks passed. The next stage moves archive get, recent history, search,
paginated search and chronological channel scans into the worker. The facade
flushes pending writes before querying, so recently received messages remain
visible. The existing database and indexes need no migration.

Query expressions, command lists and moderation identities replace function
predicates at the structured-clone boundary. The worker compiles the expression
once per request and validates each retained record against the public archive
command allowlist. Private messages remain excluded, including malformed legacy
records stored directly in IndexedDB. Moderation history keeps its existing ID,
login and imported-history rules.

Search cancellation travels as a control message to an AbortController in the
worker; cancelling a read does not close the client or replay the operation.
Progress notices remain correlated to their request. Channel scans return at
most 100 messages per batch and wait for the caller before requesting another
batch. Timestamp/key cursors preserve equal-timestamp records. An initial upper
cursor prevents newer live appends from extending a scan indefinitely. Pages use
separate read transactions: backdated inserts, edits or concurrent deletions can
still change later pages; this is not a database snapshot.

Archive append, pruning, recovery and retention review/apply remain in the
existing implementation. Retention couples localStorage policy changes with
IndexedDB deletion and rollback; moving that ownership is a separate reviewable
stage. Public reads instantiate no private-journal database. Transport failure
still closes the client without an automatic fallback or retry.

The full frontend suite passed 879 tests in 186 files, including the existing
quota/recovery and private receipt tests. New regressions cover cloneable filters,
moderation identities, equal-time pagination, an upper scan cursor, cancellation,
late replies, progress and Chromium's error-before-abort transaction ordering.
Strict TypeScript, production build, formatting and diff checks passed.

Native Chromium searched the built application with a Window-level guard that
throws on archive read transactions. The UI showed a 100-result first page with
more results available and zero guarded reads. A native worker traversed 1,500
public records in batches of at most 100, without duplicates or the private
sentinel. Cancelling at the 250-row progress notice returned AbortError; a
subsequent query succeeded. The synthetic provider recorded zero writes. The
worker asset was in the manifest and shell cache. Disconnected offline loading
and a 15-minute busy-channel performance session were not tested. See the
[archive query evidence](archive-worker-local-evidence-2026-10-16.json).

The worker is 84,438 bytes raw / 22,471 bytes gzip; the main entry is 526,357 bytes
raw / 153,198 bytes gzip (Python gzip, default compression, mtime=0). The worker
includes public-record validation and query parsing, increasing its payload from
the journal-only stage. This is a thread-ownership change, not a total transfer
reduction. The existing large-main warning remains.

## Third stage: archive appends and bounded recovery

The query stage merged in PR #163 at main `2c9c5d5`; all four PR-head hosted
checks passed. Appends and public bookmark-excerpt recovery now use the same
archive worker connection as reads. The main facade retains its bounded incoming
queue and scheduling. It awaits the append acknowledgement before pruning, and
flushes its final queued batch before stopping the worker.

The worker validates every append as a public archive record before starting a
transaction, limits a batch to 2,000 messages and retains the channel/ID key for
deduplication. Failed transactions report after rollback. A definite quota failure
leaves the bounded facade queue available for retry. A lost acknowledgement or
transport failure permanently closes that client; subsequent flushes cannot
resubmit its queued batch. Reload and inspect retained history after an uncertain
write. There is no automatic worker restart or main-thread insertion fallback.

Recovery remains limited to six public excerpts. It uses the cap and retention
policy captured by the facade at dispatch, counts existing rows, skips retained
keys and atomically inserts only missing records. It never overwrites a retained
moderation flag. Capacity failure aborts all inserts and preserves the useful
capacity error through subsequent IndexedDB error events. Cancellation remains
available for recovery; appends use the non-cancellable request path.

Pruning and retention preview/apply remain unchanged on the main thread. Their
localStorage policy reads, reviewed signatures, deletion and conditional rollback
need to move as a coordinated unit. The main archive connection remains for those
operations. This stage does not establish that all archive storage is off-thread.
There is no schema change, destructive conversion or cleanup of existing data.

All 883 frontend tests in 186 files passed, including existing archive retention,
private journal and provider fixtures. New checks cover append quota rollback and
queue recovery, all-or-nothing recovery capacity, final shutdown flush, and worker
rejection of private/oversized batches. TypeScript, production build, formatting
and diff checks passed.

Native Chromium exercised the emitted worker directly with synthetic records
while a Window-level guard rejected archive put/add calls. A duplicate append
retained two keys; recovery inserted one missing key while preserving an existing
deleted flag. An over-capacity recovery and a mixed private append left no partial
records. Exactly the three expected records survived shutdown and worker
recreation, with zero guarded main-thread inserts. This verifies the native RPC
path; live provider ingestion was not exercised. The worker was in the shell
cache, but disconnected offline loading was not tested. Exact bundle sizes and
results are in the [write evidence](archive-worker-writes-local-evidence-2026-10-16.json).

The initial write-stage head had both frontend jobs and the pull-request Go job
pass, while its push Go job failed in `TestPersonalChat`. That fixture assumed
PONG preceded a concurrent user action. A separate test-only repair requires both
exact frames in either valid order and adds a forced action-first case. Both cases
passed 50 race-detector repetitions; the full Go race suite and go vet passed.
Hosted results for the replacement head must be assessed separately.

## Fourth stage: retention preview

The write stage merged in PR #164 at main `40afd42`; all four PR-head hosted
checks passed on its final head. Retention preview now uses a read-only worker
transaction and returns only the review plan. It walks keys in the existing
chronological index order, accumulating counts, bounds, age eligibility and the
legacy signature without allocating an array of every retained key. Row/age
limits combine with the same maximum rule as before, so overlapping removals are
counted once. The main facade still flushes pending appends before preview.

The plan shape, policy parsing and timestamp/key signature are unchanged.
Existing apply transactions therefore accept current worker-generated plans and
reject stale ones. Preview neither changes records nor saves a proposed policy.
Pruning and retention apply remain unchanged on the main thread, including the
synchronous localStorage write before deletion and conditional rollback after a
transaction abort. Moving apply requires a separate design for cross-thread
policy ownership; passing an asynchronous callback into an IndexedDB transaction
would not preserve the current guarantee.

All 885 frontend tests in 186 files passed, with TypeScript, production build,
formatting and diff checks. Added tests compare the exact legacy signature,
including equal timestamps and Unicode keys, age/cap overlap, unchanged records
and policy, and an empty plan accepted by the existing apply transaction. Existing
stale-review and policy-storage failure checks still pass through worker preview.

Native Chromium seeded 10,000 public synthetic records through the emitted worker.
With main-thread archive key scans blocked, the native worker and actual Export
logs panel previewed the expected reduction to 5,000 rows / seven days. The
signature matched an independent calculation; all 10,000 records and the saved
policy were unchanged after preview. The guard recorded zero attempted scans.
After replacing that guard with a counter, the panel's existing apply path accepted
the plan, performed one main-thread key scan, removed exactly 5,000 records and
saved the selected policy. This fixture confirms compatibility, not complete
storage isolation or production performance. The worker was in the shell cache;
disconnected offline loading was not tested. Exact results and asset sizes are
in the [retention-preview evidence](archive-retention-preview-local-evidence-2026-10-16.json).

## Remaining stages and release boundary

1. Move archive pruning and retention ownership. Preserve
   localStorage policy rollback, exact retention review and quota recovery. Keep
   the main in-memory message store.
2. Move statistics ledger aggregation/serialization and statistics IndexedDB,
   preserving reviewed localStorage migration and verified recovery copies.
3. Move rate snapshot persistence and retained-window queries while preserving
   coverage gaps, replay exclusions and visible graph behavior.
4. Run archive/statistics/storage suites through the worker shim and observe a
   15-minute busy-channel session with the resource readout. Attribute storage
   work separately from rendering and structured-clone costs before closing #137.

These storage-worker stages are not deployed. Rolling source back leaves the original
database readable by the previous implementation. No schema reset or destructive
data conversion is part of rollback. Do not treat a worker crash as permission to
repeat an uncertain provider action.
