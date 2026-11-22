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
  $('#dir').textContent = st.captureDir.replace(st.home, '~');
  $('#dir').title = st.captureDir;

  const items = await app.recent(3);
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
$('#quit').onclick = () => app.quit();
app.onRefresh(refresh);
window.addEventListener('focus', refresh);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.closeWindow(); });

init();
