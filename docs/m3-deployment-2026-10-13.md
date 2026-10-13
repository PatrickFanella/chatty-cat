# M3 deployment verification — October 13, 2026

## Later activation through PR #79

Merged commit `8b7500a3775723d2b074e99c357fcc281620ca51` was subsequently
packaged and activated with image
`sha256:18b3fac6df07ef52ac0c40bd8a5310bc3dfa2f90259e05b70d84cc79deb042d6`.
This includes the clip, marker, title/category and commercial controls from #79.
All 26 transferred manifest hashes matched. Private loopback staging passed
readiness and refused unauthenticated broadcaster-context access with HTTP 401.
Packaged binary, browser bundle and source hashes matched the release manifest.
The staging container was stopped and removed after activation.

The public native browser loaded `main-6MKW__c8.js`, received readiness HTTP 200
and broadcaster-context HTTP 401 while signed out, and downloaded the 718,278-byte
source archive with SHA-256
`7d821a279915bc12d63f5e9ddb97d2eca9f4810ccf551e945cb9816028a3ea83`.
The existing hardened Docker runtime is healthy with zero restarts. The prior M3
image and configuration are retained under `recovery/m3-8b7500a-20261013` for
rollback. The activation invalidates pending OAuth flows; additional consent must
use a fresh flow. PR #81's channel-replacement fix is not included in this release.
Live Shield command evidence is recorded [separately](m3-live-acceptance-2026-10-13.md).

## Initial activation through PR #78

VERIFIED: the merged application through PR #78 is deployed on NUC and served
through the public HTTPS edge. This verifies deployment and anonymous access
boundaries. Live Twitch acceptance remains pending authentication and consent.

## Release

- Commit: `298c1060a257a9dc779eaf9f6bc5212c628d0ede`, clean release checkout.
- Image: `sha256:432d0b5334cad14c146abfd950dcc6cda3bb787e6c204102c3edf6800cd457fc`.
- Browser entry: `assets/main-D7pZ4rws.js`.
- Public source: 704,685 bytes; SHA-256
  `e42c4c0442e3481de80866ba81e58f2eed5b14808bcd2a3698c157674055abed`.

The release builder passed strict TypeScript and production compilation and built
the Linux amd64 binary. All 26 manifest file hashes matched after transfer to NUC.
The packaged binary, browser entry and source archive matched those hashes inside
the staging container. A private loopback staging instance passed readiness before
activation; it was stopped and removed afterward.

## Observed before and after

| Check | Previous release | Activated release |
| --- | --- | --- |
| Readiness | HTTP 200 | HTTP 200 on LAN and public HTTPS |
| Browser entry | `main-Defu8Qqk.js` | `main-D7pZ4rws.js` |
| Polls, predictions, AutoMod and suspicious-user routes | HTTP 404 | HTTP 401 with a valid channel and no login |
| Runtime | Healthy, zero restarts | Healthy, zero restarts |

The public native browser loaded the new bundle and downloaded the matching
source archive using the bundle-specific source link. Authentication is enabled;
the shared browser session is signed out. The main reader connected successfully.
Its existing workspace restored `hasanabi`, so a live test must explicitly join
and select `patrick__eff` before staging an action.

The existing Docker configuration retains UID/GID 10001, a read-only root filesystem,
host networking, the existing listener and secret file, and the existing resource
and logging limits. No edge, DNS or firewall change was needed. The previously
dirty deployment worktree was preserved.

## Recovery

The previous immutable image remains available:
`sha256:e6a8f58267ae8164ea686b42dea615023aaf4bc3dc9818631d6db86c831e0a31`.
The prior image selection, Compose configuration and release-link target are retained
in the root-only `recovery/m3-298c106-20261013` directory beneath the NUC runtime.
Rollback restores that image selection and configuration, runs Compose with
`--no-build --pull never`, restores the recorded release link, and rechecks readiness.
Rollback was prepared but was not exercised during this healthy activation.

## Acceptance gate

The owner approved the controlled live checks on October 13. No live Twitch write
has occurred. Use the owner's `patrick__eff` channel and a controlled test message
or account; do not infer a test subject from an unrelated chatter. Twitch login and
permission consent still require owner interaction. Eligibility, a second controlled
account for user-targeted actions, and actual held/suspicious events may constrain
which checks can run. Short test polls and predictions are authorized if Twitch
establishes broadcaster eligibility.

PR #79's clip, marker, title/category and commercial controls were not part of this
release. Its local qualification passed 571 frontend tests, production compilation,
Go race tests, vet and lint, with native synthetic-provider checks; this does not
establish live acceptance. Earlier sections of [M3 progress](milestone-3-progress.md)
describe the state at their implementation checkpoints; this dated report records
the subsequent deployment. M3 and full parity remain open.
