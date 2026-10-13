# Completion and local nicknames

Open **Completion** in the header, change the options, then review and apply.
Preferences belong to the current local account profile. They are not included in
workspace exports, cross-device bundles, or chat history. Review changes neither
the active preferences nor the current draft; saving is guarded against another
tab or account replacing the data. Close and privacy mode erase unsaved input.

Prefix matching remains the default. Fuzzy matching uses ordered characters and
ranks prefix matches first. Optional smart emote ordering uses up to 64 configured
exact emote codes; this is a browser adaptation, not native usage-based ranking.
Bare username completion on Tab, colon emote completion, the username popup,
broadcaster inclusion, mention prefixes, commas and trailing spaces are configurable.
Completion preserves suffix text and UTF-16 caret offsets, refuses insertion inside
a grapheme, and does not intercept Enter during IME composition.

Local nicknames accept at most 100 real Twitch logins and 40-character labels.
A nickname displays as `Friend · alice` and matches either part. Completion inserts
the real login; profile links, provider identifiers, moderation targets and message
text retain their Twitch identity. Privacy mode hides local annotations.

Browser spellcheck is opt-in. Dictionaries, suggestion counts and any spelling
service are controlled by the browser and its settings. The web platform cannot
select Chatterino's native dictionary or suggestion-count controls.

## Optional chatter reads

Chatter reads are off by default. Enable them and use **Read one completion chatter
page** to fetch at most 100 names. Channel discovery consent and Twitch broadcaster
or moderator access are required. The default small-streamer policy blocks reads
when the viewer count is unknown or exceeds the configured threshold (1–100,000).
Chatters are not viewer count. There is no background polling or pagination.

Reads have a 60-second cooldown, a 30-second timeout and server rate-limit backoff.
Names expire after five minutes and stay in memory only. Account/channel changes,
revoked consent, closing the application and privacy mode prevent their reuse.
Fetched names are not written to storage, archives or exports.

## Reproducible checks

Run `npm --prefix web test -- --maxWorkers=1` and `npm --prefix web run build`.
The completion, composer, preference, chatter and render suites cover fuzzy order,
spacing, Unicode/IME, canonical identity, literal nickname rendering, profile
isolation, stale writes, quotas, scope/context changes and bounded chatter reads.

The built application was checked in the T3 browser with a local synthetic IRC,
auth and discovery fixture. Review preserved the draft and left storage unchanged;
apply inserted `😀 @alice, tail` at caret 10 from the `Friend · alice` suggestion.
Changing the alias refreshed existing rows to `Bestie · alice` while the profile
link still targeted Alice. Spellcheck, emote ordering and IME behavior passed.
One explicit chatter request supplied Bob for completion without persisting Bob or
following the supplied next-page cursor. The fixture recorded zero provider writes.
This is browser verification, not live Twitch acceptance or a production deployment.
