# Journal storage investigation — October 13, 2026

Issue [#82](https://git.subcult.tv/subculture-collective/chatty-cat/issues/82)
remains open. The four earlier production receipts have not been recovered and
their disappearance is not conclusively attributed to a browser storage event.
No live Twitch write was performed during this investigation. Subsequent controlled
live writes and their receipt checks are recorded separately in the
[live acceptance report](m3-live-acceptance-2026-10-13.md).

## Measured conditions

The client data volume reported 100% capacity with 1.6 GiB available. Its Go build
cache occupied 4.5 GiB. After checking that no Go build/compiler was active, clearing
that reproducible cache raised available space to 6.0 GiB; subsequent local fixture
compilation left 5.6 GiB. Source, release artifacts and user data were retained.

Low disk space is a concrete eviction hypothesis. Chromium's
[quota settings](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/storage/browser/quota/quota_settings.cc)
describe disk reserves and eviction under pressure. Google's
[persistent-storage guidance](https://web.dev/articles/persistent-storage)
explains that best-effort IndexedDB can be removed under storage pressure. This is
supporting evidence, not a captured eviction log for the earlier incident.
The browser developer bridge did not support raw storage-quota diagnostics.

## Implemented safeguards

The moderation journal listens for an unexpected database close or a version
change. It remains unavailable for that page lifetime and reports that the user
must reload and check retained receipts. It does not reopen storage as an empty
journal or retry a provider request. A failed transaction start receives the same
clear fail-closed treatment. Existing pending-before-send behavior blocks delivery
when a receipt cannot be stored.

The workspace includes local storage status and an explicit protection button.
Opening the workspace only reads protection and estimated usage/allowance; it never
requests persistence. The button calls the browser's persistence API and reads the
result. Granted, best-effort and unavailable states remain distinct. Protection
applies to this site's saved chat and private records; it cannot prevent explicit
site-data clearing. Quota is an estimate, not a measurement of free disk space.
Closing or changing the private scope suppresses late status results. Backups remain
necessary; this change cannot restore data already removed.

## Verification

Two journal lifecycle regressions failed on merged main and pass with the change.
Tests simulate an abnormal database close and a version change. A workspace test
verifies that a reviewed action makes zero provider POSTs after storage changes.
Storage tests cover explicit requests, denial, missing/erroring APIs, invalid byte
estimates, zero allowance, confirmed protection and cancellation of late results.

All 582 frontend tests, strict TypeScript and the production build pass. The 18
reader/presentation tests interrupted by the T3 restart were rerun and passed.
The backend was unchanged; the local Go fixture compiled successfully.

Native shared-preview verification showed best-effort status, an explicit denied
protection request, and a staged moderation action refused after a synthetic
database version change. The fixture provider count remained zero. The regular
browser also reported denied protection without claiming success. A new synthetic
confirmed receipt survived reload after disk recovery. None of these fixture checks
establish production persistence or prove the earlier eviction hypothesis.

The merged safeguards were subsequently deployed. Four fresh confirmed production
receipts survived a reload before custom theme activation. At 17:26 UTC, following
theme deployment and renewed sign-in, the same account's reviewed export and journal
refresh returned zero receipts. Its four-receipt private backup remains intact.
The connection-close guard does not prove retention after a new page opens an empty
database. No eviction log or causative transition was captured. Production journal
retention remains unaccepted. The owner subsequently reported force-quitting Vivaldi
because of approximately 14 GiB of memory use. This is a reported browser event,
not an established storage-loss cause. A post-restart snapshot measured 7,794 MiB
resident memory across 55 browser processes; client free disk space was 2.8 GiB.
No eviction log, tab-specific heap profile or exact quit/loss ordering was captured.

Controlled message deletion, timeout and removal were separately provider-confirmed.
A later live clip and marker were also provider-confirmed, with separate private
backups before/after delivery. Their two receipts survived a page reload with the
same IDs and confirmed outcomes. That narrow check does not recover the earlier
four receipts or establish retention across a browser restart. Eligible broadcaster
and actual private-event gates remain open.
