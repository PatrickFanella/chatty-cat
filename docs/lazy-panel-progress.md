# Lazy panel conversion

Issue [#130](https://git.subcult.tv/subculture-collective/chatty-cat/issues/130)
remains open. Seven panels now use the lifecycle: **IRC conversations**,
**Chatterino import**, **Completion**, **Link preferences**, **Custom themes**,
**Compare activity** and **Export logs**. Other panels still
construct eagerly. The application has not reached the issue's startup-DOM or
closed-panel timer acceptance gates. The sections below retain each slice's
local evidence rather than treating it as a new full resource qualification.

## Contract and construction

`web/src/shell/panels.ts` defines a panel's stable id, title, group, root, open,
close and stop operations. `LazyPanels` registers the palette/menu command before
importing the feature. Its loader returns a factory: the manager checks view
availability, account context and cancellation after the import and before
constructing DOM. Concurrent opens share the in-flight load. A failed import can
be retried; stopping removes commands and listeners and prevents late factories
from running. An explicit user open takes priority over a superseded layout
restore, while closing a pending open invalidates that request.

The first slice imports IRC and Chatterino import dynamically. Their constructors no
longer create header triggers; feature tests open them through their explicit
methods without the legacy header stub. IRC's auth-change cleanup remains wired
to its instance after first construction. Import review, credential exclusion,
recovery export and account/privacy invalidation keep their existing paths.
Opening/restoring IRC does not load configured networks, connect or send.

The production build emits `asset-manifest.json`. Service-worker installation
precaches its immutable same-origin chunks, including unopened panels, without
executing them. This preserves first-open offline availability after installation
completes; lazy loading reduces initial parsing/DOM construction, not the installed
app's total download. A failed chunk precache leaves the previous offline shell
in place. Manifest validation rejects external/private paths and traversal.

## Placement and compatibility

The workbench adopts each constructed root explicitly. Its layout notification
lets the manager load a saved open docked/floating panel at startup or during
portable settings restoration. Closed placements keep their slot but defer the
module and DOM until requested. Existing workbench chrome, docking, floating,
resize, closed-state persistence and panel-specific close cleanup remain in use.

The new stable IDs are `irc-relay-panel` and `chatterino-import-panel`. Older
versions assigned runtime-order `wb-panel-N` IDs to these previously anonymous
roots. Those IDs cannot be mapped reliably to a feature; this slice leaves the
old entries intact rather than guessing. Reopen/redock these two panels once to
save their named placement. Existing named placements for other panels are not
rewritten.

The legacy header mirror, patched `showModal` and body observer remain for the
unmigrated panels. They must be removed only after the full conversion. A browser
check exposed a related placement-menu defect: a menu appended to body became
inert behind its modal dialog. Menus anchored in an open dialog now stay inside
that dialog; the regression test verifies the active subtree and action dispatch.

## Local verification

All 811 tests across 177 frontend files, the strict production build and the
formatter check passed locally. The final main bundle is `main-cvovtGBb.js`. Lifecycle fixtures cover registration without construction, concurrent opens,
import failure/retry, account/privacy/page teardown during import, cancelled
restoration, explicit-close cancellation, user-open priority and real portable
workbench restoration. Existing IRC/import feature fixtures retain their review,
account-boundary and recovery checks. Worker fixtures verify serving an unopened
lazy chunk offline and retaining the old shell when a required chunk is missing.

The local combined service used an isolated Chromium 154 profile at 1280×800,
anonymous public chat and no OAuth/IRC configuration. Browser checks cover:

- Fresh startup: neither root exists and neither feature chunk is requested.
- Chatterino import command: only its chunk loads, with one workbench chrome bar.
- Dock import left, reload, close it and reload: open placement restores; closed
  placement does not load or construct the panel.
- IRC command and floating reload: its named placement restores, the closed
  import stays unloaded, and no `/api/irc` request occurs from opening/restoration.
- Overlay mode: neither migrated panel is registered/constructed or requested.
- After the updated worker installed and activated, its cache contained both
  unopened panel chunks. With the local application service stopped, the page
  reloaded from its shell cache and Chatterino import opened from the palette.
  IRC stayed unconstructed and the status reported the service disconnected.
  This tests application-origin unavailability, not every external network being
  offline or arbitrary browser-version compatibility.

These are local checks, not deployed acceptance or an approved IRC-network run.
No Twitch/IRC message, connection, workspace import or credential write is part
of the smoke check. Neither migrated panel owns a repeating interval, so this
slice does not claim the picker or idle-timer savings targeted later in #130/#135.

## Second slice — completion and link editors

The completion editor now loads through the shared lifecycle with stable ID
`completion-preferences-panel`. `restoreCompletionPreferences()` initializes
saved nicknames, completion policy and spellcheck without constructing an editor.
The main application owns preference/privacy change notifications and runtime
teardown. Invalid saved data falls back to defaults without overwriting its
stored bytes or retaining another account's aliases. The editor keeps its
review/apply, stale-write, account, quota and explicit chatter-read checks.
Closing or disposing it does not reset active completion policy.

Link preference parsing/storage remains in `link-preferences.ts`. The eager
`link-tools.ts` runtime restores saved policy, handles link clicks and reviewed
selection/resolution gestures, and updates policy listeners. The new lazy
`link-preferences-ui.ts` owns only editing, review and saving, with stable ID
`link-preferences-panel`. Selection review creates `link-search-panel` only when
requested, never at startup or merely when privacy/teardown clears it. Selection
text remains transient and is not restored from placement. Closing or disposing
the preference editor leaves click/search policy active.

These editors do not add header triggers. Like the first two anonymous panels,
their old runtime-order placements cannot be mapped reliably: reopen/redock once
to save their stable IDs. The shared legacy adapters still serve other panels.

Worker registration now includes the loaded app bundle path as a build query,
with root scope unchanged. A new bundle can change its lazy-chunk manifest while
`sw.js` is byte-identical; registration must still install those new chunks.
The existing Update ready action continues to control activation. Tests cover
distinct registration URLs and no automatic activation. In the local browser,
the old unversioned worker offered a waiting worker for `main-DJz3HlHx.js`;
Update ready activated it and both unopened editor chunks were present in cache.

Local production-build checks in an isolated Chromium profile used synthetic
account-local preferences, without OAuth or external search requests:

- Before opening either editor: saved spellcheck is active, a single pointer
  click is blocked by the saved double-click policy, both editor roots and the
  selection dialog are absent, and neither editor chunk is requested by the page.
- Completion opens with the saved synthetic nickname and spellcheck values;
  only its editor chunk loads. The link editor shows its saved policy, docks left
  and restores after reload while the closed completion editor remains absent.
- With both editors closed after reload, selection of local public fixture text
  creates its review dialog and encoded search link. No request is sent to the
  fixture search origin; the actual search link is not opened.
- Overlay mode does not construct or request either editor. Startup policy still
  belongs to the runtime, independent of editor construction.
- After activating the versioned worker, stopping the local application service
  and reloading the cached shell, both editors open from the palette with their
  saved fixture values. The status reports the service disconnected. This checks
  application-origin unavailability, not all external networks being offline.

The production main entry is 346.56 kB gzip versus 348.97 kB before this slice.
Completion and link editor chunks are 2.61 and 1.98 kB gzip. Their assets remain
in the installed-app precache; these figures do not establish total download,
heap or CPU savings. All 813 tests across 177 frontend files, the strict
production build and the formatter check passed locally. Existing happy-dom
stylesheet-fetch teardown warnings remain separate from the passing assertions.

The following slice separates the custom-theme runtime from its editor.

## Third slice — custom-theme editor

`CustomThemeRuntime` now owns initial saved-color application, the original
inline-palette baseline, account/storage guards and cross-tab storage updates.
It constructs no editor DOM. `CustomThemePanel` loads through the shared lifecycle
on first open or saved open placement, receiving that existing runtime. Its
stable `custom-theme-panel` ID is unchanged, so named placements remain usable.

Review, bounded native/Chatterino import, contrast reporting, explicit preview,
apply, built-in palette and export retain their existing actions. Closing or
stopping the editor clears temporary import/review/motion state and restores
saved colors. Only application teardown restores the original inline palette;
editor disposal leaves the runtime and its storage listener active. A stopped
runtime ignores late editor paints, covering application/editor teardown order.
Malformed remote data retains the last valid colors and blocks saving over the
bad bytes. Valid storage changes invalidate an editor review before another apply.

Local validation passed: 819 tests across 178 frontend files, strict production
build, formatter and diff checks. Fixtures cover startup colors without an
editor, valid/invalid remote changes and storage clearing, account boundaries,
stale/quota writes, privacy cleanup, preview reversion and silent teardown.
Existing happy-dom stylesheet-fetch teardown warnings remain.

Chromium 154 checks used an isolated anonymous local profile and synthetic colors:

- Saved colors apply before editor construction or a page request for its chunk.
- A simulated storage event updates applied colors with the editor still absent.
  Browser incognito tabs have separate storage here, so this is not a real
  shared-storage two-tab browser qualification.
- The palette opens the editor with saved data and one workbench chrome bar.
  Docking left and reloading restores it. Closing and reloading defers its root
  and chunk while the saved colors remain active.
- A temporary preview leaves storage unchanged; after the close event, saved
  colors return and import text is empty. Overlay mode keeps saved colors without
  constructing or requesting the editor.
- The installed worker cache contains the unopened editor chunk. After stopping
  the local application service, the cached shell reloads with saved colors and
  the palette opens the editor. Status reports the service disconnected. This
  tests application-origin unavailability, not every external network offline.

The final main entry is 345.33 kB gzip versus 346.56 kB before this slice; the
custom-theme editor chunk is 2.17 kB gzip. The runtime/parser remains available
at startup and the editor is precached. These figures do not establish total
download, CPU or heap savings. The large main-chunk warning remains. No production
deployment or full #130 resource acceptance is claimed.

## Fourth slice — retained-data tools

Compare activity and Export logs now register through the shared lifecycle with
their existing `comparison-panel` and `portable-logs` IDs and Chat command group.
Their constructors no longer insert header triggers. Existing named placements
remain usable. The archive's Export retained history action opens the same lazy
portable-log registration, including when it has never been constructed.

Rate timelines, stream history, archive collection and archive retention enforcement
remain owned by their existing application services. The factories pass these
live owners and the current account to each new panel; later account changes
still invalidate constructed panels. The lifecycle now owns disposal. Neither
panel owns an interval or settings-bundle registration.

Comparison opening resets its local controls without scanning retained data;
explicit Compare starts the scan. Export logs opening retains its existing
read-only retention/capacity preview. It does not prepare a log or apply retention.
Log preparation, recovery pagination, redaction, export review and retention apply
retain their existing explicit actions. Close/privacy/account changes invalidate
pending work and clear graphs, prepared output and downloadable previews.

All 821 frontend tests across 178 files, strict production build, formatter and
diff checks passed locally. New checks verify no constructor reads, no comparison
scan on open, retention-preview-only opening and late scan suppression after close.
Existing aggregate export, public-log redaction, quota/window/review and
account/privacy cases remain. Happy-dom stylesheet-fetch teardown warnings remain.

Isolated anonymous Chromium 154 browser checks cover:

- Fresh startup has neither root or feature chunk request. Opening Compare loads
  only its chunk, with one workbench chrome bar. Explicit comparison renders its
  two graphs; this is a smoke check, not numerical/provider qualification.
- Right-docked comparison restores after reload while Export logs stays unloaded.
- The archive's Export retained history shortcut loads Export logs on first use,
  closes archive search and shows capacity metadata with empty output and disabled
  download. No retention apply or file download is performed.
- Closing/reloading leaves both roots and chunk requests absent. Overlay mode
  also constructs/requests neither panel.
- Both unopened chunks are present in the installed worker cache. With the local
  app service stopped, the cached shell reloads and both panels open separately
  from the palette, including the local capacity preview. Status reports the
  service disconnected. This checks app-origin unavailability, not every external
  network offline or a full exported recovery operation.

Main entry is 338.04 kB gzip versus 345.33 kB before this slice. Comparison and
portable-log chunks are 5.60 and 4.03 kB gzip. All remain precached; no total
installed-download, CPU or heap reduction is established. The large main-chunk
warning remains. #130 stays open for remaining panels and its full acceptance.

## Continue the conversion

Keep #130 open while migrating the remaining panels in reviewed batches. Before
deferring each constructor, separate any startup responsibility that must remain:
saved-setting registration/validation, active extension runtimes, companion
bridges, context subscriptions, rules/completion state and metadata consumers.
Do not make those features depend on opening a settings panel.

The first-slice main entry measured 348.97 kB gzip, compared with 356.44 kB
before that slice. IRC and import chunks measured 4.88 and 5.36 kB gzip respectively.
These are entry/chunk measurements, not a claim of lower total installed bytes
or measured heap/CPU savings. The manifest also precaches the optional diagnostic
chunk for offline use; the page still does not execute it until requested.

Continue with other passive editors after checking their settings/model
initialization paths and consumers outside their dialogs.
Measure startup DOM, loaded chunks and timer owners with the resource readout
for each batch. Leave picker/rate scheduling changes and the shared scheduler's
quantitative acceptance distinguishable from this lifecycle work.
