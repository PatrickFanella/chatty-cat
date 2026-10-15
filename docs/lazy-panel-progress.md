# Lazy panel conversion — first slice

Issue [#130](https://git.subcult.tv/subculture-collective/chatty-cat/issues/130)
remains open. This slice introduces the lifecycle and migrates **IRC conversations**
and **Chatterino import**. Other panels still construct eagerly. The application
has not reached the issue's startup-DOM or closed-panel timer acceptance gates.

## Contract and construction

`web/src/shell/panels.ts` defines a panel's stable id, title, group, root, open,
close and stop operations. `LazyPanels` registers the palette/menu command before
importing the feature. Its loader returns a factory: the manager checks view
availability, account context and cancellation after the import and before
constructing DOM. Concurrent opens share the in-flight load. A failed import can
be retried; stopping removes commands and listeners and prevents late factories
from running. An explicit user open takes priority over a superseded layout
restore, while closing a pending open invalidates that request.

The main entry imports these two modules dynamically. Their constructors no
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

## Continue the conversion

Keep #130 open while migrating the remaining panels in reviewed batches. Before
deferring each constructor, separate any startup responsibility that must remain:
saved-setting registration/validation, active extension runtimes, companion
bridges, context subscriptions, rules/completion state and metadata consumers.
Do not make those features depend on opening a settings panel.

The final main entry measures 348.97 kB gzip, compared with 356.44 kB before
this slice. IRC and import chunks measure 4.88 and 5.36 kB gzip respectively.
These are entry/chunk measurements, not a claim of lower total installed bytes
or measured heap/CPU savings. The manifest also precaches the optional diagnostic
chunk for offline use; the page still does not execute it until requested.

The next useful batch is the passive editor UI for completion/link preferences
and custom themes, after checking their settings/model initialization paths.
Measure startup DOM, loaded chunks and timer owners with the resource readout
for each batch. Leave picker/rate scheduling changes and the shared scheduler's
quantitative acceptance distinguishable from this lifecycle work.
