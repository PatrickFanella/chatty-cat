# Chatterino import — supported browser adaptation

Import reads local Chatterino 2.5.6 `settings.json`, `window-layout.json` and
`commands.json` files. Files are optional and stay in the browser. The parser
allowlists supported fields and builds public workspace copies; it never executes
command templates or copies account credential fields. Source text is cleared on
close, successful save and streamer privacy activation. Originals stay saved.

The schemas were checked against upstream
[settings](https://github.com/Chatterino/chatterino2/blob/v2.5.6/src/singletons/Settings.hpp),
[layout encoding](https://github.com/Chatterino/chatterino2/blob/v2.5.6/src/singletons/WindowManager.cpp)
and [command serialization](https://github.com/Chatterino/chatterino2/blob/v2.5.6/src/controllers/commands/Command.hpp).
The [upstream settings guide](https://wiki.chatterino.com/Settings/) identifies the
three files and warns that settings can contain login tokens. No real credentials
are needed for the demo.

## Mapping and limits

- Appearance maps supported timestamp formats, selected message/reply visibility,
  separators, alternating backgrounds and bold usernames. Qt point sizes map to the
  nearest supported browser pixel size at an approximate 96-DPI conversion. Known
  native font families map to a browser font stack; this does not promise identical
  font metrics. Unsupported sizes, fonts and formats are reported and excluded.
- Each source window becomes a new named workspace. `splits2` Twitch leaves become
  ordered panes; tab titles and selected tabs are retained. OS geometry, popup
  semantics, vertical nesting, native filters, private/special channels and split
  spelling/moderation overrides are excluded and reported. The target layout still
  enforces six panes per tab, eight tabs, 24 panes and current workspace channel
  limits. Supported channels are never silently truncated to fit.
- Compatible text commands retain supported placeholders. Existing definitions win
  on trigger conflicts; native execution commands and unsupported placeholders are
  excluded. Definitions become part of the new workspace snapshot. Switching
  restores that snapshot's definitions; switching back restores the saved original
  definitions. Import itself changes no active commands or drafts.
- Inputs are at most 256 KiB each / 512 KiB combined, with 16,000 JSON nodes and
  depth 16. Prototype keys, malformed supported data, duplicate commands and target
  capacity violations refuse the import. At most 20 saved workspaces / 256 KiB
  remain supported. Saving the copies uses one guarded local-storage write; stale
  views, external workspace edits, account changes and quota failure cannot leave
  partial imported copies.

Unknown/native settings are excluded as a group; their values are not echoed in
the report. Recovery export includes validated workspace settings and command text,
which the owner should review for private strings before sharing. It excludes
source files, account credentials, message history and drafts.

## Reproducible demo

1. Save an original workspace with a `/keep` command and an unsent channel draft.
2. Open **Import Chatterino** and choose or paste these fixture files:

```json
{"appearance":{"currentFontSize":12,"messages":{"showTimestamps":false,"separateMessages":true}},"accounts":{"token":"fixture-secret-never-save"}}
```

```json
{"windows":[{"type":"main","x":123,"tabs":[{"title":"Friends","selected":true,"splits2":{"type":"horizontal","items":[{"type":"split","data":{"type":"twitch","name":"one"},"flexh":1},{"type":"split","data":{"type":"twitch","name":"two"},"flexh":2}]}}]}]}
```

```json
{"commands":[{"name":"/hello","func":"Hello {1+} in {channel.name}"},{"name":"/shell","func":"/exec fixture-script-never-save"}]}
```

3. Review the before/after report. No new workspace is saved yet. Preview and
   download the recovery export; it retains `/keep` and omits both canary values.
4. Save the imported copies. The current channel, draft and active command remain.
5. In Workspaces, review and apply the switch to the imported workspace. Its two
   panes, presentation and `/hello` definition load. Review and switch back: the
   original channel, draft and `/keep` definition return.

Native shared-preview verification on October 13 completed this flow in the built
application. The recovery download was 8,108 bytes and was parsed to verify its
original workspace and command. The fixture provider POST count stayed zero.
The synthetic fixture does not establish live Twitch message delivery or deployment.

Verification: 12 focused parser/UI tests, all 604 frontend tests, strict TypeScript
and production build pass. Tests cover limits, malformed fields, credential/script
canaries, account/stale-view guards, external workspace edits, quota failure and
privacy cleanup. Browser switching additionally verifies command and draft recovery.
