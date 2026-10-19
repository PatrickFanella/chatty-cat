# October 19 delayed-reader repair deployment and layout follow-up

Merged main `2cb440e01df13317c59403cbdbe5e94d120de1f4`, through #179,
is deployed at https://chat.subcult.tv. Both merged-main checks passed before
activation. This fixes a pending saved reader overriding an explicit jump to live.

NUC selects `releases/chatty-cat-2cb440e-20261019`, with immutable image
`sha256:8a8718fe8b0de0cfd111b892da72e34c715a870a771a2b7afee7097fe8b68ebb`.
All 4,041 manifest hashes matched. Isolated staging passed readiness and selected
packaged hashes; the source archive rebuilt and reproduced five selected HTML,
main, worker and overlay hashes. Guarded activation passed. The container is
healthy, with zero restarts and readiness 200. Both retained data files match
the pre-activation backup, and Compose/environment guards pass.

The public main bundle is `assets/main-B7OoFs5M.js`. Browser-fetched HTML, main,
worker, overlay and source hashes match the release manifest. The active service
worker matches the new bundle. An existing tab loaded the previous main before
deployment and adopted the new main on ordinary reload. Update ready was not
offered in this test, so no update-button transition is claimed.

The reload check still lost live follow: a popout that bypasses saved workspace
readers ended 14,750 pixels behind, with Latest messages visible and no visible
runtime-error banner. Selecting Latest messages resumed it. The subsequent 122
one-second samples all kept follow intent, with a maximum transient gap of 171
pixels and no captured browser errors. These results do not qualify startup or
establish that the reported scroll problem is fully fixed.

## Local layout follow-up

A separate controlled fixture shows another way to lose live intent. After a
programmatic live-edge write, content can shrink enough for Chromium to clamp
scrollTop, then grow before the queued scroll event is delivered. Comparing only
the old written offset treats that event as a user scroll. In the real-app local
fixture, an 800-pixel shrink followed by growth to 100 pixels above the original
height left a 738-pixel gap and paused the log. This is a model of layout changes,
not a trace proving that exact sequence caused the production observation.

The local repair records content height alongside the written offset. A changed
height preserves live intent until the next paint settles it. Wheel, touch,
pointer-down and navigation-key input clear that guard, so deliberate scrolling
can pause immediately even during a simultaneous layout change. The same fixture
returns to zero gap with Latest messages hidden. No error events are suppressed.

The regression fails before the repair and passes afterward. Four input controls
verify manual pause during concurrent height changes; the parent-column test also
checks manual movement after layout settles. All 942 frontend tests in 191 files,
strict production compilation, overlay bundle check and formatting pass locally.
The layout follow-up is not included in the deployed image above.

To reproduce, run Vite on a dedicated disposable origin, open
`/test-support/reader-restore.html?mode=fresh`, wait for
`__readerRestore.ready`, release history with `__readerRestore.releaseHistory()`,
then call `__readerRestore.clampLayout()` after hydration. Read
`__readerRestore.read()` after the queued scroll/paint work settles. The fixture
clears its origin's localStorage and uses synthetic API/socket responses.

Root-only guarded recovery is:

```sh
sudo python3 /srv/apps/projects/chatty-cat/recovery/storage-2cb440e-20261019/deploy.py check
```

Its read-only guard passed. `rollback` restores the preceding `4a97004` package
while retaining current data; rollback was not exercised. Authenticated provider
writes, reboot, disconnected offline behavior and #137's 15-minute performance
gate remain separate. See the [raw receipt](deployment-2026-10-19-reader-evidence.json).
