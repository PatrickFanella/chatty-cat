# Bundle gzip budgets

Issue [#141](https://git.subcult.tv/subculture-collective/chatty-cat/issues/141)
adds committed gzip limits after the lazy-panel and data-extraction changes.
The baseline is merged main `1f64fb9`, measured with the pinned frontend tools.
`scripts/bundle-budgets.json` records both that baseline and the enforced limits
for all 56 main, overlay, worker and dynamic entry points.

Each measurement includes an entry's JavaScript and its recursive static imports
once, with a separate CSS total. Dynamic imports receive their own budgets.
Shared imports can appear in several entry totals; the rows describe loadable
entry closures and must not be summed into one application size. The existing
overlay/main ratio guard remains in the build.

| Entry | Baseline JS gzip bytes | JS limit | Baseline CSS gzip bytes | CSS limit |
| --- | ---: | ---: | ---: | ---: |
| Main | 150,652 | 154,748 | 14,863 | 15,887 |
| Overlay | 27,127 | 28,484 | 10,712 | 11,736 |
| Moderation UI including static imports | 175,217 | 179,313 | 14,863 | 15,887 |
| Storage worker | 34,362 | 36,081 | 0 | 0 |

Initial headroom is five percent, bounded between 1,024 and 4,096 bytes per
nonempty JS/CSS total; empty totals remain zero. These are absolute committed
limits, not an allowance added to each subsequent build. New or removed entries
fail until the reviewed limits reflect the intended build. Invalid limits and
missing manifest imports also fail.

`npm --prefix web run build` runs the guard after compilation and the overlay
check. It prints all measurements and limits, writes
`web/dist/bundle-budget-report.json`, and appends the table to the CI step summary
when `GITHUB_STEP_SUMMARY` or `GITEA_STEP_SUMMARY` is available.

CI then runs `node --test scripts/check-bundle-budgets.test.mjs`. That test copies
the actual build to a temporary directory, confirms it passes the committed
limits, and adds deterministic incompressible data to the main JavaScript. It
verifies at least 20 KiB of additional gzip payload and confirms the actual guard
CLI exits 1 with a main-entry budget failure. It also verifies rejection of an
unbudgeted entry. The original build is preserved, and the expected failure is
not written into the CI summary.

For a legitimate size change, review the JSON report, explain the payload change,
and update the affected committed limits explicitly. Preserve the baseline as
historical evidence or replace it with a separately measured, documented baseline.
CI never raises limits automatically. Local build and deliberate-regression checks
pass; hosted CI and merge remain separate acceptance steps.
