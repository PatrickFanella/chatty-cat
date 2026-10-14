# M4 deployment — October 13, 2026

Tested commit `58929944f62344f9b436b3fc11f01ad64f3939c1` is deployed at https://chat.subcult.tv. Runtime image is `sha256:70c72d9c339af73381cdfbb7c9938a3cb99d6fb459b9eb8ef1171d33f762612c`. The release includes the merged M4 work through PR #106 plus the reviewed activity and live-data corrections in PRs #107–109; PRs #107–110 are now merged (verified during the roadmap update). Deployment does not close M4.

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

Public bundle `assets/main-D_3ktAC2.js` matches SHA-256 `70811571a6f88ebca80a4b8e696935c6484708c45495077d8845566aba915606`. The [release-specific source archive](https://chat.subcult.tv/source.tar.gz?release=5892994) matches `11c7767510e42653aabd4b4f09cabd8df3096d8c7367890ebc0c338dc01756dd`. The unversioned `/source.tar.gz` was still a Cloudflare cache HIT for the immediately preceding release, with a four-hour cache lifetime. This was an open deployment issue at activation; requesting with `cache: no-store` did not bypass the edge cache. The existing edge DNS token returned 403 on zone discovery; no cache purge, token change or edge configuration mutation was attempted. A later native public-browser recheck on October 13 returned 200 and the expected `11c7767510e42653aabd4b4f09cabd8df3096d8c7367890ebc0c338dc01756dd` hash for both URLs (Cloudflare MISS). The observed mismatch has cleared; no purge or edge change was made. This does not add cache invalidation for future releases.

Recovery is root-only at `recovery/m4-5892994-20261013`. `sudo .../rollback.sh --check` passed without mutation. Running it without `--check` restores the preceding M4 image/current link with the same data mounts; it retains all upload and sync data. The earlier `recovery/m4-4615a35-20261013` receipt retains the pre-M4 theme image and configuration. Actual rollback and reboot were not exercised. Backend activation ended in-memory Twitch sessions.

## Live acceptance checkpoint — October 13, 2026

The owner completed these checks at `chat.subcult.tv` as `patrick__eff` in regular browsers:

- **Image hosting (#30):** reviewed upload, public image display, receipt persistence after reload, owner deletion and public-link 404 passed.
- **Device sync (#29):** published saved workspaces, fetched the same revision after reload and in a second isolated browser, applied the snapshot with the expected channels/layout, then deleted it. A subsequent fetch showed no active snapshot; both browsers retained their local workspaces. The agent also verified the published revision in the production store before deletion.
- **Provider activity (#31):** reviewed `patrick__eff` in `#hasanabi` with BTTV and 7TV, started the session and observed Live, then stopped it. The owner confirmed the session ended and the active toolbar indicator disappeared. This proves the observed browser flow; BTTV sends are not delivery receipts, and independent provider-side presence readback was not captured.

M4 remains open. Controlled live emote changes and cosmetic badge events, supplemental public/own-message EventSub cases with consent and suitable external conditions, remain outstanding. The earlier source-cache mismatch has cleared on public-browser recheck; both source URLs now match the deployed release hash. Sync conflict/lost-receipt/recovery cases retain fixture evidence; they were not repeated in production. Upload persistence across a server restart or reboot was not exercised. Native feature limitations and earlier M3 private-event/journal and eligible broadcaster gates remain separate.

The shared preview and regular browsers have separate sessions. The owner performed these account checks in regular browsers. Fixture results and a healthy deployment do not replace the remaining account/provider checks.


Public-context connection acceptance: on October 13, the owner granted the required access and connected from the signed-in browser. The panel reported “Live public context (latest 100 relevant messages / 15 minutes, snapshots every two seconds); bodies excluded”. This passes consent/connection and does not establish a positive shared-chat, reward, streak, effect or private hold/update event. Those controlled-event checks remain open under #32.
