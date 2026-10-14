# Remaining acceptance — October 14, 2026

## Deployed release

NUC runs merged commit `26ea533c486ec21ee018dbf318d03b5fc22eff68`, including M5
implementations and the #126 opaque-cache correction. The immutable image is
`sha256:12874baa1d0388610e7693036d3aab48f7f02b37aa92984d1f2b579302da477d`.
All 3,971 release hashes matched the clean manifest before activation. A separate
loopback staging container passed readiness; storage routes were unavailable with
staging storage disabled. Production readiness passes, signed-out sync is refused,
and the public main bundle, service worker and release-specific source archive
match the manifest. Runtime is healthy with zero restarts.

The prior image, current-link target, Compose files and private environment hash
are retained in root-only `recovery/closeout-26ea533-20261014` on NUC. Its guarded
`rollback.py --check` passed. Activation included rollback on readiness/image
failure; actual rollback was unnecessary. Existing upload/sync mounts, secrets,
ingress and network configuration were retained. Backend restart required renewed
sign-in; patrick__eff successfully renewed in the production browsers.

## #37 — accepted text extension framework

The signed-in production shared preview reviewed/installed the channel-note
manifest disabled, separately reviewed its channel/input/draft grants and enabled
it. The real sandbox returned `Note for #patrick__eff: closeout acceptance` with
an unchanged empty draft. A separate Stage action populated only that draft; it
was cleared without sending. The channel view returned the selected public
channel. Reload retained the enabled manifest while clearing transient output.
Disable removed runtime output/frames; reviewed removal left zero test manifests.
Existing security tests cover opaque-frame isolation, permissions, quotas and
account boundaries. The browser fixture additionally verifies refusal of app
state access; declarative manifests cannot supply executable code. #37 is closed
for version 1, with JavaScript/HTML/native/Lua compatibility explicitly unavailable.

## #35 — accepted macOS external playback

The native Go helper was built/installed on Soyuz with production origin and exact
Streamlink/mpv paths. Production pairing/status and launch review did not launch
processes before explicit confirmation. An observed-live followed channel,
central_committee, supplied the real stream. A 360p request exited 1; the provider
exposed 360p30, so fixed quality availability is not guaranteed. A separately
reviewed `worst` request played successfully.

A fixed local mpv IPC argument enabled read-only media checks. Decoding reported
284x160 video, stereo 44.1kHz audio, not paused and not idle. Media time advanced
from 6539.399 to 6541.399 over two seconds. A separately reviewed audio-only launch
reported `vid=false` with stereo audio. Verification playback was muted; no claim
of audibility or owner sonic approval is made. No player output or IPC capability
was exposed to the web client.

A browser connection outage prevented web revocation delivery. The documented
helper Ctrl+C recovery stopped all observed managed Streamlink/mpv processes.
Browser-local unpair was then verified. The temporary shared-preview channel was
restored to patrick__eff. #35 is closed for the demonstrated paired external-player
contract; Linux/Windows native playback is unverified, and full process-tree or
embedded-player/native-command parity remains unsupported.

## #82 — storage pressure corrected, original loss unresolved

[Measured baseline and regression evidence](journal-cache-pressure-2026-10-14.md)
identified 600 cached opaque images and 4,447,628,206 bytes of Cache Storage quota
usage. After deployed worker activation, Cache Storage reported 6,689,024 bytes
(later 6,689,280). This measures quota-accounted usage, not physical disk or heap
recovery. Chromium opaque-response padding explains the excessive cache budget.

The two confirmed receipts retained their exact pre-deployment IDs/outcomes after
activation, renewed sign-in and multiple reloads. A separate 0600 private backup
was saved first. No journal store was cleared or backup imported; no Twitch write
or provider retry occurred. This shared-preview profile differs from affected
Vivaldi. Original storage-loss causation, earlier records and affected-profile
retention across browser restart remain unresolved; #82 stays open.

## Remaining gates

#36's unpacked extension was installed by the owner; its popup pairing/send and
installed workspace/focus/removal round trip remain in progress. Browser automation
rejects chrome:// extension management and chrome-extension:// popup navigation;
manual popup actions are required. #38 still needs the owner's approved network,
credentials and identity; no network was invented or configured. #32 needs
controlled positive Twitch events. #4 needs explicit owner acceptance of direct
uncached GIPHY lookup or written provider approval. #47's installed native overlay
acceptance remains separate from its closed implementation issue.

## Validation

All 777 frontend tests, strict check/build, Go race suite and vet pass. Both new
service-worker regressions fail on the previous code and pass with the correction.
All four hosted push/PR checks passed on `8b2e747` immediately before #126 merged
as `26ea533`. No synthetic result is treated as live Twitch/provider acceptance.
