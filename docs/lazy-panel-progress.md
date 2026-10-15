# Lazy panel conversion

Issue [#130](https://git.subcult.tv/subculture-collective/chatty-cat/issues/130)
remains open. Four editors now use the lifecycle: **IRC conversations**,
**Chatterino import**, **Completion** and **Link preferences**. Other panels still
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

Custom themes remain eager because their constructor applies saved colors and
subscribes to cross-tab updates. Its runtime/editor split is the next batch;
defer only the editor after preserving those startup responsibilities.

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

The next useful batch is the custom-theme runtime/editor split, followed by
other passive editors after checking their settings/model initialization paths.
Measure startup DOM, loaded chunks and timer owners with the resource readout
for each batch. Leave picker/rate scheduling changes and the shared scheduler's
quantitative acceptance distinguishable from this lifecycle work.
