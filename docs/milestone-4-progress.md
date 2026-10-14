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
See [supported mappings, limits and demo](chatterino-import-demo.md). PR #89 is merged; deployment is still pending, and it is not a production acceptance claim.

Completion and local nicknames (#33) now have reviewed profile-local preferences,
prefix/fuzzy policies, canonical identity annotations, opt-in browser spellcheck
and a bounded manual chatter read. Native dictionary/suggestion controls remain
browser-owned. Tests and a built-app fixture cover Unicode, IME, aliases, permission
and context isolation. See [behavior and verification](completion-demo.md).
PR #90 is merged. Deployment and live acceptance remain separate.

Self-hosted image uploads (#30) now have a reviewed browser flow, authenticated
account-isolated storage, bounded raster re-encoding, idempotent retries, expiry
and owner deletion. Hosting stays off until a dedicated durable directory is
configured. See [limits, deployment and demo](image-uploads-demo.md).
Production activation and live acceptance remain open.

Safe link preferences and selection search (#44) now have explicit fetch consent,
reviewed local policies, bounded preview sizes, double-click/keyboard opening,
manual protected resolution and reviewed selection search. Privacy cancels pending
requests and clears selections. See [behavior and verification](safe-links-demo.md).
PR merge, deployment and provider acceptance remain separate.

Unicode emoji (#45) now have the pinned Unicode 17 catalog, categories, tone
sequences, native/local-image/label styles and bounded rows/assets/cache. Legacy
workspace snapshots retain additive emoji choices. See [provenance and demo](unicode-emoji-demo.md).
PR merge, deployment and production acceptance remain separate.

Optional cross-device sync (#29) now has a private revision-checked store and an explicit browser select/review/publish/apply/delete/export flow. A two-profile built-app demo verified lost-receipt retry, destination restore with local private annotations retained, and stale-client rejection after deletion. See [sync progress](device-sync-progress.md) and [demo](device-sync-demo.md). Production storage setup and live-account acceptance remain open.

The optional BTTV/7TV read-service layer (#31) now has reviewed opt-ins, bounded subscriptions, cosmetic assignment retention and scoped emote-refresh hints; see [the demo](provider-events-demo.md). Remaining M4 work includes explicit provider activity controls and deployment/live acceptance. Supplemental public EventSub metadata (#32) is implemented with a projection that omits bodies and an explicit connection; see [the demo](eventsub-public-context-demo.md). Public shared-chat/reward/streak context and private own-message feedback have separate fixture evidence. External provider/configuration acceptance remains distinct from implementation and local verification.

This work does not close the earlier M3 production journal persistence gate or
remaining controlled-subject, private-event and eligible/live broadcaster checks.
Theme changes are local preferences and introduce no provider writes.
