# Continuous verification

The Gitea Verify workflow runs on pushes, pull requests and manual dispatch. Its two independent jobs run full Go race/vet checks and lockfile-installed Node 24 frontend formatting checks, tests and build. Browser companion syntax and packaging run with the frontend job. It does not deploy, merge or use provider credentials.

Checkout and toolchain actions are pinned to immutable commits. Go is selected from go.mod. Tests are fixture-based: their success is implementation evidence, not owner/provider acceptance. Frontend worker concurrency is capped at two to keep runner memory bounded.

Before an authorized merge, re-read the current PR head SHA, mergeability and hosted results for both jobs. Local passing commands do not substitute for a missing or pending hosted check. Required-context branch protection is a separate repository policy; this workflow does not change it.

## Frontend formatting

Run these commands from the repository root after `npm --prefix web ci`:

```sh
npm --prefix web run format
npm --prefix web run format:check
```

Prettier is pinned in the frontend lockfile, with a 120-column print width and
single quotes. The commands cover authored TypeScript and CSS under `web/src/`
and the frontend's TypeScript configuration modules. Embedded-language formatting
is disabled so template-string HTML and other literal content keep their bytes.
HTML files, generated emoji/resource catalogs, vendored assets, companion code
and Go code are outside this pass. Update generated catalogs through their
existing scripts rather than formatting their output.

The initial source-only formatting commit is listed in the root
`.git-blame-ignore-revs`. To trace a line through that commit, run:

```sh
git blame --ignore-revs-file .git-blame-ignore-revs -- web/src/main.ts
```

To use this behavior for future blame commands in your local checkout:

```sh
git config --local blame.ignoreRevsFile .git-blame-ignore-revs
```

The formatter setup and CI/documentation changes are separate commits and are not
ignored. Preserve the formatting commit's identity when merging this history; if
history is rewritten, update the ignore file to reference the retained commit.

## Resource baseline and budgets

Open the command palette with Ctrl+K / Command+K and select **Resource readout**.
It loads on demand outside overlay mode. Sampling begins when opened; Refresh
snapshot updates the JSON manually, Reset sample clears counters, and Stop and
close (or Escape) stops sampling and disconnects the long-task observer. Reopening
continues the sample; use Reset before each scenario. No diagnostic refresh timer
runs. The output stays in the page and contains counts, not message bodies,
account identities, tokens or exported history.

The timer list covers all application `setInterval` sites through explicit owner
labels. It lists registered repeating timers, including those whose callbacks
return without doing work. `fires`, `hiddenFires` and `callbackMs` count only while
sampling. Callback milliseconds cover synchronous work and include measurement
overhead; they exclude async work started by a callback. Timeouts, animation
frames, browser internals and socket callbacks are outside this timer inventory.
Do not interpret this number as every browser timer or total CPU use.

Mounted rows count virtual rows under the public chat root; rowCache reports its
bounded reuse cache, and retainedMessages reports the public in-memory store.
Long tasks are aggregate count, total and maximum duration during sampling,
including readout interaction and unrelated browser work on the page. They are
not attributed to a feature. Heap uses Chromium's optional, approximate
`performance.memory` values and may reflect shared browser allocations; other
browsers report unavailable. CPU and GPU always require external measurement.

For a deployed baseline, first verify the deployed image/source and loaded main
bundle match the intended commit. Record the browser/version, operating system,
hardware, viewport, profile, channel and observed message-rate range, retained
history count, visible panels, emote/freeze settings and all measurement tools.
Use a fresh isolated profile without OAuth for the public-chat baseline. Record
signed-in/provider/player cases separately rather than comparing different
active features as the same scenario.

1. Let startup and metadata hydration settle for 30 seconds. Open the readout and
   reset it. Observe a quiet channel for 60 seconds, then Refresh and save the
   JSON with the exact duration. Repeat on an observed busy channel; record its
   actual incoming rate rather than assuming a channel is busy by name.
2. Repeat each scenario with a real background tab for 60 seconds. Confirm
   `document.hidden`/visibility transitions and hiddenFires through the browser;
   merely hiding the preview panel or mocking visibility is not a hidden-tab
   measurement. Record the snapshot on return and distinguish the transition and
   refresh work from the steady sample. If the automation cannot background the
   tab, mark this scenario unmeasured.
3. Use the browser Task Manager or an attributable renderer-process measurement
   for CPU and resident memory over each interval. Record whether CPU uses one
   core or the whole machine as 100%. Heap is not resident memory. Use browser/OS
   GPU tools for animation comparisons; label unavailable counters explicitly.
4. Separately capture a performance trace during normal scrolling, history
   browsing and storage flushes. Investigate tasks over 50 ms by their trace
   stacks. An aggregate long-task count alone cannot establish storage or render
   attribution. The later storage-worker gate requires a 15-minute busy session.
5. Repeat with the same environment and settings after each performance slice.
   Store dated evidence under `docs/`, separating local, deployed and provider
   observations. No message bodies or private browser-profile exports are needed.

Targets remain near-zero main-thread activity when there are no incoming messages
or the tab is hidden, and no task over 50 ms during normal scrolling. #135 adds
the repeating-timer target of at most two while idle and none hidden; transport
retries remain separately visible. Numeric CPU/memory limits need comparable
baseline samples before adoption. #139 retains the main-entry target below
180 kB gzip, #138 the overlay payload well below one quarter of main, and #141
will enforce measured main/lazy/overlay budgets in CI. Until measured, these are
targets, not passing results. See the [first local baseline](resource-baseline-2026-10-15.md)
for its environment and remaining measurement limits.
