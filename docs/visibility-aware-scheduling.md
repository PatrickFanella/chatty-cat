# Visibility-aware scheduling

Issue #135 replaces independent application polling intervals with two shared
clock pools: UI and storage. The local readout reports at most two owned native
repeating intervals while visible and zero while hidden. Provider protocol
activity is reported separately as named one-shot deadlines.

## Ownership and cadence

`web/src/shell/clock.ts` owns a one-second tick per pool. Subscribers retain their
own cadence and an optional active predicate. The UI pool includes the one-second
rate/room/picker/discovery work, five-second statistics/cosmetic work, two-second
optional player-volume sampling, auth refresh and mirror refresh. Panels dispose
their task when closed or use their open/visible predicate. The clock allocates
no interval if a pool has no active subscriber, and removes its visibility
listener when the last task unsubscribes.

Storage retains its existing cadences: archive 3 seconds, observation coverage
10 seconds, message/picker state 15 seconds and stats/rates 30 seconds. On hide,
each storage owner receives one final flush and both native clock intervals stop.
On return, active owners refresh once, then resume their cadence. Delayed ticks
advance deadlines without replaying missed ticks. Existing pagehide/stop saves
remain in place. Async flush completion is not blocked by visibility changes.
Incoming data retains existing memory and backlog bounds while periodic writes
are paused; this does not qualify indefinite hidden capture.

The rate series still records incoming live observations independently of its
paint task. Graph rebuilding is skipped while hidden, detached or CSS-invisible;
the existing SVG graph and tooltip behavior remain. Rate persistence has its own
storage task rather than depending on 30 successful graph ticks. Room-state text
only mutates when its displayed labels change. Mirror refresh is inactive until a
matching link is observed. Auth refresh pauses while hidden and checks fresh
status when the page returns.

## Provider protocols

The 50 ms provider pump is removed. Socket open/message events enqueue a
microtask, and queued read subscriptions retain their 50 ms pacing through
one-shot send deadlines only until the queue drains. Opening/heartbeat expiry and
backpressure checks remain fail-closed; failure requires explicit Reconnect.
Cosmetic changes batch in a microtask, defer painting while hidden and prune on a
visible shared-clock task. Existing fresh configuration reads remain required
network work, separate from UI scheduling.

Reviewed activity retains the existing explicit Keep activity running behavior.
It uses a shared-clock check while visible and its next five-minute send deadline
while hidden, with fresh account/context checks before sending. Cancel/privacy/
account teardown clears both. This avoids a one-second hidden poll without
silently cancelling an authorized session or granting a new one.

The readout now separates native repeating intervals, logical scheduled tasks
with active state/callback samples, and tracked provider configuration/reconcile/
protocol/reviewed-activity deadlines. Other socket retries, SDK timers, timeouts
and asynchronous callback work remain outside this instrumentation. A zero owned
interval count is not a claim of zero network or browser activity.

## Local verification

All 847 frontend tests across 182 files pass. Strict TypeScript/production build,
Prettier and diff checks pass; existing happy-dom stylesheet-fetch teardown
warnings remain. New checks cover shared timer count/cadences, inactive views,
final hidden flush, no hidden callbacks, resume without catch-up, subscriber
cleanup/error isolation, graph suspension with retained observations, page
coverage persistence, protocol deadline reporting and cancellation, hidden
heartbeat expiry, and a reviewed hidden activity session's exact send deadline.
Existing picker/rate/provider review/privacy/account tests remain green.

Chromium 154 local combined Go service, anonymous public channel, 1280 x 800:

- Visible closed-layout startup has only `scheduler.ui` and `scheduler.storage`
  as owned repeating timers. Logical task owners/cadences remain visible.
- Emotes, Stats and Channels open/close through their commands. Their UI tasks
  disappear after closing; the native timer count remains two.
- A controlled browser visibility fixture overrides document visibility
  properties and dispatches visibilitychange. It immediately removes both
  intervals, records one final callback for each storage owner, and leaves all
  scheduled tasks inactive. A later hidden snapshot has no further task fires.
  Restoring native properties refreshes once per active owner and restarts the
  two intervals without catch-up work.
- This is a synthetic visibility-boundary check in a real browser. The preview
  does not provide native renderer backgrounding; natural background throttling
  is unqualified. No real provider session was started. Provider deadlines and
  private/account guards are covered by deterministic fixtures.

The final entry `main-viS6fz2P.js` is 152.48 kB gzip versus 151.21 kB for the
preceding data split. The increase includes scheduler/instrumentation code.
Finite timing samples are diagnostic, not CPU/GPU or comparative heap proof.
The large-main warning remains. No production deployment occurred.

[Machine-readable local evidence](visibility-aware-scheduling-local-evidence-2026-10-15.json)
records exact samples, fixture boundaries and limitations. #136 (offscreen/hidden
animated emotes) remains separate and follows this change.
