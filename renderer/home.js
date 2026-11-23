// Home: what you get when you open OneShot yourself. Capture buttons, recent
// captures and settings. Closing it leaves OneShot running in the menu bar.
import { api, $, $$, keycaps } from './lib.js';

const app = api.app;
let st = null;

async function refresh() {
  st = await app.state();
  const mac = st.platform === 'darwin';
  const granted = st.screen === 'granted';
  $('#status').classList.toggle('warn', !granted);
  $('#status-text').textContent = !granted ? 'Needs Screen Recording access'
    : mac ? 'Running in the menu bar' : 'Running in the system tray';
  $('#perm-ok').classList.toggle('hidden', !granted);
  $('#perm-fix').classList.toggle('hidden', granted);
  $('#perm-detail').textContent = granted ? 'OneShot can capture your screen' : 'Needed to take screenshots';
  $('#opt-login').checked = st.openAtLogin;
  $('#opt-copy').checked = st.autoCopy;
  drawPreview();
  $('#dir').textContent = st.captureDir.replace(st.home, '~');
  $('#dir').title = st.captureDir;

  const items = await app.recent(3);
  // The example card shows your latest capture when there is one.
  $('#mini').style.backgroundImage = items[0]?.thumb ? `url("${items[0].thumb}")` : '';
  $('#recent').replaceChildren(...items.map((it) => {
    const b = document.createElement('button');
    b.className = 'thumb'; b.title = it.name;
    const img = document.createElement('img'); img.src = it.thumb; img.alt = '';
    const label = document.createElement('span'); label.textContent = it.label;
    b.append(img, label);
    b.onclick = () => api.openPath(it.path);
    return b;
  }));
  $('#recent').classList.toggle('hidden', !items.length);
  $('#empty').classList.toggle('hidden', !!items.length);
}

// Mini screen: the preview card at its real size relative to a ~1440px wide display.
const CARD_WIDTH = { small: 240, medium: 300, large: 380 };
function drawPreview() {
  const screen = $('#screen');
  const W = screen.clientWidth, H = screen.clientHeight;
  if (!W) return;
  const k = W / 1440, m = 6;
  const w = Math.round(CARD_WIDTH[st.previewSize] * k), h = Math.round(w * 0.63);
  const mac = st.platform === 'darwin';
  const top = mac ? 9 + m : m, bottom = mac ? m : 10 + m; // menu bar on top, taskbar at the bottom
  const spot = (corner) => {
    const [v, side] = corner.split('-');
    return [side === 'left' ? m : W - w - m, v === 'top' ? top : H - h - bottom];
  };
  $$('.slot').forEach((el) => {
    const [x, y] = spot(el.dataset.corner);
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    el.classList.toggle('on', el.dataset.corner === st.previewCorner);
  });
  const mini = $('#mini'), [x, y] = spot(st.previewCorner);
  Object.assign(mini.style, { width: `${w}px`, height: `${h}px`, transform: `translate(${x}px, ${y}px)` });
  mini.classList.toggle('copied', st.autoCopy);
  $$('#size button').forEach((b) => b.classList.toggle('on', b.dataset.size === st.previewSize));
}
function setPref(key, value) {
  st[key] = value;
  app.set(key, value);
  drawPreview();
}

async function init() {
  st = await app.state();
  const mac = st.platform === 'darwin';
  if (!mac) {
    document.body.classList.add('nonmac');
    $('#hint').textContent = 'Closing this window keeps OneShot running in the system tray.';
    $('#folder').textContent = st.platform === 'win32' ? 'Show in Explorer' : 'Show folder';
  }
  if (st.platform === 'linux') $('#row-login').classList.add('hidden');
  if (!mac) $('#row-perm').classList.add('hidden'); // only macOS gates capture
  $$('[data-sc]').forEach((el) => (el.innerHTML = keycaps(st.shortcuts[el.dataset.sc], st.platform)));
  $$('[data-capture]').forEach((b) => (b.onclick = () => api.capture(b.dataset.capture)));
  await refresh();
}

$('#open').onclick = () => app.openImages();
$('#bar').onclick = () => app.launcher();
$('#folder').onclick = () => api.openFolder();
$('#perm-fix').onclick = () => app.fixPermission();
$('#opt-login').onchange = (e) => app.set('openAtLogin', e.target.checked);
$('#dir-change').onclick = async () => { if (await app.chooseDir()) refresh(); };
$('#tour').onclick = () => app.tour();
$('#opt-copy').onchange = (e) => setPref('autoCopy', e.target.checked);
$$('.slot').forEach((b) => (b.onclick = () => setPref('previewCorner', b.dataset.corner)));
$$('#size button').forEach((b) => (b.onclick = () => setPref('previewSize', b.dataset.size)));
$('#try').onclick = () => app.tryPreview();
window.addEventListener('resize', () => st && drawPreview());
$('#quit').onclick = () => app.quit();
app.onRefresh(refresh);
window.addEventListener('focus', refresh);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.closeWindow(); });

init();
