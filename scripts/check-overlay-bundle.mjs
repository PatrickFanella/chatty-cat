import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
const directory = resolve(
  process.argv[2] ??
    resolve(dirname(fileURLToPath(import.meta.url)), "../web/dist"),
);
const manifest = JSON.parse(
  readFileSync(resolve(directory, "asset-manifest.json"), "utf8"),
);
function entry(key) {
  const seen = new Set(),
    css = new Set();
  function visit(name) {
    if (seen.has(name)) return;
    const chunk = manifest[name];
    if (!chunk) throw new Error("Missing manifest chunk " + name);
    seen.add(name);
    for (const file of chunk.css ?? []) css.add(file);
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  visit(key);
  const files = [...seen].map((name) => manifest[name].file);
  const bytes = files.reduce(
    (total, file) =>
      total +
      gzipSync(readFileSync(resolve(directory, file)), { level: 9 }).length,
    0,
  );
  const cssBytes = [...css].reduce(
    (total, file) =>
      total +
      gzipSync(readFileSync(resolve(directory, file)), { level: 9 }).length,
    0,
  );
  return {
    gzipBytes: bytes,
    files,
    cssGzipBytes: cssBytes,
    cssFiles: [...css],
  };
}
const main = entry("index.html"),
  overlay = entry("overlay.html");
const ratio = overlay.gzipBytes / main.gzipBytes;
console.log(JSON.stringify({ main, overlay, ratio, limit: 0.25 }, null, 2));
if (ratio >= 0.25)
  throw new Error(
    "Overlay loaded JavaScript must remain below one quarter of main, including shared chunks",
  );
