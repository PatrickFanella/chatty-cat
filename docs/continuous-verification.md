# Continuous verification

The Gitea Verify workflow runs on pushes, pull requests and manual dispatch. Its two independent jobs run full Go race/vet checks and lockfile-installed Node 24 frontend formatting checks, tests and build. Browser companion syntax and packaging run with the frontend job. It does not deploy, merge or use provider credentials.

Checkout and toolchain actions are pinned to immutable commits. Go is selected from go.mod. Tests are fixture-based: their success is implementation evidence, not owner/provider acceptance. Frontend worker concurrency is capped at two to keep runner memory bounded.

Before an authorized merge, re-read the current PR head SHA, mergeability and hosted results for both jobs. Local passing commands do not substitute for a missing or pending hosted check. Required-context branch protection is a separate repository policy; this workflow does not change it.

## Frontend formatting

Run these commands from the repository root after `npm --prefix web ci`:

```sh
npm --prefix web run format
npm --prefix web run format:check
```

Prettier is pinned in the frontend lockfile, with a 120-column print width and
single quotes. The commands cover authored TypeScript and CSS under `web/src/`
and the frontend's TypeScript configuration modules. Embedded-language formatting
is disabled so template-string HTML and other literal content keep their bytes.
HTML files, generated emoji/resource catalogs, vendored assets, companion code
and Go code are outside this pass. Update generated catalogs through their
existing scripts rather than formatting their output.

The initial source-only formatting commit is listed in the root
`.git-blame-ignore-revs`. To trace a line through that commit, run:

```sh
git blame --ignore-revs-file .git-blame-ignore-revs -- web/src/main.ts
```

To use this behavior for future blame commands in your local checkout:

```sh
git config --local blame.ignoreRevsFile .git-blame-ignore-revs
```

The formatter setup and CI/documentation changes are separate commits and are not
ignored. Preserve the formatting commit's identity when merging this history; if
history is rewritten, update the ignore file to reference the retained commit.
