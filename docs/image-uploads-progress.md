# Self-hosted image uploads (#30)

The owner selected Chatty Cat hosting. The disk blocker cleared on October 13
(8 GiB free on recheck). Storage and browser review are implemented; destination
configuration is off by default. See [limits and reproducible demo](image-uploads-demo.md).

Verification: Go race suite and vet passed; the official checksum-verified
golangci-lint 2.14.0 binary reports zero issues. All 630 frontend tests and the
production build passed, including the disabled-configuration regression.
Six focused frontend tests pass, including staged owner deletion. Focused storage/session race tests include revoked login during body read. The
built UI verified synthetic paste/drop, real local upload, canonical link insertion
and zero provider writes. Production storage is enabled; see [deployment evidence](m4-deployment-2026-10-13.md).

On October 13, the owner confirmed reviewed upload, public image display, hosted-image receipt persistence after page reload, owner deletion and public-link 404 as `patrick__eff`. Server restart/reboot persistence and expiry were not exercised in these live checks.
