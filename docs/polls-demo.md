# Broadcaster poll fixture

Build `npm --prefix web run build`, then run `go run ./web/test-support/polls`.
Open `http://127.0.0.1:5200/fixture/seed` in an isolated browser profile and seed
synthetic history. Sign in as broadcaster one. Open Moderation, grant broadcaster
poll consent and select broadcaster one again. No real Twitch calls occur.

1. Refresh/reconnect broadcaster polls. Set title, two choices and duration; optional
   Channel Points votes cost 1–1,000,000 per additional vote. Preview new poll:
   `/fixture/stats` still reports zero writes. Confirmation starts it immediately.
2. The panel displays ACTIVE, exact provider poll ID and vote counts.
   End previews early termination with public results. Confirm returns TERMINATED.
3. Create another poll. Close and reopen Moderation, then refresh/reconnect;
   the active provider poll is restored without creating another.
4. Preview end and archive. Set `/fixture/mode?value=uncertain` before confirming.
   The receipt remains uncertain and no automatic retry occurs. Refresh provider
   state explicitly before reviewing another action. Set mode to `confirmed`,
   preview archive again and confirm: ARCHIVED removes public poll visibility.
5. Read failures and non-broadcaster identity remain readable; unavailable state
   clears staged actions. Switching account/channel, privacy or closing clears
   private state. Live polling stops on closure or uncertainty.

`rejected` mode returns a provider permission refusal. Tests cover malformed
acknowledgements, CSRF, account/identity guards, replay and stale active IDs.
The synthetic fixture does not simulate natural expiry or actual votes. Real
acceptance needs an approved eligible broadcaster channel. Command aliases remain
planned; use the explicit panel controls for this demo.
