# VOD-context browser demo

Use a fresh browser profile on the local fixture origin. This fixture supplies
synthetic public archive metadata and an account; it does not prove actual
Twitch media playback. Other provider APIs return 404. Production provider
verification uses the existing server-only app credential, not browser tokens.

From the repository root:

```sh
npm --prefix web ci
npm --prefix web run build
python3 web/test-support/vod-browser-fixture.py
```

Open `http://127.0.0.1:5193/?channel=one&video=off`. The fixture channel metadata
records a known archive from 2026-10-10 12:00Z to 14:00Z. Seed two public messages
in that tab's console:

```js
const db = await new Promise(resolve => {
  const request = indexedDB.open('chatthing-archive', 1);
  request.onsuccess = () => resolve(request.result);
});
const tx = db.transaction('messages', 'readwrite');
for (const [id, text, timestamp] of [
  ['vod-match', 'Matching archive message', Date.parse('2026-10-10T12:01:02Z')],
  ['outside', 'Outside known range', Date.parse('2026-10-10T14:00:00Z')],
]) {
  const message = {id, text, timestamp, channel:'one', command:'PRIVMSG', login:'alice', tags:{}};
  tx.objectStore('messages').put({key:'one:'+id, channel:'one', timestamp, message});
}
await new Promise(resolve => { tx.oncomplete = resolve; });
db.close();
location.reload();
```

1. Open Archive, search `text:"Matching archive message"`, then VOD context.
   The preview displays UTC and your named local timezone. It creates no player
   and makes no verification request until Verify archive is clicked.
2. Verify archive. The fixture verifies an estimated offset of `0h1m2s`.
   Load VOD player performs a second check, then creates the official iframe
   with `video=v123`, the current hostname as `parent`, `time=0h1m2s`,
   `autoplay=false` and `muted=true`. Use native controls; this fixture video
   ID is synthetic and may not be playable. Closing removes the frame.
3. Bookmark the matching public message, add a private note and Save. Choose
   VOD context for saved bookmark. The same timestamp/range preview opens;
   the note is absent from both the preview and the channel/video request.
   VOD navigation does not replace the main chat context or reader position.
4. Search `text:"Outside known range"`, then VOD context. An archive's end
   boundary is exclusive: no matching range, offset or Load action is offered.
5. Simulate a deleted/unavailable archive in the console:

```js
await fetch('/fixture/deleted');
```

6. Reopen matching VOD context and Verify: the missing/no-longer-public notice
   leaves Load disabled and removes any old external link/frame. Restore with
   `await fetch('/fixture/available')`. Load a frame again, then enable privacy:
   the frame, timing preview and selected candidate clear. Account switching
   has the same cleanup; tests also cover a pending response arriving afterward.

Stop the server with Ctrl+C. The API regression suite checks real Go handler
validation, ownership, unavailable IDs, cache failure and bounded concurrency
with deterministic providers. Live acceptance after deployment should use a
retained message inside a still-public, playable archive, review its estimated
offset, play/seek with Twitch controls, and close the player.

The iframe follows [Twitch's video embed contract](https://dev.twitch.tv/docs/embed/video-and-clips/),
including its video prefix, parent, time and minimum 400×300 dimensions. VOD
verification uses the [Get Videos response](https://dev.twitch.tv/docs/api/reference/#get-videos)
for archive identity, owner, creation time and duration. Creation-time mapping
is an estimate; these metadata fields do not prove exact chat/video alignment.
