# Provider controls demo

Run `npm --prefix web run build`, then `python3 web/test-support/provider-browser-fixture.py` and open `http://127.0.0.1:5192/?channel=current&video=off`.

The fixture provides two synthetic public chat messages and overlapping 7TV global / FFZ channel emotes. It rejects provider writes. Images use Twitch's public Kappa assets as stand-ins; provider data is synthetic.

1. Open **Provider and badge preferences**. Turn off FFZ channel emotes, channel-authority badges, and animation. Review and apply.
2. Wave now comes from 7TV, Overlay returns to text, Kappa retains its native tag identity, moderator badges disappear, and subscriber badges remain. Reload the page and reopen the panel to check persistence.
3. Reload provider metadata twice. The second request reports the 30-second cooldown. Neither reload reconnects chat or adds duplicate messages.
4. Reenable FFZ channel emotes. Use the fixture's removal button, then Reload provider metadata after the cooldown. The removed channel set is replaced and Wave falls back to 7TV.
5. Enable privacy mode. The preferences dialog closes and staged edits cannot be applied.

Preferences are local to the current browser account. Saving requires review and rejects changed account/profile and stale-tab state. Corrupt existing preferences are retained. Global/channel toggles control rendering and picker/completion metadata, not the server's existing provider requests. Native tag ranges remain authoritative. With live refresh disabled, an already-seen set is retained until an explicit reload. Old servers without scoped sets can only disable a provider as a whole.

The browser checks metadata every minute with four fetch workers, a 25-second timeout, cancellation, stale-generation guards, an eight-MiB streamed response limit, and bounded dictionaries. The server still caches provider emote reads for ten minutes, coalesces requests and retains last good data on failure. Reload does not bypass that cache. Metadata changes invalidate rendered rows through the existing reader-preserving presentation path and replace picker dictionaries.

Optional cosmetic badges, custom FFZ role images, presence/activity writes, provider event sockets, unlisted filtering, tooltip scaling, bits stacking, and whitespace preferences remain separate work for #31. No optional cosmetic service is enabled here. Badge visibility never changes roles or moderation permissions.

Verified on October 13, 2026: 659 frontend tests; production build; Go race suite, vet and lint (zero issues). Native T3 preview confirmed provider fallback, static native rendering, category filtering, persistence, cooldown, unchanged two-message log, and zero provider writes. Fixture tests are not live provider acceptance.
