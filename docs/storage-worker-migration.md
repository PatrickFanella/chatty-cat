# Storage worker migration

Issue #137 moves persistence and retained-data queries off the main thread in
bounded stages. Stages one through seven moved private-journal and archive reads,
appends/recovery/preview, statistics persistence/encoding and rate persistence.
Stage eight completes archive IndexedDB ownership with pruning and reviewed
retention apply. The Window retains the small localStorage policy operation.
Stage nine moves retained-row summary calculation into a worker. Persistent
ledger aggregation, snapshot construction and rate-series computation remain
on their existing paths. The 15-minute busy-channel acceptance is still open.

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

## Fifth stage: statistics persistence and recovery copies

Retention preview merged in PR #165 at main `dcd16e6`; all four PR-head checks
passed. Statistics IndexedDB reads, snapshot writes, migration copies and backup
verification now execute in the storage worker. The existing async storage API,
key allowlist, six-million-character limits and database version are unchanged.
Each storage call owns a worker for that operation and stops it after its result;
the underlying database connections close before replying. Worker startup and
structured-clone overhead remain to be measured.

Migration still requires explicit review. The facade captures the reviewed key/raw
pairs before yielding, checks that local originals match, and sends that snapshot
to the worker. The worker commits exact recovery copies and fills only missing
snapshot keys, then reads every copy back in a separate committed transaction.
Only a successful verification acknowledgement lets the facade compare each local
original again and release unchanged slots. Changed originals remain in place and
are reported separately. Failure or a lost acknowledgement cannot authorize
removing originals. No operation is automatically replayed by the transport;
later statistics saves retain their existing scheduling and overwrite semantics.

This stage preserves newer IndexedDB snapshots and unrelated localStorage keys.
There is no schema migration, deletion of recovery copies or fallback insertion
on the main thread. Statistics aggregation, snapshot JSON serialization and the
synchronous legacy-preview parse remain on the main thread. The existing
non-IndexedDB compatibility branch in StatsLedger is unchanged.

All 889 frontend tests in 186 files passed, with TypeScript, production build,
formatting and diff checks. The existing statistics storage, ledger and storage-UI
checks run through the structured-clone worker shim. New failures cover backup
verification, concurrent local changes, caller mutation of an in-flight reviewed
plan, and worker startup refusal. They retain originals or the captured reviewed
values as appropriate. Existing abort, quota, newer-snapshot and replay-deduplication
checks pass.

Native Chromium moved one synthetic legacy scope through the actual Stats panel
while a guard rejected main-thread opens of `chatthing-statistics`. The panel
reported success, the old slot was released, and worker reads returned exact
counts. Direct worker write/read and invalid-scope checks also passed. A read-only
inspection using the saved native open after the guarded flow found one exact
recovery copy. The flow recorded zero guarded opens; the worker asset was in the
shell cache. These are local persistence checks, not live provider, disconnected
offline or performance qualification. See the
[statistics evidence](statistics-worker-local-evidence-2026-10-16.json).

## Sixth stage: rate snapshot persistence

Statistics persistence merged in PR #166 at main `4f3f342`; all four PR-head
checks passed. RateTimeline now owns a storage-worker client for retained snapshot
reads and writes. The worker keeps the existing database, store and channel-list
key without a schema migration. Counts, gaps and source-specific coverage remain
one snapshot value; writing the current scope and trimming other scopes to the
existing 16-key bound remain one transaction. Scope trimming retains its existing
key-order behavior rather than adding a recency policy.

RateSeries and the graph stay on the main thread. Their live/replay rules,
validation of restored records, page-closed gaps, rolling windows and hidden-tab
painting behavior are unchanged. Storage startup/transaction/transport failure
leaves live rate observations running without a main-thread persistence fallback.
A failed transport closes that timeline's client, with no restart or replay.
Ordinary transaction aborts preserve the previous value and allow a later save.

Managed shutdown is now awaitable and idempotent. It stops both clocks, waits for
an older save, captures a final snapshot containing later observations, and then
closes the database and terminates the worker. Startup restoration completes
before that final capture even if stop arrives while the read is pending; retained
history is not overwritten by a partial startup snapshot. This does not guarantee
completion during abrupt tab/process termination.

All 895 frontend tests across 187 files passed, with TypeScript, production build,
formatting and diff checks. Six new checks cover restoration of counts/coverage
and closed-page gaps with replay exclusion, in-flight save drain, startup-stop
ordering, atomic snapshots and 16-scope trimming, aborted-write recovery, and live
observations with a denied worker. Existing graph/visibility checks still pass.

Native Chromium retained an exact synthetic snapshot with counts, socket gaps and
coverage across worker recreation. Cloned-result mutation did not change storage.
Eighteen scope writes left 16 keys, retained the newest written scope and removed
the earliest test scope. A Window guard recorded zero rate-database opens. Over
about 65 seconds the actual application sent two scheduled worker saves; a later
controlled hide flush produced an application snapshot readable through a native
worker. These observations are local persistence smoke checks, not the required
15-minute busy-channel performance session. Read-only key-count inspection used
the saved native open after the guarded operations. The worker was in the shell
cache; disconnected offline loading was not tested. See the
[rate evidence](rate-worker-local-evidence-2026-10-16.json).

## Seventh stage: statistics snapshot JSON encoding

Rate persistence merged in PR #167 at main `b95b7fb`; both merged-main checks
passed. That exact main is now deployed; see the
[October 16 deployment receipt](deployment-2026-10-16.md). This seventh stage was
prepared afterward and is not part of that release.

The IndexedDB save path now sends a captured statistics snapshot to the worker,
which JSON-encodes it, enforces the existing six-million-character limit and
commits the raw string. Stored JSON remains byte-equivalent to the previous
encoding. Saves stay serialized and each captures its own snapshot before joining
the write queue; later observations do not change earlier queued values. Pending
classification arrays are detached when a snapshot is built. Oversized or invalid
serialization leaves the previously saved value in place.

Aggregation, pruning, snapshot object construction and restore JSON parsing remain
on the main thread. The non-IndexedDB compatibility branch still encodes and saves
through localStorage, and the explicit legacy migration preview remains unchanged.
This stage does not move all statistics computation or establish a measured
performance reduction; structured-clone and worker startup costs still matter.

All 899 frontend tests in 187 files passed, with TypeScript, production build,
formatting and diff checks. New tests cover byte-equivalent encoding, ordered
queued saves while observations arrive, detached snapshot arrays, capacity
rejection preserving prior data, and invalid scope rejection. Existing failure,
replay/deduplication and reviewed recovery-copy checks still pass.

Native Chromium encoded a 1,000-row synthetic snapshot into the exact expected
37,988-character JSON string. Capacity rejection retained that string. A Window
guard rejected statistics-snapshot JSON encoding, while the actual application
sent snapshot operations and a controlled hide flush saved a valid snapshot
through the worker. The guard recorded zero attempts. The saved native stringify
was used explicitly for the synthetic comparison baseline outside the application
path. The worker was cached in the shell cache. See the
[serialization evidence](statistics-serialization-local-evidence-2026-10-16.json).

## Eighth stage: archive pruning and reviewed retention apply

Statistics encoding merged in PR #168 at main `cb2cf29`; all four PR-head checks
passed. This next stage moves the remaining archive database operations to its
worker. MessageArchive no longer opens IndexedDB or starts archive transactions
in the Window. Its bounded queue, scheduler, public methods and retained database
format are unchanged. Initialization also occurs in the worker. Shutdown closes
the worker even if its final flush fails.

A correlated policy handshake preserves the localStorage/IndexedDB ordering:

1. The worker acquires the archive write transaction. For apply it scans and
   validates the reviewed signature/removal count before requesting a policy
   write. For automatic pruning it obtains the count before requesting the
   current policy read.
2. While waiting, non-mutating key requests keep that transaction active. The
   deadline is five seconds; expiration aborts rather than deleting without a
   policy response. Other archive transactions may wait during this bounded
   coordination. No key arrays or arbitrary callbacks cross the transport.
3. Only the Window callback registered for that admitted request can read or save
   the policy. Its result/error returns through a typed control message; the
   callback is removed after one use. Unsolicited policy notices fail closed.
4. The worker continues pruning/deletion inside an IndexedDB request callback
   after a successful response, then acknowledges commit or confirmed abort.
   A policy-storage refusal aborts without deletion. A confirmed post-policy
   abort conditionally restores the old policy only if its current value still
   equals the proposed value, preserving the existing newer-policy guard.

A lost acknowledgement or worker failure after the policy was saved is explicitly
uncertain. The facade retains the selected policy, reports that inspection/reload
is required and does not retry or fall back to main-thread deletion. It cannot
safely infer whether the transaction committed. This extends the existing
transport failure handling with a distinct error name; ordinary transaction and
quota error names remain intact. No schema/version migration, destructive
conversion or change to stored policy values is required.

All 906 frontend tests in 187 files passed, with TypeScript, production build,
formatting and diff checks. Seven new checks cover confirmed deletion rollback,
a concurrently replaced policy, missing policy responses, transport loss after
policy write, cleanup after failed final flush, correlated policy notices and
unsolicited-notice refusal. Existing stale-review, quota, private-record,
recovery/capacity and private provider-receipt checks still pass through the shim.

Native Chromium ran the actual Export logs panel with Window archive opens and
transactions blocked. A simulated policy quota refusal kept all 10,000 records
and left the policy unset. A fresh reviewed apply then removed exactly 5,000 rows
and saved the policy. Worker pruning enforced that policy after two new records.
Withholding its policy response produced TimeoutError after about five seconds,
kept all 5,000 rows and released the transaction so another query succeeded. The
final build also applied a second reviewed reduction to 1,000 rows. Every guard
recorded zero main-thread archive calls. The worker was in the shell cache; no
disconnected offline or 15-minute performance claim follows from these checks.
Exact results are in the
[retention-worker evidence](archive-retention-worker-local-evidence-2026-10-17.json).

## Ninth stage: retained-row statistics summaries

Archive ownership merged in PR #169 at main `ee5f1cb`; all four final PR-head
checks passed. The Stats panel now sends its retained message snapshot, channel
catalogs, time window and exclusions to a dedicated worker connection. The worker
runs the existing summary algorithm: replay deduplication, emote tokenization,
link parsing, rankings, minute/hour/day bins, gap bands and burst detection. The
optional retained-row header and open panel share one cloned request. The normal
application's live rate header still uses RateSeries.

The request admits at most the message store's existing 100,000-row and 24-channel
limits. Capacity errors refuse the report instead of silently truncating it. One
calculation may be active per panel; repeated refreshes request one follow-up.
Filter changes invalidate older results, while ordinary clock ticks allow a slow
valid result to paint before the follow-up. Closing or disposing a panel prevents
late rendering. A close event queued before a reopen does not invalidate that new
view. The list exposes `aria-busy` while a report is pending.

Worker startup, transport and calculation failure display an unavailable message
and clear old panel results. There is no page-thread summary fallback or automatic
worker restart. Stopping the panel drains the admitted worker request and releases
its connection. The report operation neither opens databases nor writes data or
calls a provider. Existing persistence, migration review and ledger formats are
unchanged.

All 913 frontend tests in 188 files passed, with TypeScript, production build,
formatting and diff checks. Seven new tests cover structured-clone summary parity,
capacity refusal, coalesced filters, closed/disposed panels, worker failure and
slow results across periodic refreshes, and delayed close events after reopening. Existing summary, burst, ledger, storage
and provider-receipt tests remain green.

Native Chromium exercised the actual built panel with 1,000 retained synthetic
messages, then excluded one of two chatters and reported the expected 500 messages.
A Window guard rejected `toLocaleDateString`, which the retained summary uses for
every included row; it recorded zero calls. Simulating the panel worker's failure
cleared old graph/list results and displayed the unavailable message. A direct
10,000-row request returned the expected scoped/excluded counts, repeated emotes
and link domains. The emitted worker was present in the shell cache. The final
rebuilt application was also checked after the slow-refresh repair. See the
[summary evidence](statistics-summary-worker-local-evidence-2026-10-18.json).

This moves retained-row computation only. Persistent StatsLedger observation,
reconciliation, ranks, buckets, pruning, snapshot construction and restore parsing
still run on the Window. DOM rendering, structured cloning, catalog transfer and
worker startup also have costs; the local checks do not establish an overall
latency improvement or satisfy the 15-minute busy-channel acceptance.

## Remaining stages and release boundary

1. Move statistics ledger aggregation and snapshot construction while preserving
   replay exclusions, scope keys and reviewed localStorage migration.
2. Move rate retained-window computation into the worker, preserving coverage
   gaps, replay exclusions and visible graph behavior.
3. Observe a 15-minute busy-channel session with the resource readout. Attribute
   storage work separately from rendering, worker startup and structured-clone
   costs before closing #137.

Stages one through six are deployed at `b95b7fb`; stages seven through nine are not
deployed.
Rolling source back leaves the original
database readable by the previous implementation. No schema reset or destructive
data conversion is part of rollback. Do not treat a worker crash as permission to
repeat an uncertain provider action.
