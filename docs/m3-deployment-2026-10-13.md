# M3 deployment verification — October 13, 2026

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
