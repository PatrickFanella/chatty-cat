# Milestone 5 progress

M5 starts from merged main `857a413`. M4 remains open for #32's controlled live event acceptance; starting independent M5 work does not waive that gate.

| Issue | State | Next acceptance |
| --- | --- | --- |
| #35 desktop playback | Implemented paired Go helper and reviewed web launch; local browser/child-process verification | PR merge, desktop installation and real-stream playback; Linux/Windows native checks |
| #36 watched-channel browser companion | Planned | Narrow-permission extension, explicit pairing/workspace preference and revocation |
| #37 sandboxed web extensions | Planned | Versioned capabilities, isolated bounded runtime and example |
| #38 owner-configured IRC relay | Planned | Approved TLS endpoints/credentials, isolated protocol identity/history and panes |
| #47 paired desktop overlay | Planned | Native window host, recovery/geometry/account checks and platform limits |

See [desktop playback setup, boundaries and demo](desktop-playback-demo.md). The playback contract is reusable by a desktop shell; an embedded Streamlink pane is not implemented by an external-player launch.
