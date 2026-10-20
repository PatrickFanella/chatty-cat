# October 19 layout-scroll repair deployment

Merged main `1f64fb9792dd08462abc722f48bb930bb7981ebe`, through #180,
is deployed at https://chat.subcult.tv. Both merged-main checks passed before
activation. This includes the content-height guard for layout-clamped scrolls
and explicit user-input handling, in addition to #179's delayed-reader repair.

NUC selects `releases/chatty-cat-1f64fb9-20261019`, with immutable image
`sha256:d5ec9332c63d5f70f3cc1a11bb32e1bfecab1587f055a53b4f47641543948c91`.
All 4,041 manifest hashes matched. Staging passed readiness and selected packaged
hashes, then its temporary container was removed. Rebuilding the public source
archive reproduced five selected HTML/main/worker/overlay hashes.

Guarded activation passed. Production is healthy with zero restarts and readiness
200. Both retained data files match the pre-activation backup. Compose/environment
guards passed. The preceding image and data backup remain available for rollback.

The public main bundle is `assets/main-CHPFZrq4.js`, and its matching service
worker is active. Browser-fetched HTML, main, worker, overlay and source hashes
match the release manifest. An existing tab loaded the prior bundle before
deployment and adopted this one on ordinary reload; a fresh tab also loaded it.
No Update ready button transition is claimed.

Both public popouts stayed current through desktop/narrow/desktop layouts:
1280/600/1280 pixels for the reloaded tab and 1280/390/1280 for the fresh tab.
Each recorded 60 half-second samples. The maximum absolute live gap was 0.5
pixels; Latest messages remained hidden, and every sample had no visible runtime
error banner. No error events were captured after listeners attached. Messages
continued arriving during both observations. This passes the bounded check that
failed after the preceding deployment, without qualifying every startup, saved
workspace, observer or provider path.

Root-only guarded recovery is:

```sh
sudo python3 /srv/apps/projects/chatty-cat/recovery/storage-1f64fb9-20261019/deploy.py check
```

That read-only check passed. `rollback` restores the preceding `2cb440e` package
while retaining current data; rollback was not exercised. Authenticated provider
writes, reboot, disconnected offline behavior and #137's 15-minute performance
gate remain separate. See the [raw receipt](deployment-2026-10-19-layout-evidence.json).
