# Unicode Emoji 17.0

The picker contains all 3,944 fully qualified Unicode Emoji 17.0 sequences.
Names, categories, subgroups and release versions come from the pinned official
[Unicode data](https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt).
Existing curated search synonyms are retained alongside those names.

Use **Emoji category**, **Emoji skin tone** and the search field to narrow results.
Tone filters include no modifier, each of five tones and mixed-tone sequences.
**Emoji style** offers native font, local Twemoji images and text labels. Native
Unicode 17 glyph availability depends on browser/OS fonts; image and label styles
provide alternatives. The image style uses pinned local
[Twemoji 17.0.3 graphics](https://github.com/jdecked/twemoji/tree/v17.0.3).
A failed image becomes a literal name label with its original code points in the
title. No external image CDN is required for these emoji.

Style affects presentation only. Picker insertion sends the original Unicode
sequence to the draft; it does not substitute label names or asset URLs. Twitch
emote ranges continue to use original Unicode code points. Skin tones, variation
selectors and ZWJ sequences remain intact, and IME Enter is not intercepted.
Preferences belong to the local account and are included in reviewed workspace
settings and explicitly shared picker links.

The grid starts with 200 entries and caps at 600, plus at most 24 recents. Use
category/tone/search controls to reach remaining entries. Assets are loaded lazily;
each SVG is at most 64 KiB, the local set is about 10 MiB, and the service worker
retains at most 128 emoji images in a separate cache. Hosted user uploads bypass
all image caches so deletion and expiry remain effective.

## Provenance and reproduction

Unicode data and its license are in `scripts/data/unicode-17`. Twemoji graphics
are copied unchanged under CC BY 4.0, attributed to Twitter and other contributors
in NOTICE and the picker. The full graphics license is served with the assets.
`docs/emoji-sources.json` records source URLs, versions, archive/data SHA256,
entry counts, byte bounds and per-asset hashes.

Run `python3 scripts/generate-emoji-catalog.py /path/to/pinned-twemoji.tar.gz` to
regenerate. The generator checks both source hashes, count/byte bounds, valid
asset filenames, absence of SVG scripts/foreign content/external references,
and an image for every fully qualified catalog entry. Run frontend tests and the
production build, then verify category/tone filters, local image/label styles,
Unicode 17 search, intact insertion and preference reload in the built browser.

Built-app verification checked Unicode 17 distorted-face images, People & Body
and medium-tone ballet-dancer filtering, click and focused Enter insertion at
UTF-16 caret 8 (16 after a second insertion), label style and preference/draft
reload. A legacy workspace missing the new fields initially reset preferences;
the compatibility fix preserves saved profile choices, and the portable workspace
allowlist now retains these new fields without retaining unknown credential keys.
The message beside the emoji still used Twitch emote 25 with unchanged ranges.
The fixture recorded zero provider writes. Live production acceptance is separate.

For the built browser fixture, run `python3 web/test-support/emoji-browser-fixture.py`
and open `http://127.0.0.1:5185/?channel=current&video=off`. It supplies a synthetic
account and a public message with Unicode 17, a ZWJ/tone sequence and Twitch emote
25. It has no Twitch write transport.
