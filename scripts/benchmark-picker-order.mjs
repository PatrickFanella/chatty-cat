import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { familyCompare } from "../web/src/picker-order.ts";
import { EMOJI_DATA_URL } from "../web/src/emoji-data-source.ts";

const data = JSON.parse(
  readFileSync(new URL("../web/public" + EMOJI_DATA_URL, import.meta.url)),
);
const values = data.entries
  .map((entry) => entry.code)
  .concat([
    "FeelsGoodMan",
    "PeepoHappy",
    "FeelsBadMan",
    "peepoSad",
    "KKona",
    "Éclair",
    "eclair",
    "123Go",
    "A_B",
    "áb",
    "aB",
    "I",
    "ı",
    "İ",
  ]);
const previous = (a, b) => {
  const stem = (s) =>
    (
      s.match(/^[a-z]+|^[A-Z](?![a-z])[A-Z]*|^[A-Z][a-z]+|^[0-9]+/)?.[0] ?? s
    ).toLowerCase();
  const compare = (x, y) => x.localeCompare(y, "en", { sensitivity: "base" });
  return compare(stem(a), stem(b)) || compare(a, b);
};
assert.deepEqual([...values].sort(previous), [...values].sort(familyCompare));
const runs = { baseline: [], candidate: [] };
for (let i = 0; i < 8; i++) {
  const order = [
    ["baseline", previous],
    ["candidate", familyCompare],
  ];
  if (i % 2) order.reverse();
  for (const [name, compare] of order) {
    const start = performance.now();
    [...values].sort(compare);
    runs[name].push(performance.now() - start);
  }
}
console.log(
  JSON.stringify(
    { node: process.version, items: values.length, orderEqual: true, runs },
    null,
    2,
  ),
);
