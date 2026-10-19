# October 19 live-follow repair deployment

Merged main `4a97004d787e2a0908f67ce573a376f30d851bbc`, through PR #175,
is deployed at https://chat.subcult.tv. Both merged-main checks passed before
activation. This release includes the earlier floating-panel repair and the
virtual-log observer/scroll-event changes.

NUC selects `releases/chatty-cat-4a97004-20261019`, with immutable image
`sha256:8b02849126f2d00f48d71f6162d7697412ad6047d9f056d0b2c44026c01d1b5c`.
All 4,041 manifest hashes matched. Isolated staging passed readiness and selected
binary/HTML/main/worker/source checks. The source archive rebuilt successfully
and reproduced the selected HTML, main, worker and overlay hashes.

Guarded activation passed. Production is healthy, has zero restarts and returns
readiness 200. Both retained data files match the pre-activation backup. Compose
and environment guards passed. The previous image and data backup remain available;
rollback was not exercised.

The public browser loaded `assets/main-B8zWGMlH.js` and activated its matching
bundle-specific service worker. Browser-fetched main, worker, overlay, HTML and
source hashes match the release manifest. Existing tabs still need the normal
Update ready / Reload transition to adopt the release.

The runtime scroll result is mixed. The first observation started at the live
edge, then showed a growing gap during the narrow-layout check: the final gap
was 3,974 pixels and Latest messages was visible. No browser error was captured
after the error listener attached. This does not isolate resize from startup
history or saved-reader restoration; an older tab shared the disposable profile.
After selecting Latest messages, repeated 1280-, 600- and 390-pixel layouts
remained current. The later 30-sample record has one 7.5-pixel transient gap;
all remaining samples are within 0.5 pixels of the edge. These later results do
not cancel the initial failure or establish that the user's scroll problem is fixed.

A fresh popout bypassing saved workspace readers then stayed current for 51
half-second samples after narrowing from 1280 to 600 pixels. Two samples showed
transient 7- and 11-pixel gaps; the next samples returned to zero. It captured no
browser errors. This narrows the follow-up to startup/restoration or an
intermittent layout path, without proving a cause. Follow-up is tracked in
[#177](https://git.subcult.tv/subculture-collective/chatty-cat/issues/177).

Root-only guarded recovery is:

```sh
sudo python3 /srv/apps/projects/chatty-cat/recovery/storage-4a97004-20261019/deploy.py check
```

That read-only check passed. Its `rollback` restores the preceding `e2ec4e7`
image/package while retaining current data. Authenticated provider writes,
reboot, disconnected offline behavior and #137's 15-minute performance gate
remain separate. See the [raw receipt](deployment-2026-10-19-live-follow-evidence.json).
