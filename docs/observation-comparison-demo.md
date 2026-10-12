# Observation-comparison browser demo

Use a fresh browser profile on the fixture origin. The seed page replaces that
origin's public archive, rate snapshot and stream history with synthetic data.
It supplies no actual Twitch chat connection or live broadcast acceptance.

From the repository root:

```sh
npm --prefix web ci
npm --prefix web run build
python3 web/test-support/comparison-browser-fixture.py
```

Open `http://127.0.0.1:5194/fixture/seed`, then Seed and open comparison demo.
The page seeds native IndexedDB with two channel rate snapshots and a public
raid notice, local viewer/title observations, and a synthetic known VOD range.
It then opens chat with a paused reader anchor.

1. Choose Compare activity. Both fixture channels start selected. Compare
   selected channels produces aligned rate and viewer plots with different
   unit scales. Channel one has 596 admitted rate seconds from its 600-second
   observation; channel two has 532 because of a 60-second gap and the two
   four-second rolling-rate boundaries. Later disconnected time is unknown.
   Missing viewer polls stay missing; one actual viewer poll has value zero.
2. Marks include receipt-time spikes, two observed title changes and a retained
   raid notice with provider timestamp. Hover a mark or data dot for its UTC
   source information. Nearby retained chat on the raid opens that exact
   retained notice. VOD context offers the fixture's matching known range;
   opening that preview preserves the main reader's current identity/offset.
   Verification/loading uses the #18 flow; actual Twitch playback is separate.
3. Reopen Compare activity. Choose Last 24 hours, wait a few seconds, then
   Compare. The chosen window stays fixed. Older unretained parts appear as
   gaps, with no zero inferred from absent records. Each channel has at most
   240 points per metric. Windows may end in the past; data outside retention
   remains missing.
4. Choose Preview aggregate export. Review the sandboxed table, coverage and
   public event annotations, then Download reviewed comparison. The HTML is
   standalone and contains no scripts, frames, images, external styles or
   private account fields. Fixture sentinels `fixture_sender`,
   `sentinel_token`, `sentinel_private_note` and the raw sentinel chat body
   must be absent. Change a channel/time input: results/preview clear and
   Download becomes disabled until a new comparison is reviewed.
5. Account changes and privacy clear the current result and cancel pending
   scans. Close comparison before using the page's privacy button, or use
   the application's panic shortcut while the app document has focus.
   Automated UI tests also dispatch privacy activation during an open preview
   and resolve a pending scan after an account switch; neither may restore
   the prior graph/export.

Stop the server with Ctrl+C. Rate coverage is saved with its aggregate snapshot;
reopening the same workspace restores completed observation intervals while
closed/disconnected time stays missing. A legacy snapshot without per-channel
coverage must remain unknown even if it contains message counts. The fixture
and regression tests verify replay exclusion, duplicate raid handling,
source changes, timer gaps, archive cancellation, poll failures, bounds and
escaped annotations. No provider writes or deployment are part of this demo.
