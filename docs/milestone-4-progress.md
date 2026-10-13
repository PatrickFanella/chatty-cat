# Milestone 4 progress

The isolated account-profile foundation (#27) is merged. Custom themes #84 are
merged and deployed at `3568fa4`, with public preview/revert verified and no
production preference saved. See [release evidence](m3-deployment-2026-10-13.md). Custom color themes (#34)
now have a supported six-color browser adaptation with bounded import, explicit
Chatterino 2.5.6 mapping, contrast review, reversible preview and validated export.
See the [reproducible theme demo and verification](custom-themes-demo.md).
Native QColor alpha, multipliers and filesystem autoreload remain unavailable.

This work does not close the earlier M3 production journal persistence gate or
remaining controlled-subject, private-event and eligible/live broadcaster checks.
Theme changes are local preferences and introduce no provider writes.
