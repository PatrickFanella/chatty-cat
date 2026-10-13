# Self-hosted image uploads (#30)

The owner selected Chatty Cat storage. Uploads are disabled until the server has a
dedicated writable `CHATTHING_UPLOAD_DIR`. No third-party image host is contacted.
Existing Twitch sessions authorize local uploads without extra Twitch scopes.

Choose **Upload image**, or paste/drop one image onto the message composer. The
local preview shows type, bytes, destination and expiry. **Upload reviewed image**
is the only upload action. Progress, cancellation and retry are available; retries
reuse an opaque ID so a lost response does not create another copy. Cancellation
may race server acceptance, so **My hosted images** lets the same account inspect
and delete accepted uploads. Deletion has a separate confirmation button.
**Insert hosted link** inserts into the current draft without submitting chat.
Account/channel changes, privacy and closing clear previews and pending insertion.

PNG/JPEG only: 5 MiB input and encoded output, 16 million pixels, 32 MiB/64 images
per account, 256 MiB/1,024 images total, and seven-day expiry. The server decodes and
re-encodes images to remove embedded metadata; JPEG quality becomes 90. SVG, GIF,
WebP, animation, arbitrary external upload URLs, custom form fields/headers and
native response templates are not supported by this owner-selected adaptation.
Original filenames and provider credentials are not stored or placed in links.

Hosted links are public and unpredictable, not access-controlled. Anyone with a
link can copy the image. Deletion/expiry cannot recall downloaded copies or remove
chat messages containing the link. Public responses use no-store caching and
nosniff/sandbox headers. Authentication, same-origin checks, CSRF and explicit
account identity protect upload/list/delete. Only owner receipts are listed.

## Storage and deployment

Run one application process against an exclusive directory. Upload data uses
0600 files under a rooted directory handle. Atomic promotion keeps incomplete
writes out of inventory; startup removes recognized interrupted pending files.
Unexpected files or corrupt receipts fail startup without deleting them. Expired
images stop being served immediately; physical cleanup happens on startup or the
next upload. Storage survives restarts, which still invalidate in-memory logins.
Back up this directory privately: receipts contain account IDs. Avoid backups that
republish deleted/expired images. Application rollback does not undo user uploads.

For the repository Compose deployment, create a dedicated directory owned by the
container user (see Dockerfile), set `CHATTHING_UPLOAD_HOST_DIR` privately, then use
`-f compose.yaml -f deploy/compose.uploads.yaml`. The override supplies the sole
writable upload mount while retaining the read-only root filesystem. Do not mount
an existing photo library or general data directory. Validate with
`docker compose ... config --quiet` without printing expanded secrets. The normal
Compose deployment stays disabled unless this override is selected.

This change prepares hosting; production mounting, release and live acceptance
have not happened. Do not point the test fixture at a production upload directory.

## Reproducible demo

1. Run `npm --prefix web run build`.
2. Run `UPLOAD_FIXTURE_DIR=/tmp/chatty-cat-disposable-upload-demo go run ./web/test-support/uploads`.
3. Open `http://127.0.0.1:5190/?channel=current&video=off` in a fresh local browser profile.
4. Use **Generate disposable PNG paste** or **Generate disposable PNG drop**.
   Review must show a local preview and no hosted receipt before explicit upload.
5. Upload, inspect **My hosted images**, then insert the link. Confirm the draft
   contains the link and no chat send occurred. The fixture has no Twitch transport.
6. Restart the fixture with the same dedicated directory. The same account's
   receipt must remain; open its URL to verify raster data. Review deletion and
   confirm it only for this disposable fixture. The URL must then return 404.

The built application passed generated paste/drop review, a real storage-handler
upload and explicit link insertion at caret 63 with zero provider writes. Server
race tests verify ownership, restart persistence, quotas, expiry, interrupted-file
recovery, same-ID retries and logout during body read. Frontend tests cover receipt
validation, size/type/dimensions, disabled configuration, late response isolation
and privacy cleanup. Browser file chooser selection was unavailable because the
Chrome extension's file-URL permission was disabled; no permission was changed.
