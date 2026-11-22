'use strict';
// First-run welcome: 0 intro → 1 screen-recording permission → 2 shortcuts & options.
const api = window.oneshot.onboarding;
const $ = (s) => document.querySelector(s);
const steps = [...document.querySelectorAll('.step')];
let st = null, step = 0, asked = false;

const MAC_KEYS = { Alt: '⌥', Shift: '⇧', Cmd: '⌘', CmdOrCtrl: '⌘', Ctrl: '⌃' };

function keycaps(acc) {
  const mac = st.platform === 'darwin';
  return acc.split('+').map((k) => `<kbd>${mac ? (MAC_KEYS[k] || k) : k}</kbd>`).join('');
}

function go(n) {
  step = Math.max(0, Math.min(2, n));
  $('#track').style.transform = `translateX(${-step * (100 / 3)}%)`;
  steps.forEach((s, i) => s.classList.toggle('current', i === step));
  document.querySelectorAll('#dots i').forEach((d, i) => d.classList.toggle('on', i === step));
  api.setStep(step);
  render();
}

function render() {
  const granted = st.screen === 'granted';
  $('#back').classList.toggle('hidden', step === 0);
  $('#skip').classList.toggle('hidden', !(step === 1 && !granted));
  $('#next').textContent = step === 1 && !granted ? (asked ? 'Relaunch OneShot' : 'Allow Access')
    : ['Get Started', 'Continue', 'Start Capturing'][step];

  // Permission step
  const mac = st.platform === 'darwin';
  $('#perm-badge').classList.toggle('ok', granted);
  $('#perm-title').textContent = granted ? 'Screen Recording is on' : 'Allow Screen Recording';
  $('#perm-sub').textContent = !mac ? 'Windows needs no extra permission. You are good to go.'
    : granted ? 'OneShot can capture your screen.' : 'macOS asks once. Your captures stay on this Mac.';
  $('#perm-ok').classList.toggle('hidden', !granted);
  $('#perm-detail').textContent = granted ? 'Ready' : asked ? 'Turn OneShot on, then relaunch' : 'Needed to take screenshots';
  $('#perm-note').textContent = mac && !granted && !st.packaged
    ? 'Dev build: allow the terminal app you ran “npm start” from.' : '';
}

async function init() {
  st = await api.state();
  if (st.platform !== 'darwin') document.body.classList.add('nonmac');
  document.querySelectorAll('[data-sc]').forEach((el) => (el.innerHTML = keycaps(st.shortcuts[el.dataset.sc])));
  $('#ready-sub').textContent = st.platform === 'darwin' ? 'OneShot lives in your menu bar.' : 'OneShot lives in your system tray.';
  $('#opt-login').checked = st.openAtLogin;
  $('#opt-bar').checked = st.showBarOnLaunch;
  go(st.step || 0);
}

$('#next').onclick = () => {
  if (step === 1 && st.screen !== 'granted') return asked ? api.relaunch() : allow();
  if (step < 2) go(step + 1); else api.finish();
};
$('#back').onclick = () => go(step - 1);
$('#skip').onclick = () => go(2);
async function allow() {
  st.screen = await api.requestScreen();
  asked = st.screen !== 'granted';
  render();
}
$('#opt-login').onchange = (e) => api.set('openAtLogin', e.target.checked);
$('#opt-bar').onchange = (e) => api.set('showBarOnLaunch', e.target.checked);
api.onStep((n) => go(n));

// macOS sometimes reports the new permission without a relaunch; pick it up if so.
setInterval(async () => {
  if (step !== 1 || st.screen === 'granted') return;
  const s = await api.state();
  if (s.screen !== st.screen) { st.screen = s.screen; render(); }
}, 1500);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#next').click();
  if (e.key === 'ArrowRight' && step < 2) go(step + 1);
  if (e.key === 'ArrowLeft') go(step - 1);
});

init();
