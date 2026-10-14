# Continuous verification

The Gitea Verify workflow runs on pushes, pull requests and manual dispatch. Its two independent jobs run full Go race/vet checks and lockfile-installed Node 24 frontend tests/build. Browser companion syntax and packaging run with the frontend job. It does not deploy, merge or use provider credentials.

Checkout and toolchain actions are pinned to immutable commits. Go is selected from go.mod. Tests are fixture-based: their success is implementation evidence, not owner/provider acceptance. Frontend worker concurrency is capped at two to keep runner memory bounded.

Before an authorized merge, re-read the current PR head SHA, mergeability and hosted results for both jobs. Local passing commands do not substitute for a missing or pending hosted check. Required-context branch protection is a separate repository policy; this workflow does not change it.
