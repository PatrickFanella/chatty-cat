# Dense panel sections

Issue #132 groups the six dense panels into labelled sections. Long explanatory
copy remains available through native details/summary controls. Primary actions
use wrapping rows; confirmation, consent and recovery handlers retain their
existing checks. The shared helpers create markup and load with the lazy panels.

- Presentation has ten fieldsets, from Message text through Overlay. Search hides
  empty groups, restores them when cleared, and retains edited controls. Detailed
  preview/privacy limitations remain expandable after the groups.
- Provider preferences separates emote providers, display, Twitch badges,
  optional cosmetics/live services and activity sharing. The review remains
  visible before Apply, rendered as wrapping formatted text. Editing invalidates
  it. The existing detailed network/privacy explanation is expandable.
- Public context separates channel/permission from connection/observed context.
  Connection and close choices share the final action row. Read/retention details
  remain expandable; opening a section does not connect the provider.
- Device sync separates the public-data selection from exact action/data review.
  Recovery and private annotation backup controls have a labelled disclosure.
  Publish/apply/delete still require explicit review and confirmation.
- Archive search starts with query and channel instead of file import. Filter
  syntax, saved queries and history files have separate disclosures. Input IDs,
  query handling, paging and import/export controls remain available.
- Moderation starts with channel/user selection, then retained history and action
  review. Presets, broadcaster actions, predictions, polls, suspicious signals,
  AutoMod and journal/recovery are separately expandable. Opening them preserves
  the existing account, role and scope gates.

The generic shell rule that hid any fieldset without visible labels is removed.
Button/status-only groups, including AutoMod, can now appear when expanded.
Presentation search explicitly hides only its own nonmatching groups and fields;
the hidden state takes priority over the shell's flex layout. Nested sections use
the same label grid and action spacing as their parent panel.

At 1280×800, every panel's complete first section fit inside its dialog. First
section heights ranged from 62 to 231 px; the lowest first-section edge was
417 px. Dialogs had no horizontal overflow. Direct-child explanatory paragraphs
were at most 211 characters. Measurements cover initial signed-out states, with
moderation using the existing synthetic authenticated fixture. Exact geometry,
section names and control counts are in the [local evidence](dense-panels-local-evidence-2026-10-15.json).

The browser verified presentation search showing only Overlay for “shadow” and
restoring all ten groups when cleared. Provider review enabled Apply and an input
edit disabled it. The moderation fixture refreshed the synthetic moderator's
context, staged a timeout preview, then invalidated confirmation on a reason edit.
Enter expanded the AutoMod disclosure and its button-only fieldset was visible.
The fixture recorded zero provider writes. Existing automated suites cover
consent, private account isolation, preview/confirm, cancellation, quota/recovery
and archive behavior. The full frontend suite passed 856 tests in 184 files;
19 focused tests also passed after the final provider review-format adjustment.
Strict TypeScript, production build, formatting and diff checks passed. Main
JavaScript is 153.21 kB gzip; the existing large-main warning remains.

To repeat the checks, serve the production frontend, open the five signed-out
panels from Menu, and inspect their initial sections at 1280×800. For moderation,
run `go run ./web/test-support/moderation`, seed the local fixture history, use its
synthetic moderator consent, and open Moderation. Use the fixture's viewer target
for read/preview checks and inspect `/fixture/stats` for the write count. Real
provider actions are not required for layout verification.

These changes are not deployed. Narrow/portrait layouts remain #133. Closing was
checked through panel buttons; the existing open-picker Escape routing remains
a follow-up. This work does not establish new live-provider acceptance.
