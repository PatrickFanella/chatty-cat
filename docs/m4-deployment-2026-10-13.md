# M4 deployment — October 13, 2026

Tested commit `58929944f62344f9b436b3fc11f01ad64f3939c1` is deployed at https://chat.subcult.tv. Runtime image is `sha256:70c72d9c339af73381cdfbb7c9938a3cb99d6fb459b9eb8ef1171d33f762612c`. The release includes the merged M4 work through PR #106 plus the reviewed activity and live-data corrections in PRs #107–109; PR #107 is merged, while #108 and #109 remain open as of this record. Deployment does not close M4.

All 3,971 transferred artifact hashes matched the clean release manifest. Loopback staging verified readiness, enabled upload/sync configuration, signed-out private-route rejection and packaged binary/browser/source hashes. The correction staging used separate directories, avoiding the production sync writer. Staging was stopped and removed before activation. Activation guarded the previous image, current link, Compose file and private environment hash, and included automatic rollback on readiness/runtime mismatch. No rollback was needed.

NUC runs `chatty-cat-chat-1` under `/srv/apps/projects/chatty-cat`, retaining UID/GID 10001, read-only root, 512 MiB memory and 128-PID limits. New dedicated `shared/uploads` and `shared/sync` directories are owned by 10001:10001 with mode 0700. `compose.m4.yaml` adds only those writable binds and explicitly configures BTTV/7TV event services and FFZ/Chatterino public catalogs. The existing private `shared/app.env`, listener, firewall, edge and DNS were not changed. Browser activity flags remain off by default and each activity session requires separate review/start.

The checked-in [NUC override](../deploy/compose.m4.nuc.yaml) is used with the existing host-specific `compose.nuc.yaml` and root-only image selector. Validate without expanding secrets:

```sh
sudo docker compose --env-file /srv/apps/projects/chatty-cat/image.env \
  -f /srv/apps/projects/chatty-cat/compose.nuc.yaml \
  -f /srv/apps/projects/chatty-cat/compose.m4.yaml config --quiet
```

Native public-browser verification returned readiness 200, enabled storage/provider configuration and 401 for signed-out uploads, sync and public-context feeds. Public chat remained connected. In an isolated browser profile, reviewed read-only opt-ins opened both fixed provider sockets: BTTV sent one channel join; 7TV sent six subscriptions and acknowledged all six. No account announcement, Identify/Signal or presence write was sent. Privacy closed both sockets; temporary preferences were restored and the QA tab was closed. A production server read also projected a real Chatterino badge assignment with zero catalog errors.

The live checks caught two defects before acceptance: malformed Chatterino assignments rejected its whole catalog (#108), and Twitch's 420 badge categories exceeded the browser's old 256-category bound (#109). Both have failing-before/passing-after regressions. The final frontend suite passed 730 tests; type checking and production build passed. Go race coverage, vet and lint passed for the changed Go paths, with full Go race verification earlier in the read-service layer.

Public bundle `assets/main-D_3ktAC2.js` matches SHA-256 `70811571a6f88ebca80a4b8e696935c6484708c45495077d8845566aba915606`. The [release-specific source archive](https://chat.subcult.tv/source.tar.gz?release=5892994) matches `11c7767510e42653aabd4b4f09cabd8df3096d8c7367890ebc0c338dc01756dd`. The unversioned `/source.tar.gz` was still a Cloudflare cache HIT for the immediately preceding release, with a four-hour cache lifetime. Its freshness is an open deployment issue; requesting with `cache: no-store` did not bypass the edge cache. The existing edge DNS token returned 403 on zone discovery; no cache purge, token change or edge configuration mutation was attempted. Do not claim the unversioned download matches this release.

Recovery is root-only at `recovery/m4-5892994-20261013`. `sudo .../rollback.sh --check` passed without mutation. Running it without `--check` restores the preceding M4 image/current link with the same data mounts; it retains all upload and sync data. The earlier `recovery/m4-4615a35-20261013` receipt retains the pre-M4 theme image and configuration. Actual rollback and reboot were not exercised. Backend activation ended in-memory Twitch sessions.

Remaining acceptance requires a fresh real `patrick__eff` session: reviewed upload/receipt/public read/delete and storage persistence; private sync publish/read/conflict/delete with another isolated profile; linked-provider activity with its own reviewed start/stop; controlled provider emote changes and badge events; and the supplemental public/own-message EventSub cases with their required consent and external conditions. The shared preview is prepared for Twitch sign-in. Earlier M3 private-event/journal and eligible/live broadcaster gates remain separate. Fixture results and a healthy deployment do not replace these account/provider checks.
