# Compact header deployment, October 19, 2026

Production runs release source `f0f84e89eeb2389fea060113e43d3710fe757734`,
the approved head of PR #189. It merged into main as
`dccc9cd12b7df0e9e48bbb5bb8234131aa183a5a`; an empty Git diff confirmed
identical source trees before activation. PR #188 merged first as `1ad3d69`.
Both PR heads passed four hosted checks. Main run 16091 passed Go race/vet
(job 29541) and frontend tests/build (job 29542) before activation.

The staged release passed readiness and manifest verification across 4,042
files, including its changed CSS inside the image. Independent extraction and
rebuilding of its source archive reproduced the selected entry HTML, main JS,
main CSS, worker and overlay artifacts. The existing compact-header report
records the local visual matrix, keyboard check and focused tests.

Guarded activation selected immutable image
`sha256:aff5b8236795948716fcb44614439e170a417f07dec5f5a0600d5e3099569db7`.
The container started at `2026-10-20T04:27:47.717465841Z`, became healthy, and
reported zero restarts. Both retained server data files matched the checkpoint.
Post-activation rollback guards passed. Recovery material and the previous image
remain under `/srv/apps/projects/chatty-cat/recovery/storage-f0f84e8-20261019`;
the previous image is
`sha256:0a1c9309ce982ccfb7d9ca5c75bae0e360be32092997f265c57d8a1f87ecf67e`.

An ordinary public reload adopted `main-DnQ-GnE2.js` and `main-C5KiTjF2.css`.
Browser-fetched main JS, CSS, storage worker, overlay JS and the actual
build-qualified source-download link returned 200 and matched the release
manifest hashes. Public readiness returned 200.

The unmodified signed-out login button fit at 390×844: document width 390,
button right edge 382, button width 122.8125 pixels. At 320×700, document width
was 320, button right edge 312, and button width 84.2421875 pixels. Its full DOM
label remained "Log in with Twitch". No runtime error banner appeared, and the
bounded error listener captured no errors through the resize checks. The
signed-in long-account visual and keyboard checks remain local evidence; this
deployment did not perform a Twitch authorization round trip.

See the [machine-readable receipt](deployment-2026-10-19-compact-header-evidence.json).
These checks do not satisfy the remaining accelerated-browser CPU/GPU or
provider acceptance gates in #136, #32, #36 and #38.
