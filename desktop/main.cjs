'use strict';
// Chatty Cat desktop: runs the bundled Go server on loopback and renders the
// bundled web UI in this app's own Chromium window. Nothing is loaded from
// chat.subcult.tv; chat, emotes and metadata go straight from the bundled server
// to Twitch and the emote providers.
const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
// Public Twitch client ID: it identifies this app and is safe to distribute.
const { clientID } = require('./twitch-client.json');

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
  const dir = path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, 'build'), 'server');
  // Server settings come only from here: never from a stray .env or the user's
  // environment. Only the registered public client ID ships in the app.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^(CHATTHING|TWITCH|GIPHY)_/.test(key)),
  );
  server = spawn(path.join(dir, 'chatthing'), [], {
    env: {
      ...env,
      CHATTHING_ADDR: `127.0.0.1:${PORT}`,
      CHATTHING_ASSETS: path.join(dir, 'web/dist'),
      CHATTHING_ENV_FILE: os.devNull,
      CHATTHING_PUBLIC_URL: ORIGIN,
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

// App pages (pop-out panes and channels) open as app windows; every other link
// opens in the default browser.
function guard(contents) {
  contents.setWindowOpenHandler(({ url }) => {
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
  const passed = connected && controls?.loginEnabled && controls.pickerVisible && controls.pickerItems > 0;
  const image = await win.webContents.capturePage();
  fs.writeFileSync(smoke, image.toPNG());
  console.log(JSON.stringify({ smoke: passed ? 'passed' : 'failed', ...(await read()), ...controls, screenshot: smoke }));
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
  if (smoke) await runSmoke(win);
});
