# Optional cosmetic badges

`CHATTHING_COSMETIC_PROVIDERS` defaults to empty. The supported explicit list is `FFZ`, `Chatterino`, or `FFZ,Chatterino`. Unknown or duplicate names fail startup. Compose forwards this optional value. There is no arbitrary destination URL setting or provider credential. Enabling a service permits the server to read its fixed public catalog; the browser must also opt in under **Provider and badge preferences**. Production configuration has not been changed by this PR.

FFZ reads `https://api.frankerfacez.com/v1/badges/ids`. Chatterino reads `https://api.chatterino.com/badges`, following the [pinned upstream implementation](https://github.com/Chatterino/chatterino2/blob/v2.5.6/src/providers/chatterino/ChatterinoBadges.cpp). The [official FFZ API](https://api.frankerfacez.com/) documents its badge catalog. User IDs accept exact decimal strings or integers without floating-point conversion. Provider images remain attributed cosmetics; they never grant or assert native Twitch roles. CSS/color/replacement instructions from catalogs are ignored.

Only recent public-message IDs are sent to this server, at most 100 per minute. No catalog request occurs while both local toggles are off. The server downloads only configured catalogs, caches each for ten minutes, limits transfer to four MiB, allows 128 badge definitions / 100,000 assignments / eight badges per ID per catalog, refuses redirects, and has a single nonblocking fetch slot. A failed catalog backs off for one minute and reports possible stale last-good data. The API returns only requested IDs, not the entire assignment list. The browser keeps at most 256 public user entries in memory, cancels late responses, clears on privacy changes and shutdown, and does not put assignments in logs, workspaces, exports or browser storage. Badge images contact their provider host from the browser with no referrer. No Twitch or cosmetic activity writes are performed.

## Reproducible browser check

Build the web app, run `python3 web/test-support/cosmetics-browser-fixture.py`, and open `http://127.0.0.1:5193/?channel=current&video=off`. It uses synthetic public metadata, a mocked configured FFZ/Chatterino service, and public Kappa images as stand-ins.

1. Cosmetics start unchecked; no cosmetic badge appears.
2. Enable FFZ cosmetics, Review, and Apply. The fixture badge appears with `FFZ cosmetic: Fixture developer` attribution. Moderator and subscriber tags remain native and unchanged.
3. Enable privacy mode. The badge disappears, the dialog closes and pending data cannot repopulate it.
4. The fixture rejects provider writes and leaves the log at two synthetic messages.

## Evidence and remaining gates

October 13, 2026: 661 frontend tests, production build, full Go race suite, vet, and lint passed. Regression tests cover configuration defaults, catalog caching, scoped IDs, unsafe/malformed/oversized data, redirect rejection, numeric ID precision, local opt-in, role separation and stale response cancellation. Native T3 preview verified opt-in display, source labels, unchanged native badges/log, and privacy clearing.

`go run ./web/test-support/cosmetics-live` is a read-only probe that prints provider status only. Live FFZ validation exposed numeric IDs and passed after the parser fix. The Chatterino endpoint returned HTTP 403 from Soyuz; positive live Chatterino acceptance remains blocked on provider access. Synthetic success does not close that gate. Custom FFZ role images, BTTV/7TV cosmetics and the remaining exact #31 inventory controls are not included in this step.
