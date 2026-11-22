// OneShot — main process
// Menu-bar app: global capture shortcuts → quick-access overlay → editor/viewer windows.
const {
  app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu,
  nativeImage, clipboard, dialog, screen, shell, systemPreferences, desktopCapturer,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');

const { IMAGE_EXTS } = require('./image-types.js');

const IMAGE_EXT = new Set(IMAGE_EXTS.map((e) => `.${e}`));
const NATIVE_DECODE = new Set(['.heic', '.heif', '.tif', '.tiff']); // Chromium can't decode these, macOS can
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif' };
const SHORTCUTS = { area: 'Alt+Shift+4', window: 'Alt+Shift+5', screen: 'Alt+Shift+3' };
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';
const IS_WIN = process.platform === 'win32';
const PRELOAD = path.join(__dirname, 'preload.js');
const R = (f) => path.join(__dirname, 'renderer', f);

let tray = null;
let launcher = null;
let onboarding = null;
let home = null;
const pending = [];
const overlays = [];

const isImage = (p) => typeof p === 'string' && IMAGE_EXT.has(path.extname(p).toLowerCase());
const captureDir = () => settings.captureDir || path.join(app.getPath('pictures'), 'OneShot');
const openCaptureFolder = () => { fs.mkdirSync(captureDir(), { recursive: true }); shell.openPath(captureDir()); };
const IMAGE_FILTERS = [{ name: 'Images', extensions: [...IMAGE_EXT].map((e) => e.slice(1)) }];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ── Settings (tiny JSON file in userData) ────────────────────────────────────
// Bump ONBOARDING_VERSION when the welcome flow changes enough that existing
// users should see it once more.
const ONBOARDING_VERSION = 2;
const DEFAULTS = { onboardedVersion: 0, onboardingStep: 0, onboardingActive: false, captureDir: null };
let settings = { ...DEFAULTS };
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { settings = { ...DEFAULTS }; }
  delete settings.onboarded; delete settings.showBarOnLaunch; // v0.1 keys
}
const needsOnboarding = () => settings.onboardedVersion < ONBOARDING_VERSION || settings.onboardingActive;
function saveSettings(patch) {
  Object.assign(settings, patch);
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (err) { console.error('settings', err); }
}
// macOS only; Windows/Linux need no permission to capture.
const screenAccess = () => (IS_MAC ? systemPreferences.getMediaAccessStatus('screen') : 'granted');

// Login item. Windows passes LOGIN_ARG so we can tell a login launch from a
// manual one; macOS reports it via wasOpenedAtLogin (unreliable on macOS 13+,
// hence the uptime fallback). Linux has no login items in Electron.
const LOGIN_ARG = '--login';
const loginOpts = IS_WIN ? { args: [LOGIN_ARG] } : {};
const openAtLogin = () => !IS_LINUX && app.getLoginItemSettings(loginOpts).openAtLogin;
const setOpenAtLogin = (on) => { if (!IS_LINUX) app.setLoginItemSettings({ openAtLogin: !!on, ...loginOpts }); };
const launchedAtLogin = () => process.argv.includes(LOGIN_ARG)
  || (IS_MAC && (app.getLoginItemSettings().wasOpenedAtLogin || (app.isPackaged && openAtLogin() && os.uptime() < 180)));

// ── App lifecycle ────────────────────────────────────────────────────────────
// Debug snapshot runs get their own profile so they never hand off to a running OneShot.
if (process.env.ONESHOT_DEBUG_SHOT) app.setPath('userData', path.join(os.tmpdir(), 'oneshot-debug'));
else if (!app.requestSingleInstanceLock()) app.quit();

app.on('second-instance', (_e, argv) => {
  const files = argv.filter((a) => isImage(a) && fs.existsSync(a));
  if (files.length) files.forEach((f) => openEditor(path.resolve(f)));
  else openMain();
});

// Finder "Open With" / double-click when OneShot is the default viewer.
app.on('open-file', (e, p) => {
  e.preventDefault();
  if (app.isReady()) openEditor(p);
  else pending.push(p);
});

let readyAt = 0;
app.whenReady().then(() => {
  readyAt = Date.now();
  loadSettings();
  syncDock();
  buildMenu();
  createTray();
  registerShortcuts();
  const argvFiles = process.argv.slice(1).filter((a) => isImage(a) && fs.existsSync(a)).map((a) => path.resolve(a));
  const files = [...pending, ...argvFiles];
  if (files.length) files.forEach((f) => openEditor(f));
  else if (process.env.ONESHOT_DEBUG_OVERLAY && !app.isPackaged) showOverlay(process.env.ONESHOT_DEBUG_OVERLAY);
  else if (process.env.ONESHOT_DEBUG_WINDOW && !app.isPackaged) ({ home: openHome, onboarding: openOnboarding, launcher: openLauncher })[process.env.ONESHOT_DEBUG_WINDOW]?.();
  else if (needsOnboarding()) openOnboarding();
  else if (!launchedAtLogin()) openHome();
  // launched at login: start silently, OneShot lives in the menu bar / tray.
});

// Dock icon click / opening OneShot again from Finder while it runs.
app.on('activate', () => {
  if (Date.now() - readyAt < 2000) return; // macOS can send this during launch; whenReady already decided what to show
  const open = BrowserWindow.getAllWindows().some((w) => w.isVisible() && ['editor', 'home', 'onboarding'].includes(w.oneshotKind));
  if (!open) openMain();
});
app.on('window-all-closed', () => { /* keep living in the menu bar */ });
app.on('will-quit', () => globalShortcut.unregisterAll());

// ── Windows ──────────────────────────────────────────────────────────────────
// The Dock icon only shows while a "real" window (editor, welcome) is open;
// otherwise OneShot is a pure menu-bar app like CleanShot.
function syncDock() {
  if (!IS_MAC || !app.dock) return;
  const need = BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && ['editor', 'onboarding', 'home'].includes(w.oneshotKind));
  if (need) app.dock.show(); else app.dock.hide();
}
function trackDock(win) {
  syncDock();
  win.on('closed', () => setImmediate(syncDock));
}

// Inset traffic lights + vibrancy on macOS; a normal native frame elsewhere
// (hiddenInset would remove the window controls on Windows/Linux).
const chrome = (inset) => (IS_MAC
  ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: inset, y: inset }, vibrancy: 'under-window', visualEffectState: 'active', backgroundColor: '#00000000' }
  : { backgroundColor: '#f4f4f6' });

// Title-bar proxy icon (macOS) + recent documents (macOS/Windows).
function noteFile(win, file) {
  if (IS_MAC) win.setRepresentedFilename(file);
  if (!IS_LINUX) app.addRecentDocument(file);
}

function openEditor(file, { mode = 'view' } = {}) {
  if (!file) return openLauncher(); // never show an empty editor
  const win = new BrowserWindow({
    width: 1040, height: 720, minWidth: 600, minHeight: 420, show: false,
    ...chrome(18),
    webPreferences: { preload: PRELOAD },
  });
  win.oneshotKind = 'editor';
  win.loadFile(R('editor.html'), { query: { file, mode } });
  win.once('ready-to-show', () => win.show());
  noteFile(win, file);
  trackDock(win);
  devHooks(win);
  return win;
}

// What a manual launch shows: the welcome flow until it is finished, then Home.
function openMain() {
  if (needsOnboarding()) openOnboarding(); else openHome();
}

// Welcome: intro → permission → shortcuts → menu bar. Reopens at the saved
// step until finished, including after the relaunch macOS needs for the permission.
function openOnboarding(step) {
  saveSettings({ onboardingActive: true, ...(typeof step === 'number' ? { onboardingStep: step } : {}) });
  if (home && !home.isDestroyed()) home.close();
  if (onboarding && !onboarding.isDestroyed()) {
    onboarding.webContents.send('onboarding:step', settings.onboardingStep);
    onboarding.show(); onboarding.focus(); return;
  }
  onboarding = new BrowserWindow({
    width: 460, height: 640, resizable: false, maximizable: false, fullscreenable: false, show: false,
    ...chrome(16),
    title: 'Welcome to OneShot',
    webPreferences: { preload: PRELOAD },
  });
  onboarding.oneshotKind = 'onboarding';
  onboarding.setMenuBarVisibility(false);
  onboarding.loadFile(R('onboarding.html'));
  onboarding.once('ready-to-show', () => { onboarding.show(); app.focus({ steal: true }); });
  trackDock(onboarding);
  devHooks(onboarding);
}

// Home: capture buttons, recent captures and settings. Closing it keeps
// OneShot running in the menu bar.
function openHome() {
  if (home && !home.isDestroyed()) { home.show(); home.focus(); return; }
  home = new BrowserWindow({
    width: 500, height: 780, minWidth: 440, minHeight: 520, maximizable: false, fullscreenable: false, show: false,
    ...chrome(16),
    title: 'OneShot',
    webPreferences: { preload: PRELOAD },
  });
  home.oneshotKind = 'home';
  home.setMenuBarVisibility(false);
  home.loadFile(R('home.html'));
  home.once('ready-to-show', () => { home.show(); app.focus({ steal: true }); });
  trackDock(home);
  devHooks(home);
}

// Compact floating capture bar.
function openLauncher() {
  if (launcher && !launcher.isDestroyed()) { launcher.show(); launcher.focus(); return; }
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const W = 252, H = 46;
  launcher = new BrowserWindow({
    width: W, height: H,
    x: Math.round(workArea.x + (workArea.width - W) / 2), y: Math.round(workArea.y + workArea.height - H - 32),
    frame: false, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: true, hasShadow: true, acceptFirstMouse: true, show: false,
    vibrancy: 'popover', visualEffectState: 'active', backgroundColor: '#00000000',
    webPreferences: { preload: PRELOAD },
  });
  launcher.oneshotKind = 'launcher';
  launcher.loadFile(R('launcher.html'));
  launcher.once('ready-to-show', () => launcher.show());
  devHooks(launcher);
}
const closeLauncher = () => { if (launcher && !launcher.isDestroyed()) launcher.close(); };

function showOverlay(file) {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  // Card takes the screenshot's shape (clamped), 20px of window margin for the shadow.
  const sz = nativeImage.createFromPath(file).getSize();
  const cw = 300, ch = Math.round(clamp(sz.width ? (cw * sz.height) / sz.width : 190, 150, 260));
  const W = cw + 20, H = ch + 20, M = 6;
  for (let i = overlays.length - 1; i >= 0; i--) if (overlays[i].isDestroyed()) overlays.splice(i, 1);
  const stacked = overlays.reduce((sum, w) => sum + w.getBounds().height - 10, 0);
  const y = workArea.y + workArea.height - H - M - stacked;
  const win = new BrowserWindow({
    x: workArea.x + M, y, width: W, height: H,
    frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true,
    hasShadow: false, fullscreenable: false, minimizable: false, maximizable: false,
    acceptFirstMouse: true, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: PRELOAD },
  });
  win.oneshotKind = 'overlay';
  win.setAlwaysOnTop(true, 'screen-saver');
  if (!IS_WIN) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(R('overlay.html'), { query: { file } });
  win.once('ready-to-show', () => win.showInactive());
  overlays.push(win);
  devHooks(win);
}

function openPin(file) {
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return;
  const size = img.getSize();
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  let w = size.width / d.scaleFactor, h = size.height / d.scaleFactor;
  const k = Math.min(1, (Math.min(d.workArea.width, d.workArea.height) * 0.6) / Math.max(w, h));
  w = Math.round(w * k); h = Math.round(h * k);
  const win = new BrowserWindow({
    width: w, height: h, frame: false, alwaysOnTop: true, resizable: true, hasShadow: true,
    skipTaskbar: true, acceptFirstMouse: true, show: false, backgroundColor: '#000000',
    webPreferences: { preload: PRELOAD },
  });
  win.oneshotKind = 'pin';
  win.setAspectRatio(w / h);
  win.setAlwaysOnTop(true, 'floating');
  if (!IS_WIN) win.setVisibleOnAllWorkspaces(true);
  win.loadFile(R('pin.html'), { query: { file } });
  win.once('ready-to-show', () => win.show());
}

// ── Capture ──────────────────────────────────────────────────────────────────
// Prototype: macOS `screencapture` gives us the native selection UI, window
// picking, multi-display and Retina handling for free. Production: swap for a
// ScreenCaptureKit helper (see docs/RESEARCH.md) to get a custom crosshair/magnifier.
function stamp() {
  const d = new Date(), z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} at ${z(d.getHours())}.${z(d.getMinutes())}.${z(d.getSeconds())}`;
}

function capture(kind) {
  if (screenAccess() !== 'granted') return openOnboarding(1); // explain + fix permission first
  fs.mkdirSync(captureDir(), { recursive: true });
  const file = path.join(captureDir(), `OneShot ${stamp()}.png`);
  const args = { area: ['-i'], window: ['-i', '-W'], screen: ['-m'] }[kind] || ['-i'];
  // Keep our own bar / Home window out of the shot, bring them back afterwards.
  const hidden = [launcher, home].filter((w) => w && !w.isDestroyed() && w.isVisible());
  hidden.forEach((w) => w.hide());
  const restore = () => hidden.forEach((w) => { if (!w.isDestroyed()) w.show(); });
  const done = () => {
    closeLauncher();
    if (home && !home.isDestroyed() && hidden.includes(home)) { home.showInactive(); refreshHome(); }
    showOverlay(file);
  };
  const delay = hidden.length ? 200 : 0;
  if (!IS_MAC) return void setTimeout(() => captureFallback(file).then(done)
    .catch((err) => { console.error('capture failed', err); restore(); }), delay);
  setTimeout(() => execFile('/usr/sbin/screencapture', [...args, file], (err) => {
    if (fs.existsSync(file)) done();
    else { restore(); if (err) console.error('capture failed', err); }
  }), delay);
}

// Windows/Linux prototype: grab the display under the cursor (area/window
// selection needs a custom overlay — see docs/RESEARCH.md).
async function captureFallback(file) {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const thumbnailSize = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
  const src = sources.find((s) => s.display_id === String(d.id)) || sources[0];
  if (!src) throw new Error('no screen source');
  await fs.promises.writeFile(file, src.thumbnail.toPNG());
}

function registerShortcuts() {
  for (const [kind, acc] of Object.entries(SHORTCUTS)) {
    if (!globalShortcut.register(acc, () => capture(kind))) console.warn('shortcut taken:', acc);
  }
}

// ── Tray (menu bar) ──────────────────────────────────────────────────────────
function trayIcon() {
  // Draw a tiny "aperture" (ring + dot) as a template image, no asset needed.
  const s = 36, buf = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x - s / 2 + 0.5, y - s / 2 + 0.5);
    const a = Math.max(clamp(1.7 - Math.abs(d - 13), 0, 1), clamp(5.5 - d, 0, 1));
    buf[(y * s + x) * 4 + 3] = Math.round(a * 255);
  }
  const img = nativeImage.createFromBitmap(buf, { width: s, height: s, scaleFactor: 2 });
  img.setTemplateImage(true);
  return img;
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('OneShot');
  if (!IS_MAC) tray.on('click', openLauncher); // Windows: left click = capture bar, right click = menu
  updateTrayMenu();
}
// Shared by the tray menu and the File menu.
const captureItems = () => [
  { label: 'Capture Area', accelerator: SHORTCUTS.area, click: () => capture('area') },
  { label: 'Capture Window', accelerator: SHORTCUTS.window, click: () => capture('window') },
  { label: 'Capture Screen', accelerator: SHORTCUTS.screen, click: () => capture('screen') },
];

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    ...captureItems(),
    { type: 'separator' },
    { label: 'Show Capture Bar', click: openLauncher },
    { label: 'Open Image…', click: openDialog },
    { label: 'Open Captures Folder', click: openCaptureFolder },
    { type: 'separator' },
    { label: 'Home & Settings…', accelerator: 'CmdOrCtrl+,', click: openMain },
    // Login items aren't supported by Electron on Linux.
    ...(IS_LINUX ? [] : [{ label: 'Open at Login', type: 'checkbox', checked: openAtLogin(), click: (i) => setOpenAtLogin(i.checked) }]),
    { type: 'separator' },
    { label: `OneShot ${app.getVersion()}`, enabled: false },
    { label: 'Quit OneShot', role: 'quit' },
  ]));
}

// ── Menu ─────────────────────────────────────────────────────────────────────
// Undo/Redo/Copy/Save are forwarded to the renderer (canvas history, not DOM).
function buildMenu() {
  const send = (cmd) => BrowserWindow.getFocusedWindow()?.webContents.send('menu', cmd);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(IS_MAC ? [{
      role: 'appMenu', submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: openMain },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File', submenu: [
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: openDialog },
        ...(IS_MAC ? [{ role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments' }] }] : []),
        { type: 'separator' },
        ...captureItems(),
        { type: 'separator' },
        { label: 'Save Copy…', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { role: 'close' },
        ...(IS_MAC ? [] : [{ type: 'separator' }, { label: 'Settings…', accelerator: 'Ctrl+,', click: openMain }, { label: 'Quit OneShot', role: 'quit' }]),
      ],
    },
    {
      label: 'Edit', submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: () => send('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: () => send('copy') },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View', submenu: [
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ]));
}

async function openDialog() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: IMAGE_FILTERS,
  });
  if (canceled) return 0;
  filePaths.forEach((f) => openEditor(f));
  return filePaths.length;
}

// ── IPC: app state, settings, Home ───────────────────────────────────────────
const appState = () => ({
  platform: process.platform, packaged: app.isPackaged, version: app.getVersion(), screen: screenAccess(),
  openAtLogin: openAtLogin(), shortcuts: SHORTCUTS, captureDir: captureDir(), home: os.homedir(),
});
const refreshHome = () => { if (home && !home.isDestroyed()) home.webContents.send('home:refresh'); };
ipcMain.handle('app:state', appState);
ipcMain.on('settings:set', (_e, key, value) => {
  if (key === 'openAtLogin') setOpenAtLogin(value);
  updateTrayMenu();
});
ipcMain.on('app:quit', () => app.quit());

// Newest captures first, with small thumbnails for Home.
ipcMain.handle('captures:recent', async (_e, limit = 6) => {
  let names = [];
  try { names = await fs.promises.readdir(captureDir()); } catch { return []; }
  const files = await Promise.all(names.filter((n) => isImage(n) && !n.startsWith('.')).map(async (n) => {
    const p = path.join(captureDir(), n);
    try { return { path: p, name: n, mtime: (await fs.promises.stat(p)).mtimeMs }; } catch { return null; }
  }));
  return files.filter(Boolean).sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((f) => {
    const img = nativeImage.createFromPath(f.path);
    const thumb = img.isEmpty() ? '' : img.resize({ width: 320, quality: 'good' }).toDataURL();
    const label = new Date(f.mtime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return { ...f, thumb, label };
  });
});
ipcMain.handle('captures:choose-dir', async (e) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    defaultPath: captureDir(), properties: ['openDirectory', 'createDirectory'], buttonLabel: 'Choose',
  });
  if (canceled || !filePaths[0]) return null;
  saveSettings({ captureDir: filePaths[0] });
  return filePaths[0];
});
ipcMain.handle('home:open', () => openDialog());
ipcMain.on('home:launcher', () => { if (home && !home.isDestroyed()) home.close(); openLauncher(); });
ipcMain.on('home:permission', () => openOnboarding(1));
ipcMain.on('home:tour', () => openOnboarding(0));

// ── IPC: onboarding ──────────────────────────────────────────────────────────
ipcMain.handle('onboarding:state', () => ({ ...appState(), step: settings.onboardingStep }));
ipcMain.handle('onboarding:request-screen', async () => {
  if (!IS_MAC) return 'granted';
  saveSettings({ onboardingStep: 1, onboardingActive: true }); // resume here after the relaunch macOS requires
  // Touching the capture API registers OneShot in System Settings and shows the system prompt once.
  try { await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }); } catch {}
  const status = screenAccess();
  if (status !== 'granted') shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  return status;
});
ipcMain.on('onboarding:step', (_e, step) => saveSettings({ onboardingStep: step }));
ipcMain.on('onboarding:relaunch', () => { app.relaunch(); app.exit(0); });
ipcMain.on('onboarding:finish', () => {
  saveSettings({ onboardedVersion: ONBOARDING_VERSION, onboardingStep: 0, onboardingActive: false });
  openHome(); // land in Home so people see where captures and settings live
  if (onboarding && !onboarding.isDestroyed()) onboarding.close();
});

// ── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('image:read', async (_e, p) => {
  const ext = path.extname(p).toLowerCase();
  let data, mime;
  if (NATIVE_DECODE.has(ext)) {
    const img = nativeImage.createFromPath(p);
    if (img.isEmpty()) throw new Error('Unsupported image');
    data = img.toPNG(); mime = 'image/png';
  } else {
    data = await fs.promises.readFile(p); mime = MIME[ext] || 'application/octet-stream';
  }
  return { data, mime, name: path.basename(p) };
});

ipcMain.handle('image:siblings', async (_e, p) => {
  const dir = path.dirname(p);
  const names = await fs.promises.readdir(dir);
  return names.filter((n) => isImage(n) && !n.startsWith('.'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((n) => path.join(dir, n));
});

ipcMain.handle('clipboard:image', (_e, buf) => { clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(buf))); });
ipcMain.handle('clipboard:file', (_e, p) => { clipboard.writeImage(nativeImage.createFromPath(p)); });

// Suggests `name` next to the original file.
ipcMain.handle('file:save-as', async (e, buf, name, src) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: src ? path.join(path.dirname(src), name) : name,
    filters: [{ name: 'PNG', extensions: ['png'] }, { name: 'JPEG', extensions: ['jpg', 'jpeg'] }],
  });
  if (canceled || !filePath) return null;
  let out = Buffer.from(buf);
  if (/\.jpe?g$/i.test(filePath)) out = nativeImage.createFromBuffer(out).toJPEG(92);
  await fs.promises.writeFile(filePath, out);
  return filePath;
});

ipcMain.handle('file:save-copy', async (e, src) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: path.join(app.getPath('desktop'), path.basename(src)),
  });
  if (canceled || !filePath) return null;
  await fs.promises.copyFile(src, filePath);
  return filePath;
});

ipcMain.on('window:fit', (e, w, h) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  const d = screen.getDisplayMatching(win.getBounds()).workArea;
  const W = Math.round(clamp(w + 64, 640, d.width * 0.88));
  const H = Math.round(clamp(h + 52 + 64, 440, d.height * 0.88));
  win.setBounds({ x: Math.round(d.x + (d.width - W) / 2), y: Math.round(d.y + (d.height - H) / 2), width: W, height: H });
});
ipcMain.on('window:file', (e, p) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) noteFile(w, p); });
ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());

ipcMain.on('capture', (_e, kind) => capture(kind));
ipcMain.handle('launcher:open', async () => { if (await openDialog()) closeLauncher(); });
ipcMain.on('open-folder', openCaptureFolder);
ipcMain.on('open-path', (_e, p) => { if (isImage(p)) { openEditor(p); closeLauncher(); } });
ipcMain.on('edit', (e, p) => { openEditor(p, { mode: 'edit' }); const w = BrowserWindow.fromWebContents(e.sender); if (w?.oneshotKind === 'overlay') w.close(); });
ipcMain.on('pin', (e, p) => { openPin(p); const w = BrowserWindow.fromWebContents(e.sender); if (w?.oneshotKind === 'overlay') w.close(); });
ipcMain.on('reveal', (_e, p) => shell.showItemInFolder(p));

// Drag the screenshot out of OneShot into Slack, Mail, Finder…
ipcMain.on('drag:file', (e, p) => {
  e.sender.startDrag({ file: p, icon: nativeImage.createFromPath(p).resize({ width: 96 }) });
});
ipcMain.on('drag:data', (e, dataUrl, name) => {
  const dir = path.join(os.tmpdir(), 'OneShot');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, path.basename(name || '') || 'OneShot.png'); // basename: never write outside dir
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  e.sender.startDrag({ file, icon: nativeImage.createFromPath(file).resize({ width: 96 }) });
});

// ── Dev hooks (see docs/DEVELOPMENT.md → Debug hooks) ────────────────────────
// ONESHOT_DEBUG_SHOT=/path.png  screenshot the first window after load
// ONESHOT_DEBUG_JS="..."        run this in the page first
// ONESHOT_DEBUG_QUIT=1          quit after the screenshot
function devHooks(win) {
  if (app.isPackaged) return;
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') console.log(`[renderer:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  const shot = process.env.ONESHOT_DEBUG_SHOT;
  if (!shot || !['editor', 'launcher', 'onboarding', 'overlay', 'home'].includes(win.oneshotKind)) return;
  win.webContents.once('did-finish-load', () => setTimeout(async () => {
    if (process.env.ONESHOT_DEBUG_JS) {
      try { await win.webContents.executeJavaScript(process.env.ONESHOT_DEBUG_JS); } catch (err) { console.log('debug js error', err); }
      await new Promise((r) => setTimeout(r, 900));
    }
    const img = await win.webContents.capturePage();
    fs.writeFileSync(shot, img.toPNG());
    console.log('debug shot written', shot);
    if (process.env.ONESHOT_DEBUG_QUIT) app.quit();
  }, 1200));
}
