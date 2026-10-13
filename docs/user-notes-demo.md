# Private user note demo

Use the [account profile fixture](account-profiles-demo.md):

```sh
npm --prefix web ci
npm --prefix web run build
go run ./web/test-support/profiles
```

Open `http://127.0.0.1:5196/fixture/seed` in a fresh browser profile, seed the
fixture and consent as Alice through Accounts. The fixture serves synthetic public
user ID `100` and real local OAuth handlers; it performs no Twitch reads or writes.

1. Click a chat username. The user card includes **Private note · local annotation**.
   Enter `<script>private_user_note_sentinel</script>` and select **Save private
   user note**. Reopen the card: the exact text remains, with no script element or
   execution. Hover cards also offer the editor once a stable public ID is available.
   Missing/conflicting IDs refuse note association; imported excerpt IDs require
   public profile lookup rather than trusting the imported tag.
2. Open **User notes → Preview private user notes backup**, review the contents,
   then **Download reviewed user notes**. The observed native file was 240 bytes
   for one fixture note, with account ID, stable subject ID, login, text and update
   time. Unknown imported fields are discarded. The maximum valid backup is 1 MB.
3. Open **Export logs** and download a reviewed public recovery part. The observed
   90,605-byte file held 400 public rows and no private note sentinel. Notes are
   held in a separate account store and never passed to public chat/statistics.
4. Preview and download a private backup before **Preview delete all user notes**,
   then **Delete reviewed user notes**. Select the saved file, review the import
   preview and use **Import reviewed user notes**. Existing user IDs are kept,
   never overwritten; the current account must match the backup. Individual cards
   also have **Delete this user note**. Neither action affects public archive rows.
5. Navigate to the fixture seed page, then choose **Rename public fixture user**
   without seeding again. This changes the public login while retaining ID `100`.
   Reopen the renamed user's card: the same note appears, with one saved entry.
   Saving refreshes the stored login label; note identity remains the numeric ID.
6. Add Bob through Accounts. His card editor starts empty for ID `100`. Importing
   Alice's file is refused before its private contents appear. Save/delete Bob's
   own note, then switch back to Alice: Alice's note remains unchanged.
7. Prepare Alice's private backup, then activate privacy. The panel closes, the
   preview is empty, download is disabled and private card editors are removed.
   Account changes cancel pending import/profile reads and clear the same state.

Limits are 200 subject IDs, 2,000 UTF-16 text characters per note, and 1 MB of
serialized backup data per account. Size/quota failures preserve prior notes;
capacity refuses additions rather than evicting notes. Notes remain until explicit
deletion and are independent of public archive retention. Forgetting an account
name preserves its private notes for a later reconnect. There is no cloud sync.

Tests cover stale edits, malformed/cross-account imports, duplicate-safe restore,
byte/count limits, storage failure, renamed identities, delayed imports, conflicting
public IDs and old moderation-response cleanup. These are local fixture checks;
real Twitch consent and production deployment remain unverified. The account profile foundation is merged in PR #70.
