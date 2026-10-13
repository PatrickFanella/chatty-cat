# Milestone 4 progress

The isolated account-profile foundation (#27) is merged. Custom themes #84 are
merged and deployed at `3568fa4`, with public preview/revert verified and no
production preference saved. See [release evidence](m3-deployment-2026-10-13.md). Custom color themes (#34)
now have a supported six-color browser adaptation with bounded import, explicit
Chatterino 2.5.6 mapping, contrast review, reversible preview and validated export.
See the [reproducible theme demo and verification](custom-themes-demo.md).
Native QColor alpha, multipliers and filesystem autoreload remain unavailable.

Chatterino settings/layout import (#28) now has a bounded, reviewed browser
adaptation. It saves named workspace copies, maps supported public appearance and
text command definitions, excludes credentials/native scripts, and supplies a
validated recovery export. A native built-app demo verified imported pane/command
activation and return to the original draft and commands with zero provider writes.
See [supported mappings, limits and demo](chatterino-import-demo.md). This change
still needs PR merge and deployment; it is not a production acceptance claim.

Completion and local nicknames (#33) now have reviewed profile-local preferences,
prefix/fuzzy policies, canonical identity annotations, opt-in browser spellcheck
and a bounded manual chatter read. Native dictionary/suggestion controls remain
browser-owned. Tests and a built-app fixture cover Unicode, IME, aliases, permission
and context isolation. See [behavior and verification](completion-demo.md).
Merge, deployment and live acceptance remain separate.

Remaining M4 work: optional cross-device sync (#29), self-hosted image uploads (#30; owner-selected Chatty Cat storage),
live provider/cosmetic updates (#31), actual message-event context (#32), safe link previews/search (#44), and Unicode emoji catalog
and styles (#45). External provider/configuration acceptance is recorded separately
from implementation and fixture verification.

This work does not close the earlier M3 production journal persistence gate or
remaining controlled-subject, private-event and eligible/live broadcaster checks.
Theme changes are local preferences and introduce no provider writes.
