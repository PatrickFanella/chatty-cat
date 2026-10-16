# Reference data on demand

Issue #139 separates generated emoji metadata and curated resource tables from
JavaScript. Its main-entry target is below 180 kB gzip. The local production build
now measures 151.21 kB gzip, down from 203.76 kB at merged panel PR #155.

## Runtime behavior

Startup retains the 3,944 qualified Unicode emoji sequences and nine group names
as a compact index. Live message usage tracking, native emoji text and saved
category validation work before any metadata fetch. Names, subgroups, Unicode
versions, image asset names, tones and legacy search terms are in immutable JSON.
The picker loads this data when open with Emoji enabled. A saved image/label style
also requests it independently of the picker; messages use native text while it
loads, then repaint with the requested style. Invalid data cannot install partial
metadata or unsafe image paths.

Successful first reads are cached in memory. Concurrent consumers share one
request. Failed reads clear the pending request; the picker displays Retry while
keeping native emoji available. Closing/stopping the view does not cancel shared
runtime data or let late callbacks repaint a stopped editor. Help/resources loads
its four curated tables before constructing the view, retaining the built-in Help
tab, source attribution, safe links and author controls. A failed resource load
uses the existing panel load-failure announcement and retries on the next open.

`reference_data.py` emits content-addressed JSON and URL descriptors. The existing
Unicode/Twemoji generator and original-resource importer use it. Unicode source
SHA, all 3,944 entry names/groups/versions/tones and both output filename hashes
were verified locally. `docs/emoji-sources.json` and pinned source/license files
are unchanged. Original legacy keyword strings moved into the generator's input
JSON; they no longer execute in the app.

The worker precaches both JSON assets without decoding them in the page. Its
installed-manifest protection includes those paths, so trimming old build assets
cannot remove current reference data. Registration now specifies a module worker,
which is necessary because Rollup shares the small URL descriptors with the page.
The existing Update ready action still controls activation. Cache/privacy rules
for API responses and hosted uploads are unchanged.

## Local verification

All 839 frontend tests across 181 files, strict TypeScript/production build,
Prettier and diff checks pass. Existing emoji rendering/search/category/tone and
curated-resource tests load the same generated JSON fixtures. New tests cover no
fetch before use, coalescing, failure/retry, atomic validation, startup usage
tracking and repainting saved non-native styles after data arrives. Worker tests
cover precaching and offline retrieval of both JSON paths. Existing happy-dom
stylesheet-fetch teardown warnings remain.

Isolated Chromium 154 at 1280 x 800, anonymous local combined Go service:

- Closed-layout startup has no editor roots and no page request for either JSON.
- Opening Emotes loads only emoji data; searching `distorted face` finds the
  Unicode 17 emoji. Opening Help/resources then loads resource data and renders
  five tabs, 1,640 links and 106 author date entries.
- A synthetic rejected first emoji read displays Retry; retry restores search.
- The parent build's classic worker upgrades to the new module worker, waits for
  Update ready, then activates with both JSON assets cached before first use.
- With the local app server stopped, the upgraded cached shell reloads. First
  opening Emotes still resolves the search, and Resources shows its five tabs
  and 1,640 links. Each JSON fetch has zero network transfer; the service status
  reports disconnected. External networks were not disabled. This checks native
  emoji/picker data; existing bounded image-first-use caching remains separate.

## Measurements and limits

Both builds used the same local Go binary, fresh isolated browser storage,
`video=off&split=1` and the same anonymous public channel. The local server sends
uncompressed assets. The browser sample includes the same-origin document
resources and API responses; worker installation downloads are counted separately
by the complete precache asset inventory.

| Measurement | Merged #155 | This change |
| --- | ---: | ---: |
| Main gzip, Vite report | 203.76 kB | 151.21 kB |
| Initial JavaScript decoded bytes, including shared descriptors | 1,110,320 | 517,348 |
| Same-origin resource body bytes at startup, excluding navigation | 1,363,343 | 770,371 |
| Same-origin resource transfer bytes at startup, excluding navigation | 1,365,743 | 773,071 |
| Navigation body bytes | 5,509 | 5,595 |
| All precached build/data assets, raw bytes | 1,871,423 | 2,000,806 |
| Sum of separately gzipped build/data assets, Python gzip level 6 | 414,147 | 429,630 |

The full precache grows by 129,383 raw bytes (about 6.9%). Deferred JSON avoids
startup parsing of metadata, but retaining it offline costs more total installed
bytes. The gzip sum is a reproducible estimate using one local compression
implementation; it is not an observed compressed HTTP download. Identical static
icons are excluded from both precache inventories. Native emoji recognition
still parses its compact index at startup.

Single navigation timings are recorded in the machine-readable evidence, but are
not a startup-speed benchmark. JavaScript bytes parsed at startup decrease;
direct parsing duration, CPU/GPU and comparative heap remain unmeasured. The
large-main warning still appears because the uncompressed entry exceeds 500 kB.
No deployed, all-network-offline or authenticated-provider qualification is claimed.

[Browser evidence](reference-data-local-evidence-2026-10-15.json) retains request
sizes, exact bundle names, scope and limitations. Production deployment and hosted
CI remain separate from these local results.
