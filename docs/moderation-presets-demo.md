# Moderation preset demo

Start the [moderation fixture](moderation-workspace-demo.md), sign in as moderator,
open Moderation, and refresh viewer history. No fixture request goes to Twitch.

1. Select **1. Timeout 1 minute**. The review shows `/timeout viewer 60`, target
   ID `456`, channel ID `123` and required scope. `/fixture/stats` still shows no
   writes. The preset only stages a review; it does not confirm it.
2. In **Ordered moderation preset definitions**, enter:

   ```json
   [
     {"name":"Ban review","template":"/ban {user} review"},
     {"name":"Short timeout","template":"/timeout {user} 3"}
   ]
   ```

   Preview definitions, review the replacement scope and order, then save. The
   quick buttons now show Ban review first and Short timeout second. Invalid
   commands, literal user/message targets, unknown placeholders, excessive lists
   or malformed JSON fail without changing saved definitions.
3. Refresh context, focus a button, then press Alt+Shift+2. The staged command is
   `/timeout viewer 3`, with zero writes until **Confirm reviewed moderation
   action**. The native fixture observed exactly one write and a confirmed private
   receipt after confirmation. Shortcuts are disabled in editable fields, privacy,
   during an active request, while composing IME text, and after closing the modal.
4. Preview/export the saved presets and download the reviewed file. The native
   two-preset backup was 338 bytes. Paste its JSON into **Moderation preset import
   JSON**, preview the replacement, then save. The account, workspace and channel
   must match. Changing either editor invalidates the pending save/export preview.
5. Close/reopen or reload: order and durations persist. Change channel, workspace
   or account: those scopes have their own definitions/defaults. Cross-scope import
   is refused; privacy/account changes clear transfer fields and disable download.
   A definition changed in another tab requires reopening before a stale save.

These checks exercise local preset configuration. Provider rejection and uncertainty
use the existing journal tests and fixture modes; no live moderation acceptance is
implied. Real writes still require an approved channel, target and action.
