# Journal storage-pressure investigation — October 14, 2026

The signed-in production shared preview reports 4,467,424,915 bytes of origin usage,
including 4,447,628,206 bytes of Cache Storage and 19,793,831 bytes of IndexedDB.
Persistent storage is false. `chatthing-images-v1` contains 600 entries; sampled
responses are opaque (status 0, unreadable bodies). The shell has 17 entries and
fonts have four. Two confirmed journal receipts remain in account 69674313.
This profile is separate from the regular Vivaldi profile affected by #82.

The service worker cached opaque responses up to its 600-image bound. Chromium
adds significant quota padding to opaque responses, approximately 7 MiB each:
[Chrome DevTools documentation](https://developer.chrome.com/docs/devtools/progressive-web-apps).
The observed usage is consistent with that behavior. It is a reproducible storage
pressure defect, not proof that browser eviction caused the earlier receipt loss.

The correction returns opaque network responses without writing them to Cache
Storage. Activation prunes legacy opaque image/font entries; requests also discard
opaque legacy hits before fetching. Readable assets keep their existing bounds.
Only regenerable cached responses are removed. IndexedDB, private journal data,
account records, backups and provider outcomes are not modified or retried.
Offline opaque media are unavailable after pruning; normal browser/network caching
and online rendering remain available.

Two new regression checks fail before the correction and pass afterward: opaque
network responses are not persisted, and activation removes legacy opaque
image/font entries while preserving readable entries and other cache buckets.
All 777 frontend tests, strict checking, Go race tests and vet pass. One initial
full-suite run under concurrent Go compilation timed out in main-capacity; the
focused check and complete suite with four workers pass without changing that test.

Production cache reduction and unchanged receipt IDs require verification after
merge/deployment. #82 remains open: the original storage transition, lost receipts
and retention across the affected browser restart are still unresolved. Live
provider writes remain paused during this investigation.
