# Storage worker migration

Issue #137 moves persistence and retained-data queries off the main thread in
bounded stages. The first stage moves the private moderation journal. Archive,
statistics and rate-timeline work remain on their existing paths; this stage does
not satisfy the issue's 15-minute busy-channel performance acceptance.

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

## Remaining stages and release boundary

1. Move archive appends, pruning, recent/history reads and query scans. Replace
   callback predicates with cloneable query descriptions; preserve cancellation,
   pagination and exact retention review. Keep the main in-memory message store.
2. Move statistics ledger aggregation/serialization and statistics IndexedDB,
   preserving reviewed localStorage migration and verified recovery copies.
3. Move rate snapshot persistence and retained-window queries while preserving
   coverage gaps, replay exclusions and visible graph behavior.
4. Run archive/statistics/storage suites through the worker shim and observe a
   15-minute busy-channel session with the resource readout. Attribute storage
   work separately from rendering and structured-clone costs before closing #137.

This first stage is not deployed. Rolling source back leaves the original
database readable by the previous implementation. No schema reset or destructive
data conversion is part of rollback. Do not treat a worker crash as permission to
repeat an uncertain provider action.
