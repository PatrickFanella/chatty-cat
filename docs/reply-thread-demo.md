# Reply-thread browser demo

Use a fresh browser profile for this synthetic fixture. It writes only the local
public archive and local workspace state; the server supplies a synthetic account
and returns 404 for provider APIs. Do not use your production chat origin.

Run from the repository root:

```sh
npm --prefix web ci
npm --prefix web run build
python3 web/test-support/threads-browser-fixture.py
```

Open `http://127.0.0.1:5192/?channel=one,two&video=off`. In that tab's browser
console, seed a root, replies and a missing parent into native IndexedDB:

```js
const db = await new Promise(resolve => {
  const request = indexedDB.open('chatthing-archive', 1);
  request.onsuccess = () => resolve(request.result);
});
const tx = db.transaction('messages', 'readwrite');
const messages = [
  ['root', 'alice', 'Root conversation', {}],
  ['reply', 'bob', 'First reply', {'reply-parent-msg-id': 'root', 'reply-thread-parent-msg-id': 'root'}],
  ['orphan', 'bob', 'Missing parent reply', {'reply-parent-msg-id': 'gone', 'reply-thread-parent-msg-id': 'root'}],
];
messages.forEach(([id, login, text, tags], index) => {
  const message = {id, login, text, tags, channel: 'one', command: 'PRIVMSG', timestamp: Date.now() + index};
  tx.objectStore('messages').put({key: 'one:' + id, channel: 'one', timestamp: message.timestamp, message});
});
await new Promise(resolve => { tx.oncomplete = resolve; });
db.close();
location.reload();
```

1. Pause/scroll the main chat. Click Thread on the root or reply. The sidebar
   shows three rows, two unread replies and `Missing parents: gone`. The main
   visible message stays anchored when the sidebar opens and hides.
2. Mark thread read, hide it and reload. Reopen Threads: the view persists with
   no unread replies. Click Reply to bob: the composer stages a reply without
   submitting it. Search `First`; only that matching row appears. Clear search,
   preview public context, then inspect the exact text before Copy.
3. In the console, inject a synthetic reply through the existing local echo bus:

```js
const channel = new BroadcastChannel('chatthing:v1:sent');
channel.postMessage({type: 'message', replay: false, message: {
  id: 'live-reply', channel: 'one', command: 'PRIVMSG', login: 'charlie',
  text: 'New observed reply', timestamp: Date.now(),
  tags: {'local-echo': '1', 'reply-parent-msg-id': 'root', 'reply-thread-parent-msg-id': 'root'},
}});
channel.close();
```

4. The thread gains one row and one unread reply. Repeat the injection with the
   same ID: counts stay unchanged. Reload: the row and unread count persist.
   Open Thread on another public message to keep multiple views; switching views
   does not replace the main chat context.
5. For moderation, insert a later `CLEARMSG` record with
   `tags: {'target-msg-id': 'reply'}` into this channel's archive as above, then
   Refresh retained thread. That row reads `[removed message]`; searching its
   original text no longer finds it and the copy preview excludes it. A clear
   in channel `two` must not redact channel `one`.
6. Toggle privacy mode: sidebar/search/preview content clears. Disable privacy
   and reopen the saved view. Model/UI tests cover pending account changes and
   workspace isolation without requiring a provider login.

Stop the fixture server with Ctrl+C. This verifies the local browser behavior;
Twitch sends and production deployment require separate acceptance checks.
