# Self-hosted Go + TypeScript architecture

## Requirements confirmed by the owner

- Rebuild in Go and TypeScript.
- Self-host the frontend and Go service together.
- Complete feature parity before switching away from the original app.

Keep the original UX and its dense, configurable chat presentation as the
reference. The migration preview is a transport exercise, not an approved
redesign. A framework is not required for the existing DOM-driven UI; the current
foundation uses TypeScript modules and Vite. Reassess component tooling when
porting the configuration panel, not as a prerequisite for chat transport.

## Ownership

Go owns external network operations: Twitch transport, authentication, emote and
badge metadata, recent-message recovery, stream information, and previews.
The browser owns presentation, filtering, rate graphs, UI settings, keyboard
interaction, local archive/history and cross-tab coordination.

One origin serves static assets and `/api` routes. Browsers connect to the Go
service directly. The replacement needs neither the externally hosted relay
iframe nor the original author's Cloudflare Worker.

The existing nested relay is an independent Git checkout. Do not accidentally
add its Git directory or deploy it as frontend assets. The rebuild resides in
the root repository; the relay checkout remains reference material.

## Transport and event model

The first checkpoint preserves IRC compatibility through a Go transport adapter.
The domain message keeps ID, command, channel, login, timestamp, text and tags.
Tags are necessary for replies, badge versions, moderation, emote positions,
USERNOTICE and room mode state; reducing messages to a username and text would
lose parity. TypeScript validates wire data before accepting it into its store.

The initial `/api/chat?channels=a,b` stream emits status and message events.
The protocol will expand with authenticated sending, channel metadata, emote
sets, previews and structured errors. Version it before publishing a stable API.
Keep transport-specific data behind adapters so EventSub can map into the same
domain without forcing a frontend rewrite.

Twitch recommends EventSub and the HTTP API for chat:
https://dev.twitch.tv/docs/chat/irc-migration/
The original app's anonymous viewing and client-like behavior need explicit
compatibility evaluation before choosing EventSub as the only transport.
Do not assume an IRC slash command, whisper or moderation button still works:
validate supported behavior against current Twitch APIs and real accounts.

## Authentication checkpoint

The owner registered the callback `https://chat.subcult.tv/api/auth/callback`
and stores credentials in the ignored root environment file. The Go service
implements authorization-code exchange, a browser-bound, single-use OAuth state,
validated client identity and scope, and an opaque HttpOnly/SameSite cookie
(Secure on HTTPS). Logout requires the configured origin and session CSRF value.
The browser receives login, user ID and CSRF only. This follows Twitch's
[authorization-code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/).

Sessions and pending states each have a 1,024-entry limit; auth handlers have a
16-request limit. Sessions last seven days in memory; restart requires login.
A cancellable worker checks tokens every thirty minutes with sixteen bounded
workers. A validation 401 triggers serialized refresh per session, followed by
identity/scope validation; failed validation ends that session. Twitch requires
[hourly validation](https://dev.twitch.tv/docs/authentication/validate-tokens/).
Real consent and domain routing remain unverified; messages and replies now use Helix with a sender derived from that session.
The same-origin send endpoint validates CSRF and message limits, serializes
refresh/sends per session, and retains the last 32 request outcomes. It retries
only an explicit unauthorized response after one validated refresh. Ambiguous
delivery requires checking chat; no automatic resend or optimistic echo runs.
The adapter follows Twitch's [send-message API](https://dev.twitch.tv/docs/api/reference/#send-chat-message).
Slash commands, whispers and moderator APIs remain open.

Do not reuse the original client ID, put Twitch tokens in browser localStorage,
log token values, or use a shared upstream identity for different users' sends.
Anonymous and authenticated session lifecycles remain distinct. Durable encrypted token/session
persistence is a deployment choice still to resolve; frontend settings and local
chat history stay client-side for parity.

## Provider services

Port the relay and preview worker into provider adapters in Go:

- Twitch native emotes, badge sets, VOD timing and stream/room status.
- 7TV, BTTV and FFZ globals, channel sets, animations and zero-width overlays.
- StreamElements usage seeds and recent-messages history.
- Generic metadata plus existing provider-specific preview behavior for YouTube,
  Reddit, GitHub, Wikipedia, Hacker News, Twitch, Imgur and Instagram.
- X/Twitter cards, Nitter selection, Giphy, and optional pronouns.

Share cached public metadata, coalesce duplicate requests, bound concurrency and
response size, enforce timeouts and handle partial failures. Never cache auth
responses with public provider data. Browser disconnect and service shutdown
must cancel downstream work.

Preview fetching must reject private destinations after DNS resolution and on
every redirect, including IPv6 and embedded credentials. An origin allowlist is
not a substitute for destination validation. Track this as a release acceptance
case rather than carrying over the original worker's hostname-only checks.

## Parity and migration

Work in independently verified increments:

1. Connection and domain foundation (this checkpoint).
2. Anonymous rendering parity: emotes, badges, moderation, replies and metadata.
3. Authenticated behavior: OAuth, sending, echoes, input history, room controls.
4. UI parity: configuration, themes, picker, panels, layouts and embedded media.
5. Local data: history, archive, stats, saved geometry, URL settings, cross-tab
   synchronization and explicit import of compatible original settings.
6. Provider preview parity, accessibility and lifecycle/performance checks.
7. Production packaging, regression verification and reversible cutover.

Add regression fixtures from the actual original behavior as modules migrate.
Use local integration servers for deterministic network tests. Compare browser
behavior on desktop/mobile, light/dark themes and representative channel speeds.
Test suspend/resume and reconnect after a backlog exceeds provider retention.
Live account checks are required for authenticated and moderator functionality.

Only switch when every required row in `parity.md` has implementation and
verification evidence. Retain original assets, routing and user storage for
rollback. Committing or serving this preview does not authorize a public cutover.

## Current limits

The first checkpoint is deliberately small. It has per-browser anonymous IRC
sessions and a 32-session cap. Backfill runs separately from live reads and is
cancelled/joined on disconnect. Public metadata requests have an eight-request
concurrency limit, in-flight coalescing, a 32 MiB/256-entry cache and stale fallback
after provider errors. Metadata handlers have a separate 16-request cap and join
service shutdown. Stream fields refresh every minute; emotes and badges
cache for ten minutes. The browser reuses existing row/image nodes but still
reorders the bounded log and applies moderation across it; the original
100,000-row option needs further work. These are explicit migration tasks, not
production scale or full-parity claims.
