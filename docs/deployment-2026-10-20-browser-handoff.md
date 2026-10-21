# Browser companion handoff deployment, October 20, 2026

Production runs approved PR #193 source
`2cb8deacfb945beef2d31503fe758b199abd4055`, merged as
`62c30521c299965d17f4fb7efc8fe504201b88c4`. An empty Git diff reconfirmed
identical source trees. All four exact-head checks passed before merge. Main
run 16475 passed Go race/vet (30191) and frontend tests/build (30192) before
activation.

The clean Node 24.18.0 / Go 1.27.2 release passed strict compilation and all 56
bundle budgets. Independent extraction of its source archive rebuilt seven
identical selected artifacts: main and overlay HTML, main JS/CSS, companion
chunk, worker and overlay JS. Isolated staging verified readiness and packaged
hashes, including the companion chunk; all 4,042 manifest files were checked.

Guarded activation selected immutable image
`sha256:ed23e75bfba8ecd685cc6929d60d6f1d436d7056d074d4b837a0147430787be0`.
The container started at `2026-10-21T01:47:04.560529911Z`, became healthy and
reported zero restarts. Both retained server data files match the checkpoint.
Read-only rollback guards passed after activation. Recovery remains at
`/srv/apps/projects/chatty-cat/recovery/storage-2cb8dea-20261020`.

The checkpoint preserves the actual previous support-link release
`support-seo-1d368d6-20261020` and image
`sha256:8c24db1f99c68eeaa8542a2f037bdb87b495c5ee5fdf541e00550081354bf93b`.
The older compact-header checkpoint was not reused as the rollback target.

An ordinary reload of the public tab adopted `main-BZ-GPIf6.js`. Main JS, CSS,
`browser-companion-ui-CkYBNOS7.js`, storage worker, overlay JS and the actual
build-qualified source-download link returned 200 and matched the release
hashes. Public readiness returned 200. The Support SUBCULT link still points to
`https://subcult.tv/support`.

The actual signed-out login stayed within the viewport at 390×844 and 320×700:
document widths were 390 and 320, with button right edges 382 and 312 pixels.
The command palette opened the lazy Browser companion panel, which displayed
the new confirmed-navigation and version 0.1.2 instructions. No pairing or
provider write was attempted. The bounded reload/resize/panel checks captured
no runtime error or error banner.

Companion 0.1.2 and this web release are both required. The five-file ZIP matches
the approved source; its SHA-256 is
`c34613c1393b25cf5235e5111a7c0c5a34e513c5507fb811f8d90f4ec5146000`.
The owner already confirmed delivery and review with 0.1.1, whose confirmation
reload ended pairing. #36 remains open for the installed 0.1.2 repeated-send,
confirmed-navigation, workspace/focus and revocation checks. Synthetic browser
navigation evidence does not close those gates or the independent #136/#32/#38
acceptance requirements.

See the [machine-readable receipt](deployment-2026-10-20-browser-handoff-evidence.json)
and [companion protocol and test limits](browser-companion-demo.md).
