# First resource baseline — October 15, 2026

This is a bounded local browser baseline for #134, not a deployed resource
qualification or proof that the performance budgets pass. Instrumented source is
`2506fe5ac76163f9565c5121cb321a553cfbbbb9`, based on merged main `5cb8b24`.
The loaded bundle was `main-CN2cx7Io.js`; the optional readout was
`resource-readout-JZOhGAJq.js`. Source and evidence are in the same PR. A subsequent keyboard-only fix makes
Escape close the readout explicitly; it does not change the sampler. Compare
future workload changes against fresh samples with their exact source recorded.

## Environment and method

Kvant: AMD Ryzen 9 9900X, 24 logical CPUs, Linux 7.2.5-4-omarchy. The collaborative
Chromium browser reported Chrome 154.0.0.0 on Linux and a 1280×800 viewport. The
local combined Go/frontend service listened on loopback port 4181, with
`CHATTHING_ENV_FILE=/dev/null`; no OAuth credentials, sync/upload store or IRC
network was configured for this service. Go 1.27.2 built the local service.

An isolated incognito profile used default Nightshade settings, Roobert and the
default rail layout. The emote picker was docked/open (`hidden=false`), not a
closed-picker scenario. Both channels reported connected. The readout was opened
through Ctrl+K → Resource readout after startup. Sampling used the real
PerformanceObserver and actual registered intervals, with manual snapshot
refreshes and no diagnostic polling. No messages were sent.

The busy #hasanabi sample ran first. A second quiet #patrick__eff tab was opened
during its later portion; the busy sample therefore includes some concurrent
browser work. The busy tab was closed before resetting and recording the quiet
sample. Shared/approximate heap readings and different incoming traffic prevent
interpreting the two runs as an isolated performance comparison.

Raw counts, timing and heap fields are retained in
[the baseline JSON](resource-baseline-2026-10-15.json). They contain no chat bodies.
The [measurement procedure](continuous-verification.md#resource-baseline-and-budgets)
defines the longer deployed/hidden/CPU/scrolling follow-up.

## Results

Busy #hasanabi: 65.02 seconds, 11 repeating timers, 38 mounted rows, 609 cached rows and 1101 retained public records. Long tasks: 65, totalling 7732 ms, maximum 139 ms. Picker refresh: 65 callbacks, 7747.3 ms synchronous work. Reported heap used: 60.3 MB (decimal). The last 60 rolling timeline samples ranged from 5.8 to 16.0 messages/second; these rolling samples overlap.

Quiet #patrick__eff: 75.50 seconds, 11 repeating timers, 0 mounted rows, 0 cached rows and 1 retained public records. Long tasks: 2, totalling 199 ms, maximum 103 ms. Picker refresh: 75 callbacks, 209.8 ms synchronous work. Reported heap used: 60.3 MB (decimal). The timeline showed 0.0 messages/second and the retained count stayed at one protocol record, with no mounted chat rows.

Eleven repeating timers were registered in each run: auth.refresh,
discovery.paint, links.mirror, picker.refresh, rate.timeline, room.paint,
stats.paint, storage.archive, storage.coverage, storage.messages and storage.picker.
The optional provider pump/activity and player-volume timers were inactive.
Fourteen creation sites exist in source; active count depends on the session.

The busy picker callback averaged about 119 ms per firing. Its synchronous
callback duration closely tracks the observed long-task time, making it a useful
trace target for #130/#135. Aggregate long-task data does not attribute an entry
to a callback, and this sample does not prove the cause. No scheduling or picker
optimization was applied in #134. The future two-timer idle target is not met.

## Verification and limits

Before command selection, the readout chunk was absent from the loaded resource
entries. The command loaded it, the dialog displayed the snapshot, and close/reset
behavior passed focused tests. An overlay-mode navigation had no shell/readout
DOM and no request for the readout chunk. The final build and browser smoke
checks repeat this exclusion and the explicit Escape handler. All 800 frontend tests, strict TypeScript checks, production build and
formatter check passed. The local Go service built successfully. Existing
happy-dom stylesheet-fetch teardown warnings remain in the passing suite.

Both samples had `document.hidden=false` and zero visibility changes. Opening
another collaborative tab did not hide the first document; actual hidden-tab
behavior remains unmeasured. Unit fixtures cover hidden callback counting but
are not a substitute. CPU, renderer resident memory and GPU measurements were
unavailable through this browser tool; heap is approximate and is not RSS.

There is no deployed run, authenticated/provider/player case, normal-scrolling
trace, long-task attribution, 15-minute storage session or leak/stability test
here. This establishes a first local baseline and the measurement tooling. It
does not establish near-zero idle CPU, hidden-tab savings, a 50 ms scrolling gate
or full resource qualification. Repeat the documented scenarios on the intended
deployment before comparing later optimization claims.
