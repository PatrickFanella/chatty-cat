# Self-hosted Go + TypeScript architecture

## Requirements confirmed by the owner

- A Go service with a TypeScript frontend.
- Self-host the frontend and Go service together.

A framework is not required for the DOM-driven UI; the frontend uses TypeScript
modules and Vite.

## Ownership

Go owns external network operations: Twitch transport, authentication, emote and
badge metadata, recent-message recovery, stream information, and previews.
The browser owns presentation, filtering, rate graphs, UI settings, keyboard
interaction, local archive/history and cross-tab coordination.

One origin serves static assets and `/api` routes. Browsers connect to the Go
service directly. No externally hosted relay iframe or third-party worker is
involved.

## Transport and event model

The first checkpoint preserves IRC compatibility through a Go transport adapter.
The domain message keeps ID, command, channel, login, timestamp, text and tags.
Tags are necessary for replies, badge versions, moderation, emote positions,
USERNOTICE and room mode state; reducing messages to a username and text would
lose that information. TypeScript validates wire data before accepting it into its store.

The initial `/api/chat?channels=a,b` stream emits status and message events.
The protocol will expand with authenticated sending, channel metadata, emote
sets, previews and structured errors. Version it before publishing a stable API.
Keep transport-specific data behind adapters so EventSub can map into the same
domain without forcing a frontend rewrite.

Twitch recommends EventSub and the HTTP API for chat:
https://dev.twitch.tv/docs/chat/irc-migration/
Anonymous viewing relies on IRC, so evaluate it before making EventSub the only
transport.
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

Use only Chatty Cat's registered client ID. Do not put Twitch tokens in browser localStorage,
log token values, or use a shared upstream identity for different users' sends.
Anonymous and authenticated session lifecycles remain distinct. Durable encrypted token/session
persistence is a deployment choice still to resolve; frontend settings and local
chat history stay client-side.

## Provider services

Go provider adapters cover:

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
not a substitute for destination validation, and hostname-only checks are not
enough. Track this as a release acceptance case.

## Verification

Add regression fixtures as modules change. Use local integration servers for deterministic network tests. Compare browser
behavior on desktop/mobile, light/dark themes and representative channel speeds.
Test suspend/resume and reconnect after a backlog exceeds provider retention.
Live account checks are required for authenticated and moderator functionality.

## Current limits

The first checkpoint is deliberately small. It has per-browser anonymous IRC
sessions and a 32-session cap. Backfill runs separately from live reads and is
cancelled/joined on disconnect. Public metadata requests have an eight-request
concurrency limit, in-flight coalescing, a 32 MiB/256-entry cache and stale fallback
after provider errors. Metadata handlers have a separate 16-request cap and join
service shutdown. Stream fields refresh every minute; emotes and badges
cache for ten minutes. The browser reuses existing row/image nodes but still
reorders the bounded log and applies moderation across it; the 100,000-row
option needs further work.
