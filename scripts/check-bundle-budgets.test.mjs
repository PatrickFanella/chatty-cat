import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync,
  cpSync,
  rmSync,
  appendFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { measureBundles, checkBudgets } from "./check-bundle-budgets.mjs";

// Exercise the actual production build and committed limits, without editing dist.
test("current build passes and 20 KiB of added compressed payload fails the main budget", () => {
  const directory = mkdtempSync(join(tmpdir(), "chatty-budget-"));
  try {
    cpSync(resolve("web/dist"), directory, { recursive: true });
    const budget = JSON.parse(
      readFileSync("scripts/bundle-budgets.json", "utf8"),
    );
    const before = measureBundles(directory);
    assert.deepEqual(checkBudgets(before, budget), []);
    const manifest = JSON.parse(
      readFileSync(join(directory, "asset-manifest.json"), "utf8"),
    );
    const payload = Buffer.concat(
      Array.from({ length: 640 }, (_, i) =>
        createHash("sha256")
          .update("budget-regression-" + i)
          .digest(),
      ),
    );
    appendFileSync(
      join(directory, manifest["index.html"].file),
      "\n/*" + payload.toString("base64") + "*/\n",
    );
    const after = measureBundles(directory);
    assert.ok(
      after["index.html"].jsGzipBytes - before["index.html"].jsGzipBytes >=
        20 * 1024,
    );
    assert.ok(
      checkBudgets(after, budget).some((failure) =>
        failure.startsWith("index.html: jsGzipBytes"),
      ),
    );
    const env = { ...process.env };
    delete env.GITHUB_STEP_SUMMARY;
    delete env.GITEA_STEP_SUMMARY;
    const cli = spawnSync(
      process.execPath,
      ["scripts/check-bundle-budgets.mjs", directory],
      { encoding: "utf8", env },
    );
    assert.equal(cli.status, 1, cli.stderr);
    assert.match(cli.stdout, /FAIL: index\.html: jsGzipBytes/);
    const unbudgeted = structuredClone(budget);
    delete unbudgeted.entries["overlay.html"];
    assert.ok(
      checkBudgets(before, unbudgeted).some((failure) =>
        failure.includes("unbudgeted build entry"),
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
