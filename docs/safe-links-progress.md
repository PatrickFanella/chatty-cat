# Safe link preferences (#44)

Implemented profile-local reviewed preferences, explicit preview consent,
thumbnail/emote-tooltip controls, size bounds, pointer/keyboard policy, manual
protected URL resolution and reviewed selection search. The backend preview
transport and its SSRF protections are unchanged. See safe-links-demo.md.

633 frontend tests, the production build and preview/server race suites passed.
27 focused tests passed after the visible blocked-popup fallback notice was added.
The built Chrome fixture verified one-time consent, Enter activation, redirect
disclosure, explicit resolution, settings persistence, selection review and
privacy suppression, with zero provider writes. Production acceptance is separate.
