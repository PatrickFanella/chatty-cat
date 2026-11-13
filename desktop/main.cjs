'use strict';
// Chatty Cat desktop: runs the bundled Go server on loopback and renders the
// bundled web UI in this app's own Chromium window. Nothing is loaded from
// chat.subcult.tv; chat, emotes and metadata go straight from the bundled server
// to Twitch and the emote providers.
const { app, BrowserWindow, dialog, Menu, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
// Public Twitch client ID: it identifies this app and is safe to distribute.
const { clientID } = require('./twitch-client.json');
const RELEASES = 'https://git.subcult.tv/subculture-collective/chatty-cat/releases';
const serverDirectory = path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, 'build'), 'server');

// A fixed port keeps the page origin, and with it saved settings and history,
// the same on every launch.
let PORT = 47830;
let ORIGIN = `http://localhost:${PORT}`;
const smoke = process.argv.find((arg) => arg.startsWith('--smoke='))?.slice('--smoke='.length);
const web = { sandbox: true, contextIsolation: true };

let server;
let quitting = false;

function stop(code) {
  quitting = true;
  server?.kill('SIGTERM');
  app.exit(code);
}

if (smoke) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chatty-cat-smoke-')));
if (!app.requestSingleInstanceLock()) app.exit(0);

// CI shares the runner with normal app launches. Its throwaway profile does
// not need the persistent origin, so ask the OS for a free loopback port.
function smokePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function startServer() {
  const dir = serverDirectory;
  // Server settings come only from here: never from a stray .env or the user's
  // environment. Only the registered public client ID ships in the app.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^(CHATTY_CAT|TWITCH|GIPHY)_/.test(key)),
  );
  server = spawn(path.join(dir, 'chatty-cat-server'), [], {
    env: {
      ...env,
      CHATTY_CAT_ADDR: `127.0.0.1:${PORT}`,
      CHATTY_CAT_ASSETS: path.join(dir, 'web/dist'),
      CHATTY_CAT_ENV_FILE: os.devNull,
      CHATTY_CAT_PUBLIC_URL: ORIGIN,
      TWITCH_PUBLIC_CLIENT: 'true',
      TWITCH_CLIENT_ID: clientID,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  server.on('exit', (code, signal) => {
    if (quitting) return;
    const reason = `The chat service stopped (${signal ?? `exit ${code}`}). If another program uses port ${PORT}, close it and start Chatty Cat again.`;
    if (smoke) console.error(reason);
    else dialog.showErrorBox('Chatty Cat', reason);
    app.exit(1);
  });
}

function installMenu() {
  let build = 'development build';
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(serverDirectory, 'manifest.json'), 'utf8'));
    if (/^[a-f0-9]{40}$/.test(manifest.baseCommit)) {
      build = 'build ' + manifest.baseCommit.slice(0, 7);
      if (manifest.sourceIncludesUncommittedChanges) build += ' (local changes)';
    }
  } catch {
    // Unpackaged development runs may not have a release manifest yet.
  }
  app.setAboutPanelOptions({ applicationName: 'Chatty Cat', applicationVersion: `${app.getVersion()} · ${build}` });
  const update = {
    id: 'check-updates',
    label: 'Check for Updates…',
    click: async () => {
      const { response } = await dialog.showMessageBox({
        type: 'info',
        title: 'Chatty Cat updates',
        message: 'Check for a newer desktop build',
        detail: `Installed: ${build}.\n\nOpen releases in your browser to compare builds and download the latest version. Sign in to Gitea if asked.\n\nQuit Chatty Cat before replacing the app. Your settings are stored separately from the app.`,
        buttons: ['Open Downloads', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) {
        try {
          await shell.openExternal(RELEASES);
        } catch {
          dialog.showErrorBox(
            'Chatty Cat updates',
            `Could not open your browser. Open this address to download an update:\n${RELEASES}`,
          );
        }
      }
    },
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [
            {
              label: app.name,
              submenu: [
                { role: 'about' },
                update,
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
              ],
            },
          ]
        : [{ label: 'File', submenu: [{ role: 'quit' }] }]),
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      {
        role: 'help',
        submenu: [
          ...(process.platform === 'darwin' ? [] : [{ role: 'about' }]),
          { ...update, id: process.platform === 'darwin' ? 'help-check-updates' : update.id },
        ],
      },
    ]),
  );
}

async function waitReady() {
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/ready`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('the chat service did not start within 15 seconds');
}

function sameOrigin(url) {
  try {
    return new URL(url).origin === ORIGIN;
  } catch {
    return false;
  }
}

function openOutside(url) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

// A Twitch website session belongs to the desktop browser, separately from chat
// OAuth. This window shares the app's default session with the embedded player.
let playerLogin;
function twitchPage(url) {
  try {
    const target = new URL(url);
    return (
      target.protocol === 'https:' &&
      !target.username &&
      !target.password &&
      ['www.twitch.tv', 'passport.twitch.tv', 'id.twitch.tv'].includes(
        target.hostname,
      ) &&
      !target.port
    );
  } catch {
    return false;
  }
}
function openPlayerLogin() {
  if (playerLogin && !playerLogin.isDestroyed()) {
    playerLogin.show();
    playerLogin.focus();
    return;
  }
  playerLogin = new BrowserWindow({
    width: 520,
    height: 760,
    title: 'Twitch player sign-in',
    webPreferences: web,
  });
  const contents = playerLogin.webContents;
  const leave = (event, url) => {
    if (twitchPage(url)) return;
    event.preventDefault();
    openOutside(url);
  };
  contents.on('will-navigate', leave);
  contents.on('will-redirect', leave);
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  playerLogin.on('closed', () => {
    playerLogin = undefined;
  });
  void playerLogin.loadURL('https://www.twitch.tv/login');
}

// App pages (pop-out panes and channels) open as app windows; every other link
// opens in the default browser.
function guard(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (url === 'https://www.twitch.tv/login') {
      openPlayerLogin();
      return { action: 'deny' };
    }
    if (sameOrigin(url) || url === 'about:blank') {
      return { action: 'allow', overrideBrowserWindowOptions: { backgroundColor: '#151519', webPreferences: web } };
    }
    openOutside(url);
    return { action: 'deny' };
  });
  contents.on('did-create-window', (child) => guard(child.webContents));
  const leave = (event, url) => {
    if (sameOrigin(url)) return;
    event.preventDefault();
    openOutside(url);
    // A link opened through about:blank leaves an empty window behind.
    if (!sameOrigin(contents.getURL())) BrowserWindow.fromWebContents(contents)?.close();
  };
  contents.on('will-navigate', leave);
  contents.on('will-redirect', leave);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Chatty Cat',
    backgroundColor: '#151519',
    show: !smoke,
    webPreferences: web,
  });
  guard(win.webContents);
  void win.loadURL(`${ORIGIN}/`);
  return win;
}

// CI check: the bundled UI must load from the bundled server and leave
// "Connecting…". Saves a screenshot and reports what rendered.
async function runSmoke(win) {
  const read = () =>
    win.webContents
      .executeJavaScript(
        `({ origin: location.origin, status: document.getElementById('status')?.textContent ?? '', rows: document.querySelectorAll('#log > *').length })`,
      )
      .catch(() => null);
  const deadline = Date.now() + 45_000;
  let state = null;
  while (Date.now() < deadline) {
    state = await read();
    if (state?.origin === ORIGIN && state.status && state.status !== 'Connecting…') break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const connected = state?.origin === ORIGIN && !!state.status && state.status !== 'Connecting…';
  // Exercise the visible control, not the menu or the picker's private trigger.
  // This catches a lazy panel whose constructor is never reached by a click.
  if (connected) await win.webContents.executeJavaScript(`document.getElementById('picker-open').click()`);
  let controls = null;
  const controlsDeadline = Date.now() + 10_000;
  while (connected && Date.now() < controlsDeadline) {
    controls = await win.webContents.executeJavaScript(`({
      loginEnabled: !document.getElementById('login').disabled,
      pickerVisible: !!document.getElementById('emote-picker') && document.getElementById('emote-picker').checkVisibility(),
      pickerItems: document.querySelectorAll('#picker-grid button[data-insert]').length
    })`);
    if (controls.loginEnabled && controls.pickerVisible && controls.pickerItems > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const updateMenu = !!Menu.getApplicationMenu()?.getMenuItemById('check-updates');
  const passed = connected && controls?.loginEnabled && controls.pickerVisible && controls.pickerItems > 0 && updateMenu;
  // capturePage on the hidden smoke window intermittently rejects with
  // UnknownVizError under Xvfb; retry the screenshot, not the checks above.
  let image;
  for (let attempt = 1; !image; attempt += 1) {
    try {
      image = await win.webContents.capturePage();
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  fs.writeFileSync(smoke, image.toPNG());
  console.log(JSON.stringify({ smoke: passed ? 'passed' : 'failed', ...(await read()), ...controls, updateMenu, screenshot: smoke }));
  stop(passed ? 0 : 1);
}

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  quitting = true;
  server?.kill('SIGTERM');
});

app.whenReady().then(async () => {
  if (smoke && process.platform === 'darwin') app.dock?.hide();
  installMenu();
  try {
    if (smoke) {
      PORT = await smokePort();
      ORIGIN = `http://localhost:${PORT}`;
    }
    startServer();
    await waitReady();
  } catch (error) {
    if (!smoke) dialog.showErrorBox('Chatty Cat', error.message);
    console.error(error.message);
    stop(1);
    return;
  }
  const win = createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  if (smoke) {
    // An unhandled rejection would leave the app running until the CI job times out.
    await runSmoke(win).catch((error) => {
      console.error(error);
      stop(1);
    });
  }
});
