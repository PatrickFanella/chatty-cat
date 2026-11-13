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

## Desktop UI review, November 4, 2026

The desktop interaction and presentation pass adds state-preserving panel moves,
a draggable chat panel, compact message action controls, shared fast tooltips,
settings subsections and explanations, and player sign-in controls. The original
baseline above remains historical evidence. Local production measurements for
this change are approximately 155 KB JavaScript / 16.1 KB CSS for the main entry,
and 169 KB JavaScript / 17.5 KB CSS for Settings, at gzip level 9.

The affected main/static-import entry limits increase by 1,024 JavaScript bytes
and 512 CSS bytes. The browser-companion closure needs 2,048 JavaScript bytes;
Settings needs 3,072 JavaScript bytes and 1,024 CSS bytes. These are reviewed
absolute-limit adjustments for the new UI, rather than renewed percentage
headroom. Overlay and worker limits stay unchanged. The deliberate 20 KiB
regression test still rejects an oversized main build.

The subsequent hover-usercard history adds a bounded, scrollable list of retained
messages. Its shared code also appears in the Settings and Video import closures;
only those JavaScript limits increase by a further 256 bytes each. All other
limits, including CSS, remain at the values established by the desktop UI pass.

The first-visit introduction (November 12, 2026) adds a small module, its styles and
an emitted lockup image to the main entry. Every entry that statically imports the main
closure had little or no headroom left, so their JavaScript limits increase by 512
bytes and their CSS limits by 256 bytes. Overlay and worker limits stay unchanged.

Moving browser storage to the `chatty-cat` names (November 12, 2026) adds a small
module that runs before the main and overlay entries, and every storage key literal
grows by one character. The Browser companion and Video closures had less headroom
than that, so only their JavaScript limits increase by 256 bytes each. All other
limits, including the overlay and storage worker, stay unchanged.
