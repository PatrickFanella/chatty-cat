# Public statistics storage and reviewed recovery

The installed #36 browser companion paired, delivered central_committee and
focused its paired production tab on October 14. Its explicit workspace-change
confirmation then failed: `Could not save workspaces; free browser storage and
retry`. The original workspace remained unchanged.

Read-only developer inspection in that Vivaldi origin found a legacy public
statistics snapshot `chatthing:v1:stats:counts:hasanabi,zackrawrr` using 7,441,286
UTF-16 key/value bytes. Other public statistics and retained history also occupy
localStorage. A stream-history save warning was visible. These observations
identify a localStorage capacity failure; they do not establish the original
private IndexedDB journal loss in #82. Neither history nor counts were cleared.

## Supported persistence

Public statistics snapshots now use `chatthing-statistics` IndexedDB, keyed by
validated channel groups. Legacy localStorage values remain a read fallback.
Loading persisted counts finishes before queued bootstrap/live observations are
processed, retaining saved deduplication IDs and avoiding replay recounting.
Writes from one ledger are ordered; failures set the existing storage warning.
If IndexedDB is unavailable, the original localStorage path remains with its
existing failure reporting. Snapshots retain their current six-million-character,
20,000-key, 200,000-bucket and 100,000-replay-ID limits. Delayed initialization is
bounded to 100,000 queued operations; capacity omissions remain labelled.

## Reviewed move

In **Stats → Public statistics storage**, choose **Review move statistics
storage**. It inventories only the public `chatthing:v1:stats:counts:` namespace,
with validated channel-group keys, at most 64 scopes and six million total
key/value characters. It reports scopes and UTF-16 size. Review alone makes no
storage mutation. **Download reviewed statistics backup** optionally saves the
exact reviewed records as a local recovery JSON; it contains public observation
counts/IDs, never account credentials, whispers, notes or journal receipts.

**Move reviewed statistics to IndexedDB** separately confirms the operation.
Every original receives a new immutable recovery copy in the `backups` store.
A missing current snapshot is initialized; an existing newer snapshot is retained.
The copy transaction commits and a separate transaction reads every exact recovery
copy back before any old localStorage slot is released. A source changed since
review is refused or retained. Storage refusal/abort or failed verification keeps
originals. No unrelated namespace or private IndexedDB store is altered.

Statistics remain readable from IndexedDB after the move; exact legacy copies
remain recoverable in its backups store and any separately downloaded JSON.
Reload the affected view before retrying a failed workspace change so it reads
current storage. Origin-wide browser clearing can remove both snapshots and
IndexedDB copies, so keep the optional downloaded backup for recovery outside the
browser. The migration does not guarantee browser persistence or restore the
previously missing private journal records.

## Verification

Before the persistence correction, the regression for saving while localStorage
refuses writes fails. Afterward, reload retains the count and does not recount
replayed messages. Tests cover delayed deduplication loading, write refusal with
legacy retention, exact copied records, newer destination preservation, stale
sources, transaction abort without removal and separate review/confirmation.

The native shared-browser fixture at `/test-support/statistics-storage.html`
reviewed and moved two synthetic scopes, restored Alice's exact count of three
without recounting its saved message, and retained an unrelated history canary.
No Twitch request was made. Full validation passes 785 frontend tests and strict
build. Actual affected-profile migration and the blocked installed-extension
workspace flow still require deployed acceptance; #36 and #82 remain open at
this checkpoint.
