# October 19 deployment

Merged main `bd2e2bf3957b14693f7383762aa1edf63fd7ef0b`, through PR #173, is
deployed at https://chat.subcult.tv. Both merged-main hosted checks passed before
activation. This includes the completed Wave 5 worker/overlay implementation and
new resource attribution counters. #137's performance acceptance remains open.
The floating-panel ResizeObserver repair prepared afterward is not included.

The final selector is `releases/chatty-cat-bd2e2bf-source2-20261019` under
`/srv/apps/projects/chatty-cat` on NUC. Its immutable image is
`sha256:95d8e88271900f9dabb245adbee959387e7049bbacb8036d10f7ade282f5081d`.
The application binary and frontend come from a clean checkout of the merged
commit. The release builder passed strict TypeScript and production compilation;
all 4,041 transferred manifest hashes matched in staging. Packaged binary, main,
worker, HTML and source hashes matched, and the isolated staging container was
removed after verification.

## Complete source package

The merged builder omitted `web/overlay.html`, `web/test-support` and `companion`
from the public source archive. The first missing input was caught before the
initial activation; an independent source rebuild then exposed the missing test
shim/companion imports. A second immutable package adds these exact tracked
inputs from the same clean commit. Its corrected source archive passes strict
TypeScript and independently reproduces the deployed main, worker, overlay and
HTML hashes. The manifest records this packaging supplement; application code
is unchanged. The repository builder correction is submitted with the resize
repair to prevent the omission in later releases.

The first October 19 package was briefly active and is retained as the immediate
rollback target; the final source-complete package replaces it. The previous
application release `b95b7fb` and its image also remain available. No existing
release directory or image was overwritten to apply the source correction.

## Runtime and rollback

Activation preserved Compose configuration, private environment bytes, data
binds and resource/security limits. The running container is healthy with zero
restarts; readiness is 200, and both retained data files match the guarded
pre-deployment backup. The public browser loaded `assets/main-DCCp2Ngi.js`,
connected to anonymous chat and activated the corresponding bundle-specific
service worker. Its cache contains `storage-worker-Lb5EFQx7.js`. Legacy overlay
URLs redirect to the dedicated entry with their query parameters retained.
Browser-fetched main, worker, overlay, HTML and public source hashes match the
release manifest. A generic Python HTTP client received an edge 403; browser
responses were verified separately and that client result is not an app failure.

The final root-only recovery directory is
`recovery/storage-bd2e2bf-source2-20261019`. Read-only guards pass:

```sh
sudo python3 /srv/apps/projects/chatty-cat/recovery/storage-bd2e2bf-source2-20261019/deploy.py check
```

Its `rollback` restores the first October 19 package and preserves current data.
After that guarded rollback, `recovery/storage-bd2e2bf-20261019/deploy.py rollback`
can restore the retained October 16 application release. Both operations verify
current image/link/configuration identity before mutation. Neither rollback was
needed or exercised. Backend replacements end in-memory OAuth sessions. Reboot,
authenticated provider writes, natural service-worker upgrade prompts, disconnected
offline operation and broader CPU/GPU qualification were not exercised.

Exact public hashes and runtime boundaries are in the [JSON receipt](deployment-2026-10-19-evidence.json).
