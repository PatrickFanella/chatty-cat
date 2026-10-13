# Safe link previews and selection search (#44)

Open **Link preferences**, edit, review and apply. Preferences stay with the local
account profile; saving rejects another account or a concurrent browser-tab edit.
Automatic previews, remote thumbnails/icons, emote-image tooltips and selection
search are off initially. Changes do not fetch a URL or submit a search.

A **Preview** button offers **Fetch this preview once** without enabling automatic
previews. Enabling automatic previews permits remote metadata lookup; hover/focus
also requires the tooltip option. Enabling thumbnails permits additional browser
image-host requests and exposes the browser IP, as disclosed in the review.
General and stream preview widths accept 80–640 px. Media players require a
separate click. Lowercase-domain display preserves URL path/query case and
existing tracking-parameter cleaning. URL authorities are normalized by the URL
parser regardless of display preference.

Double-click policy suppresses ordinary pointer opening while preserving Enter
and modified clicks. A blocked-new-tab fallback notice explains Enter activation.
The web app opens ordinary tabs; it cannot promise incognito/private windows.
Emote and badge tooltip images have a separate option and size bound.

With explicit resolution enabled, **Resolve link** first reviews the destination,
then **Resolve this public URL** requests metadata from the protected preview
service. The final URL is shown as a separate safe link and is never opened
implicitly. This uses the existing public-address-pinned transport, four-redirect
bound, timeouts, concurrency limits and caller rate budget. Turning resolution off
removes this action; an explicitly approved ordinary preview can still follow
redirects to retrieve its metadata and always discloses the redirected destination.

Enable selection search, select 1–1,000 characters entirely within public chat,
and choose **Search selected chat text**. A dialog shows the exact text and search
engine origin before its **Open search** link. Search templates accept exactly
one `{query}` placeholder, HTTP(S), no URL credentials, and bounded labels/URLs.
The selection is URI-encoded, kept only in memory and erased on close/privacy.
No selection from private notes or another page surface is accepted. The user's
browser controls whether an ordinary new tab opens; a native link remains usable
without a programmatic popup or a private-window claim.

Privacy mode closes previews, aborts requests, clears preview caches and selection
reviews, suppresses image tooltip activation, and refuses these link actions.
A late response cannot restore a hidden preview. This does not remove emotes
already displayed in public chat or recall external requests already accepted.

## Verification

Run `npm --prefix web test -- --maxWorkers=1`, `npm --prefix web run build`, and
`go test -race ./internal/preview ./internal/server`. Focused tests cover consent,
privacy-late responses, disabled hover, search encoding, public selection bounds,
malformed templates, account/stale-save guards, double-click/Enter behavior and
blocked popups. Existing backend fixtures cover malformed URLs, redirect-to-private
networks, DNS rebinding, provider failure, metadata bounds and public fetch budgets.
The built application verified zero requests before preview consent, Enter activation,
redirect disclosure, reviewed local settings, 160 px preference persistence after
reload, encoded selection review, explicit resolution and privacy-disabled search.
The fixture recorded zero provider writes. Thumbnail image rendering is covered by
component tests; production provider acceptance remains separate.

For the browser fixture, run `python3 web/test-support/safe-links-browser-fixture.py`
after building, then open `http://127.0.0.1:5186/?channel=current&video=off`.
It supplies a synthetic account, public chat, preview responses and selection
control. `/fixture-count` reports accepted preview requests and provider writes.
It does not use production credentials or real Twitch chat.
