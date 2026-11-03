# Emote animation CPU/GPU qualification — November 3, 2026

This report covers the external CPU/GPU measurements that #136 still needed. The
earlier [implementation evidence](emote-animation.md) had covered geometry and
source counts only. Raw records are in
[the evidence JSON](emote-animation-qualification-2026-11-03.json), and the
harness is in [`scripts/emote-animation-bench`](../scripts/emote-animation-bench).

## Result

| Gate | Result |
| --- | --- |
| CPU drops when the tab is hidden | **Passed.** Hidden CPU is 11–16% of the live level in all 6 sessions. |
| GPU drops when the tab is hidden | **Passed.** Render-engine busy time falls from about 2.4% to at most 0.02%. |
| CPU drops when scrolled into history | **Passed.** Mean 31% lower than live in 6 of 6 sessions; the control build drops 16%. |
| GPU drops when scrolled into history | **Not shown.** GPU busy time did not fall consistently in either build. |
| No layout shift or lost reader position | **Passed.** In all 6 history phases, the scroll position and top row stayed fixed. |

Most of the hidden-tab saving comes from Chromium, not from this feature. A
hidden tab stops compositing whether or not the app pauses emotes. The control
build, with automatic pausing disabled, falls to the same level: 12.5% CPU and
about 0% GPU. With the feature on, hidden tabs keep no animated emotes playing; in
the control build, an average of 4.8 mounted images keep their animated source.

In history the feature makes a measurable CPU difference. Rows above and below
the viewport stop animating, which roughly doubles the history saving compared
with the control build. On GPU there is no clear effect. Chromium does not raster
offscreen rows anyway, so pausing them saves decoding on the CPU rather than GPU
work. The GPU time that remains comes from compositing the visible chat and from
animations in the viewport. Those keep playing by design.

The history GPU expectation in #136 therefore cannot be shown on this hardware,
and is probably not achievable by pausing offscreen images. On November 3 the
owner accepted the CPU result as completing the gate and waived the history GPU
expectation, as with #138's renderer-specific scope. #136 is closed on this basis.

## Measurements

Means over valid phases. CPU is a percentage of one logical CPU across the whole
Chromium process tree. GPU is i915 render-engine (`rcs0`) busy time.

| Build | Phase | n | CPU % | GPU % | msgs/s | Playing / still |
| --- | --- | --- | --- | --- | --- | --- |
| Feature | Live | 6 | 100.8 | 2.39 | 27.9 | 4.5 / 3.8 |
| Feature | History | 6 | 69.7 | 2.89 | 28.1 | 4.0 / 8.3 |
| Feature | Hidden | 6 | 13.4 | 0.01 | — | 0 / 12.8 |
| Control | Live | 5 | 101.3 | 2.27 | 27.7 | 4.6 / 6.2 |
| Control | History | 3 | 81.3 | 4.98 | 20.6 | 15.0 / 7.0 |
| Control | Hidden | 5 | 12.5 | 0.01 | — | 4.8 / 3.2 |

Each history and hidden phase was also compared with the live phase from the same
browser session:

| Build | History / live CPU ratio | Hidden / live CPU ratio |
| --- | --- | --- |
| Feature | 0.65, 0.68, 0.43, 0.84, 0.83, 0.69 (mean 0.69) | 0.14, 0.11, 0.12, 0.16, 0.12, 0.15 |
| Control | 0.80, 0.84, 0.87 (mean 0.84) | 0.18, 0.15, 0.13, 0.03, 0.13 |

The change in history GPU busy time compared with live ranged from −1.85 to +1.90
percentage points for the feature build, and from −1.90 to +10.89 for the control
build. These are within run-to-run noise.

## Environment and method

- **Host:** Dozor: Intel Core i5-4570S (4 logical CPUs), Intel HD Graphics 4600,
  Debian 13. Unrelated services kept the load average at about 2.
- **Browser:** Chromium 141.0.7390.37 at 1280×800, launched with
  `--headless=new --enable-gpu --ignore-gpu-blocklist --use-angle=gl-egl`.
  WebGL and `chrome://gpu` reported `ANGLE (Intel, Mesa Intel(R) HD Graphics
  4600 (HSW GT2), OpenGL ES 3.2)` with hardware-accelerated compositing and
  rasterization. The browser ran in the `render` group for its own process only.
  Mesa's EGL packages were installed for the measurement and removed afterwards.
- **App:** frontend from merged main `20b4b82` (`main-C17z3amt.js`), served by the
  local server on loopback with `CHATTHING_ENV_FILE=/dev/null`.
  The session read chat anonymously; nothing was sent.
- **Control:** the same source with `pauseEmoteAnimations` returning immediately
  and new images starting unpaused (`main-Dooi8y2Z.js`). It was built only for
  this measurement and is not committed.
- **Workload:** one workspace merging #hasanabi, #xqc, #zackrawrr, #kaicenat,
  #jynxzi and #caseoh_, at 14–34 messages per second.
- **Procedure:** each session warmed up for 45 seconds, then ran 30-second phases:
  live, history (scrolled to 40% of the log), and hidden (another tab activated in
  the same window, so `document.visibilityState` was naturally `hidden`). Two
  runs of three rounds alternated the order of the builds to spread traffic
  drift between them.
- **Why raw CDP:** the harness drives the browser over raw CDP. Playwright
  emulates focus, which keeps background tabs reporting `visible`.

Excluded phases: in three control sessions the history position did not hold and
the log returned to live; one of those sessions never loaded the log at all. The
evidence JSON lists them. The feature build held its history position on the
first attempt in five of six sessions.

## Limits

- **Message rate:** the rate varied between phases, and CPU tracks it closely.
  Same-session ratios reduce this effect but do not remove it.
- **Sample size:** the control build has only three valid history phases.
- **GPU counter:** the counter is global to the GPU. It read zero before the
  runs, but nothing isolates it from other clients.
- **Headless only:** this measures headless Chromium compositing to an offscreen
  surface on an older integrated GPU. A desktop browser, a discrete GPU, a
  minimised window or Chrome's background throttling were not tested.
- **Approximate counts:** "playing" and "still" are classified from the `src` URL
  and are approximate.

## Repeating it

Run the local server twice, once with the normal build and once with the control
build, using `CHATTHING_ASSETS` to choose the build and ports 18431 and 18432.
Then run:

```sh
sudo -u "$USER" -g render env HOME="$HOME" PROFILE=/tmp/bench-profile \
  node scripts/emote-animation-bench/bench.mjs <chrome> \
  hasanabi,xqc,zackrawrr,kaicenat,jynxzi,caseoh_ 3 out.jsonl
```

`pmu.py` reads the i915 PMU and needs `sudo` without a password.
`FEATURE_URL`, `CONTROL_URL`, `WARM` and `PHASE` override the defaults.
