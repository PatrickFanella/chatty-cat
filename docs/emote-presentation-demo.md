# Emote presentation controls

Provider and badge preferences now includes four more reviewed profile-local controls. Old preferences receive additive defaults; common-preference sync accepts the selected values.

- Unlisted 7TV emotes stay hidden unless explicitly enabled. The server preserves listed status from the public catalog and excludes Twitch-disallowed emotes regardless of the toggle. Filtering an unlisted winner retains the next enabled provider match. Native Twitch tag ranges still take precedence. Older server payloads without visibility annotations remain compatible.
- Remove visual spaces between emotes hides only horizontal whitespace tokens between two recognized emotes. The whitespace remains in the DOM, and message records, archive text and native positions are unchanged. Ordinary surrounding text and line breaks stay intact.
- Scale emotes by chat line height uses the active view’s line height and the existing 0.5–3 scale. The default uses fixed baseline image sizes with the same scale. Zero-width overlays follow their base image’s height rather than applying the scale twice.
- Tooltip scale is 0.5, 1, 1.5 or 2 (Small, Medium, Large, Huge), using a 96 px browser baseline. It affects only the already-consented emote/badge image card and cannot exceed the separately selected image width. It does not enable image tooltips or remote link previews.

Reproduce with `npm --prefix web run build` and `python3 web/test-support/provider-browser-fixture.py`, then open http://127.0.0.1:5192/?channel=current&video=off. Enable FFZ channel emotes if this profile previously disabled them. The fixture supplies an explicitly unlisted name, a native tagged Kappa, normal emotes and zero-width overlays. Review/apply unlisted visibility, spacing and line-height scaling at scale 2. Enable emote image tooltips separately in Link preferences before hovering an emote. Disable each control and reload to check persisted opt-out. No chat or provider activity write is needed.

Native T3 preview on 2026-10-13 observed zero unlisted images before opt-in and one after, zero-width whitespace spans retaining their text, and 50.39 px emotes at a 25.2 px line height with scale 2. Overlay height matched the base at 50.39 px. After separate image-tooltip consent, scale 2 produced a 192 px card image bounded by the 240 px width preference. The fixture’s provider-write counter stayed zero.

Regression coverage includes provider precedence, visibility metadata and disallowed flags, native ranges, source text, overlays, tooltip bounds, preferences and portable sync compatibility. Full checks are recorded in the PR. This does not establish positive live 7TV catalog acceptance or complete the remaining provider/cosmetic preferences.
