import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export function measureBundles(directory) {
  const manifest = JSON.parse(
    readFileSync(resolve(directory, "asset-manifest.json"), "utf8"),
  );
  const measurements = {};
  for (const [key, entry] of Object.entries(manifest)) {
    if (!entry.isEntry && !entry.isDynamicEntry) continue;
    const js = new Set(),
      css = new Set(),
      seen = new Set();
    const visit = (name) => {
      if (seen.has(name)) return;
      seen.add(name);
      const chunk = manifest[name];
      if (!chunk) throw new Error("Missing manifest import: " + name);
      if (chunk.file.endsWith(".js")) js.add(chunk.file);
      for (const file of chunk.css ?? []) css.add(file);
      for (const dependency of chunk.imports ?? []) visit(dependency);
    };
    visit(key);
    const bytes = (files) =>
      [...files].reduce(
        (total, file) =>
          total +
          gzipSync(readFileSync(resolve(directory, file)), { level: 9 }).length,
        0,
      );
    measurements[key] = { jsGzipBytes: bytes(js), cssGzipBytes: bytes(css) };
  }
  return measurements;
}

export function checkBudgets(measurements, budget) {
  if (budget.version !== 1 || !budget.entries)
    throw new Error("Unsupported bundle budget format");
  const failures = [];
  for (const key of new Set([
    ...Object.keys(measurements),
    ...Object.keys(budget.entries),
  ])) {
    const actual = measurements[key],
      limits = budget.entries[key];
    if (!actual || !limits) {
      failures.push(
        `${key}: ${actual ? "unbudgeted build entry" : "budgeted entry missing from build"}`,
      );
      continue;
    }
    for (const field of ["jsGzipBytes", "cssGzipBytes"]) {
      const limit = limits[field];
      if (!Number.isSafeInteger(limit) || limit < 0)
        throw new Error(`Invalid ${field} limit for ${key}`);
      if (actual[field] > limit)
        failures.push(
          `${key}: ${field} ${actual[field]} exceeds ${limit} by ${actual[field] - limit} bytes`,
        );
    }
  }
  return failures;
}

function main() {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const directory = resolve(process.argv[2] ?? resolve(repository, "web/dist"));
  const budget = JSON.parse(
    readFileSync(resolve(repository, "scripts/bundle-budgets.json"), "utf8"),
  );
  const measurements = measureBundles(directory),
    failures = checkBudgets(measurements, budget);
  const rows = Object.entries(measurements)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const limit = budget.entries[key] ?? {};
      return `| ${key} | ${value.jsGzipBytes} / ${limit.jsGzipBytes ?? "missing"} | ${value.cssGzipBytes} / ${limit.cssGzipBytes ?? "missing"} |`;
    });
  const report = [
    "# Bundle gzip budgets",
    "",
    "Bytes at gzip level 9. Each entry includes its static imports once; dynamic imports have separate budgets.",
    "",
    "| Entry | JS bytes / limit | CSS bytes / limit |",
    "| --- | ---: | ---: |",
    ...rows,
    "",
    ...failures.map((failure) => "- FAIL: " + failure),
    "",
  ].join("\n");
  console.log(report);
  writeFileSync(
    resolve(directory, "bundle-budget-report.json"),
    JSON.stringify({ measurements, failures }, null, 2) + "\n",
  );
  for (const path of new Set(
    [process.env.GITHUB_STEP_SUMMARY, process.env.GITEA_STEP_SUMMARY].filter(
      Boolean,
    ),
  ))
    appendFileSync(path, report);
  if (failures.length) process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
