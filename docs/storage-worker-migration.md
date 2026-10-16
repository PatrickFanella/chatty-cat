# Storage worker migration

Issue #137 moves persistence and retained-data queries off the main thread in
bounded stages. The first stage moves the private moderation journal; the second
moves archive reads and queries. Archive writes, statistics and rate-timeline work
remain on their existing paths. These stages do not satisfy the issue's 15-minute busy-channel performance acceptance.

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

## Remaining stages and release boundary

1. Move archive appends, pruning, recovery and retention ownership. Preserve
   localStorage policy rollback, exact retention review and quota recovery. Keep
   the main in-memory message store.
2. Move statistics ledger aggregation/serialization and statistics IndexedDB,
   preserving reviewed localStorage migration and verified recovery copies.
3. Move rate snapshot persistence and retained-window queries while preserving
   coverage gaps, replay exclusions and visible graph behavior.
4. Run archive/statistics/storage suites through the worker shim and observe a
   15-minute busy-channel session with the resource readout. Attribute storage
   work separately from rendering and structured-clone costs before closing #137.

Neither storage-worker stage is deployed. Rolling source back leaves the original
database readable by the previous implementation. No schema reset or destructive
data conversion is part of rollback. Do not treat a worker crash as permission to
repeat an uncertain provider action.
