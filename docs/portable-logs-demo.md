# Portable logs and retention demo

Run from the repository root in a fresh browser profile:

```sh
npm --prefix web ci
npm --prefix web run build
python3 web/test-support/logs-browser-fixture.py
```

Open `http://127.0.0.1:5195/fixture/seed` and select **Seed and open portable logs
demo**. Seeding replaces only this fixture origin's public archive, stream
observations and retention policy. It creates 1,005 equal-time records in `one`,
one record in `two`, deletion/timeout/subscription notices and one directly stored
private record that archive readers must reject. The fixture has no Twitch writes.
Its other API requests return 404; connection/provider errors are expected.

1. Open **Export logs**, then **Preview recovery export (all archived channels)**.
   Check the selected range, global retained bounds, group labels and exact size.
   Preview does not enable download until preparation succeeds. JSON part 1 has
   1,000 public records; **Preview next log part** produces nine more and disables
   further paging. Download each part before preparing the next.
2. Inspect both JSON files. Together they contain 1,009 unique channel/message
   identities and no `sentinel_` strings or WHISPER command. Deleted/timed-out
   `one` messages have removed bodies; the `two` message remains readable. The
   coverage notice explicitly excludes closed-page gaps and full-session claims.
3. Choose text output and local timestamps; prepare recovery again. The file
   contains a named timezone and UTC offset, **Timeout bob for 600 seconds**,
   **Deleted message row-0001**, and **Alice subscribed · Public user notice**.
   UTC and epoch modes are also available. The body preview is capped at 20,000
   characters; range, coverage and size describe the whole prepared part.
4. Close portable logs, open archive search, select the first JSON file, then
   use the existing Import action. Reimport preserves channel/message identities:
   the stored row count stays 1,010 in this fixture, including the hidden invalid
   private row. Recovery uses the current retention policy; reducing that policy
   also limits subsequent imports.
5. After saving both recovery parts, set Maximum retained archive rows to 1,000.
   **Preview retention and capacity** reports ten eligible removals and a capacity
   warning. No rows are removed until **Apply reviewed retention**. Applying
   leaves 1,000 rows and invalidates any previously prepared export. Preview again
   should report zero eligible removals. Age choices are no limit or 7/30/90 days;
   unit tests cover age enforcement and policy-storage failure.

Changing channel/date/output/timestamp controls disables the prior download.
Account changes and privacy close the panel, clear previews and cancel pending
reads. Public archived logs remain usable when login status is unavailable.
Tests cover delayed preparation and retention-plan races; a changed archive
requires a new retention preview. Controls affect only the local public archive.

Known archive ranges group retained metadata without a provider availability
check. Live-poll groups end at the last actual observation, with offline/long
gaps unassigned. Browser and provider clocks can differ. Each part is prepared
separately, so live additions or retention changes can alter later parts. These
checks demonstrate local behavior, not production deployment or Twitch acceptance.

Stop the fixture server after testing. Frontend verification:

```sh
npm --prefix web test
npm --prefix web run build
```
