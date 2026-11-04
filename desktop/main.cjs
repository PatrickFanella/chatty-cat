'use strict';
// Chatty Cat desktop: runs the bundled Go server on loopback and renders the
// bundled web UI in this app's own Chromium window. Nothing is loaded from
// chat.subcult.tv; chat, emotes and metadata go straight from the bundled server
// to Twitch and the emote providers.
const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// A fixed port keeps the page origin, and with it saved settings and history,
// the same on every launch.
const PORT = 47830;
const ORIGIN = `http://localhost:${PORT}`;
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

function startServer() {
  const dir = path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, 'build'), 'server');
  // Server settings come only from here: never from a stray .env or the user's
  // environment, so login stays off until the desktop app supports it.
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
  const passed = state?.origin === ORIGIN && !!state.status && state.status !== 'Connecting…';
  if (passed) await new Promise((resolve) => setTimeout(resolve, 5_000));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(smoke, image.toPNG());
  console.log(JSON.stringify({ smoke: passed ? 'passed' : 'failed', ...(await read()), screenshot: smoke }));
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
  startServer();
  try {
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
