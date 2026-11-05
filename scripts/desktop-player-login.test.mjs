import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";

function desktop() {
  const filename = fileURLToPath(
    new URL("../desktop/main.cjs", import.meta.url),
  );
  const require = createRequire(filename);
  const windows = [],
    external = [];
  const contents = () => ({
    events: new Map(),
    on(name, handler) {
      this.events.set(name, handler);
    },
    setWindowOpenHandler(handler) {
      this.open = handler;
    },
  });
  class BrowserWindow {
    constructor(options) {
      this.options = options;
      this.webContents = contents();
      windows.push(this);
    }
    on() {}
    loadURL(url) {
      this.url = url;
    }
    isDestroyed() {
      return false;
    }
    show() {}
    focus() {}
  }
  const context = {
    require: (name) =>
      name === "electron"
        ? {
            app: {
              requestSingleInstanceLock: () => true,
              on() {},
              whenReady: () => ({ then() {} }),
            },
            BrowserWindow,
            shell: { openExternal: (url) => external.push(url) },
          }
        : require(name),
    __dirname: dirname(filename),
    process: { argv: [] },
    module: { exports: {} },
    URL,
  };
  runInNewContext(
    readFileSync(filename, "utf8") +
      "\nmodule.exports = { twitchPage, guard, openPlayerLogin };",
    context,
  );
  return { ...context.module.exports, windows, external, contents };
}

test("player sign-in uses a sandboxed default-session window and reuses it", () => {
  const app = desktop();
  const content = app.contents();
  app.guard(content);
  assert.equal(
    content.open({ url: "https://www.twitch.tv/login" }).action,
    "deny",
  );
  assert.equal(app.windows.length, 1);
  const win = app.windows[0];
  assert.equal(win.url, "https://www.twitch.tv/login");
  assert.equal(win.options.webPreferences.sandbox, true);
  assert.equal(win.options.webPreferences.contextIsolation, true);
  assert.equal(win.options.webPreferences.partition, undefined);
  app.openPlayerLogin();
  assert.equal(app.windows.length, 1);
  assert.equal(app.external.length, 0);
});

test("player login navigation permits only official HTTPS Twitch hosts", () => {
  const app = desktop();
  for (const url of [
    "https://www.twitch.tv/login",
    "https://passport.twitch.tv/auth",
    "https://id.twitch.tv/oauth2/authorize",
  ])
    assert.equal(app.twitchPage(url), true, url);
  for (const url of [
    "http://www.twitch.tv/login",
    "https://twitch.tv.evil.example/login",
    "https://evil.example",
    "https://user@www.twitch.tv/login",
    "https://www.twitch.tv:444/login",
    "file:///etc/passwd",
  ])
    assert.equal(app.twitchPage(url), false, url);
  app.openPlayerLogin();
  let prevented = false;
  app.windows[0].webContents.events.get("will-redirect")(
    {
      preventDefault() {
        prevented = true;
      },
    },
    "https://evil.example",
  );
  assert.equal(prevented, true);
  assert.deepEqual(app.external, ["https://evil.example"]);
});
