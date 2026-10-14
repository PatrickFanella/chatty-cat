# Owner-configured TLS IRC relay

The relay is disabled until the owner supplies `CHATTHING_IRC_CONFIG`, a path to a JSON array of approved endpoints. Each entry belongs to one signed-in account, with a separate IRC nickname. The browser selects a configured network ID; it cannot supply a host, port, password or another account's identity.

Example configuration (replace the endpoint, account ID and channel with approved values):

```json
[
  {
    "id": "community",
    "name": "Community IRC",
    "host": "irc.example.org",
    "port": 6697,
    "account": "42",
    "nick": "ExampleNick",
    "channels": ["#community"],
    "passwordEnv": "COMMUNITY_IRC_PASSWORD"
  }
]
```

`passwordEnv` is optional. When present, the named server environment variable must contain the network's PASS credential. Credentials and endpoint details are never returned to the browser. Invalid or missing configured credentials fail startup. No configuration means no outgoing IRC connections.

The relay requires verified TLS certificates, public destinations and a maximum of eight networks and eight approved channels per network. DNS answers are checked before dialing their resolved IPs, retaining the configured hostname for TLS verification. Private, loopback, link-local, shared-address and reserved destinations are rejected. TLS verification cannot be disabled through configuration or client requests.

## Supported conversations

Open **IRC conversations** in the main workspace, load the current account's networks, then review and confirm connecting. Registration submits PASS when configured, NICK, USER and approved channel joins. The pane renders channel messages, private PRIVMSG/NOTICE and ACTION text. The target field selects an approved channel or a valid private recipient. Connect, join, part, disconnect and send require explicit review; edited message/target fields invalidate the review.

IRC uses the shared virtual log and search engine with IRC case folding. Supported search fields are text, sender, channel, regex, after and before. IRC records never enter Twitch history, settings sync or extension context, and Twitch-only predicates are refused. Reader position follows the virtual log's existing scroll behavior within the pane; it is not saved across closing the pane. Popouts and overlays do not expose the IRC control.

Only the latest 500 records per configured network remain in server memory. Disconnect and explicit reconnect may retain these records; process restart clears them. Account changes and privacy mode clear the browser pane and drafts. Close, privacy mode and page exit request disconnect; the server closes an unrefreshed browser lease after 30 seconds, checked every five seconds. Multiple tabs for the same account share one network connection, so closing one pane can disconnect the other.

A successful socket write is **submitted**, not confirmed delivery. An observed same-nick echo reconciles the recent submitted row. A write failure is **uncertain** and ends the connection. Retrying that exact request can retrieve its stored receipt without sending again; a different body or connection epoch is rejected. There is no automatic reconnect or resend. Limits are 400 UTF-8 bytes per message, 20 sends per minute and 32 send receipts per connection; reconnect explicitly after reaching the receipt limit.

SASL, IRCv3 capability negotiation/history, nick changes, arbitrary raw commands, channel keys, topics, user lists, DCC, persistent archives and Chatterino Lua plugins are unsupported. Networks requiring SASL cannot be accepted through PASS alone. Join/part submission does not confirm channel membership; server rejection numerics are not a membership model in this slice.

## Reproducible checks and owner acceptance

Run from the repository root:

```sh
go test -race ./internal/ircrelay ./internal/auth
npm --prefix web test -- src/irc-relay.test.ts src/irc-relay-ui.test.ts
npm --prefix web run build
```

The controlled TLS test starts a local certificate-verified fixture using a test-only dialer, registers, joins, receives a private message and sends a reply. Production endpoint validation remains enabled. Other regressions cover account/session/CSRF isolation, strict HTTP bodies, duplicate-send receipts, uncertain outcomes, echoed-row reconciliation, keepalive deadlines, reviewed UI actions and account changes. These fixtures do not connect to a real IRC network.

Local verification on October 13, 2026 passed the full Go race suite and vet, 751 frontend tests, the additional reviewed-action UI test, and the strict production build. A native browser opened the IRC dialog on the Vite development page and refused anonymous network loading with confirmation disabled. No authenticated owner-network action was exercised in that browser check.

For owner acceptance, approve an endpoint, permitted channels and a dedicated nick/credential first. Start the server with that configuration, sign in as its configured account, and use a second IRC client to observe joins, send a channel message and a private reply. Verify echo/receipt behavior, explicit reconnect, close/lease timeout, account switching and privacy clearing. Confirm that another signed-in account sees no configured network or records. Record the endpoint approval and dated results without credential values. Live owner-network acceptance remains pending; no public network or credential has been selected for this implementation.
