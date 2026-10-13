# Clip, marker and broadcaster fixture

Build `npm --prefix web run build`, then run
`go run ./web/test-support/broadcaster`. Open
`http://127.0.0.1:5202/fixture/seed` in an isolated browser profile. Sign in as
broadcaster one, open Moderation, grant clip/broadcaster/commercial consent and
select broadcaster one again. This fixture never contacts Twitch.

1. Refresh broadcaster context. Preview clip: zero writes and no links.
   Confirm once. Only a subsequent matching published-clip response exposes clip
   and edit links. The real API may take up to 60 seconds to publish.
2. Select marker, enter a description and preview. Wait one second after the
   previous confirmed action; local rate refusal does not write to the provider.
   Confirm shows the exact marker ID and stream position; the creation timestamp is validated.
3. Select settitle, enter a new title and preview. Confirmation requires a matching
   provider readback. Refresh context to see the resulting title.
4. Select setgame and search Fixture category. Two names are identical; select
   ID 101 explicitly, then preview `/setgame id:101`. Confirm requires matching
   category readback. An ambiguous name alone cannot choose a target.
5. Select commercial, preview 30 seconds and confirm. The provider response reports
   a 480-second cooldown and that actual served duration may differ. A separately
   reviewed second request during cooldown is rejected before a provider write.
6. For uncertainty, select marker and preview. Set
   `/fixture/mode?value=uncertain` before confirmation. The private receipt remains
   uncertain, links are absent and no retry occurs. Check Twitch/refresh explicitly
   before another action. `rejected` mode exercises provider permission refusal.
7. `offline` mode disables clip, marker and commercial eligibility. Title/category
   changes remain available to the broadcaster while offline. Changing actor,
   target stream or metadata revision blocks stale actions. Privacy/closure clears
   private forms, results and links; public composer drafts remain intact.

Composer `/clip`, `/marker`, `/settitle`, `/setgame` and `/commercial` commands open
this review path; they do not send directly. Tests cover unsafe URLs, wrong marker
acknowledgement, unpublished clip/cancellation without repeat capture, identities,
scopes, stale metadata, category ambiguity and cooldown. Editor membership/writes
are explicitly unavailable; only broadcaster markers are supported. Live M3 checks
are owner-authorized, but shared-browser Twitch login/consent is still required.
