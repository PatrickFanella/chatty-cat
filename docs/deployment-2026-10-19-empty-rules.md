# Empty-rule rendering deployment, October 19, 2026

Production runs release source `c6f91f6aa3e25c8f56c307840d1df73892f24334`,
the approved head of PR #187. The PR merged as
`e4c65ee83f8ab745da025f80339c635636656512`. Both commits have tree
`4b2fa1d60296f6b21494b4cd1ea115cee0b109f5`; an empty Git diff confirmed that
the staged candidate contains the merged source. Their commit identities differ.
All four exact-head checks and both merged-main checks passed before activation.

The clean Node 24.18.0 build passed all 56 bundle budgets. Main uses 150,722 gzip
bytes, versus 27,127 for overlay. Independent extraction of its packaged source
rebuilt identical entry HTML, main, overlay and worker assets. Guarded loopback
staging passed readiness and packaged checks across 4,042 release files.

Activation selected immutable image
`sha256:0a1c9309ce982ccfb7d9ca5c75bae0e360be32092997f265c57d8a1f87ecf67e`.
The container became healthy with zero restarts. Its two retained data files
matched the pre-activation backup. Read-only rollback guards passed afterward;
the previous image and checkpoint remain under
`/srv/apps/projects/chatty-cat/recovery/storage-c6f91f6-20261019`.

An ordinary reload of the existing public tab adopted `main-CoeP5bWV.js`.
Readiness returned 200; browser-fetched main, worker, overlay and the actual
build-qualified source-download link matched the release hashes. The shell and
lazy resource readout opened, with no captured runtime error or error banner.
The resource panel stayed inside the viewport at 600×800, 390×844 and 1280×800.
At 390 pixels the header account button extended the page to 396 pixels. That
small horizontal overflow remains a follow-up defect; this check does not claim
that every compact layout fits.

The separate local busy smoke check retained 100,000 synthetic messages at 100
messages/second. All 80 samples across those widths kept the Latest control
hidden and captured no errors. Scroll gaps reached 75 pixels during pending
render/measurement work. This is bounded follow-state evidence, not a zero-lag
or external CPU/GPU result. The earlier paired performance samples and remaining
long renders are recorded in [empty-rule rendering](empty-rule-rendering.md).

See the [machine-readable receipt](deployment-2026-10-19-empty-rules-evidence.json).
