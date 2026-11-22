// Welcome flow: 0 intro → 1 screen-recording permission → 2 shortcuts → 3 menu bar & options.
// The step is saved in main, so the relaunch macOS needs after granting the
// permission lands back here (with the permission shown as granted).
import { api as bridge, $, $$, keycaps } from './lib.js';

const api = bridge.onboarding;
const steps = $$('.step');
const LAST = steps.length - 1;
let st = null, step = 0, asked = false;

function go(n) {
  step = Math.max(0, Math.min(LAST, n));
  $('#track').style.transform = `translateX(${-step * (100 / steps.length)}%)`;
  steps.forEach((s, i) => s.classList.toggle('current', i === step));
  $$('#dots i').forEach((d, i) => d.classList.toggle('on', i === step));
  api.setStep(step);
  render();
}

function render() {
  const granted = st.screen === 'granted';
  const mac = st.platform === 'darwin';
  const blocked = step === 1 && !granted;
  $('#back').classList.toggle('hidden', step === 0);
  $('#skip').classList.toggle('hidden', !blocked);
  $('#next').textContent = blocked ? (asked ? 'Quit & Reopen' : 'Allow Access')
    : ['Get Started', 'Continue', 'Continue', 'Open OneShot'][step];

  // Permission step
  $('#perm-badge').classList.toggle('ok', granted);
  $('#perm-title').textContent = granted ? 'Screen Recording is on' : 'Allow Screen Recording';
  $('#perm-sub').textContent = !mac ? 'No extra permission needed here. You are good to go.'
    : granted ? 'OneShot can capture your screen.' : 'macOS asks once. Your captures stay on this Mac.';
  $('#perm-ok').classList.toggle('hidden', !granted);
  $('#perm-detail').textContent = granted ? 'Ready' : asked ? 'Turn OneShot on in System Settings, then reopen' : 'Needed to take screenshots';
  $('#perm-note').textContent = !mac || granted ? ''
    : !st.packaged ? 'Dev build: allow the terminal app you ran “npm start” from.'
      : asked ? 'macOS only applies the change after OneShot restarts. You will land right back here.' : '';
}

async function init() {
  st = await api.state();
  const mac = st.platform === 'darwin';
  if (!mac) document.body.classList.add('nonmac');
  $$('[data-sc]').forEach((el) => (el.innerHTML = keycaps(st.shortcuts[el.dataset.sc], st.platform)));
  if (!mac) {
    $('#ready-sub').textContent = 'OneShot runs quietly in your system tray.';
    $('#menubar').classList.add('hidden');
    $('#tip-tray').innerHTML = '<b>Click the tray icon</b> for the capture bar, or right-click it for everything else.';
    $('#tip-home').innerHTML = '<b>Open OneShot</b> from the Start menu any time for your captures and settings.';
  }
  if (st.platform === 'linux') $('#row-login').closest('.card').classList.add('hidden');
  $('#opt-login').checked = st.openAtLogin;
  go(st.step || 0);
}

$('#next').onclick = () => {
  if (step === 1 && st.screen !== 'granted') return asked ? api.relaunch() : allow();
  if (step < LAST) go(step + 1); else api.finish();
};
$('#back').onclick = () => go(step - 1);
$('#skip').onclick = () => go(2);
async function allow() {
  st.screen = await api.requestScreen();
  asked = st.screen !== 'granted';
  render();
}
$('#opt-login').onchange = (e) => bridge.app.set('openAtLogin', e.target.checked);
api.onStep((n) => go(n));

// macOS sometimes reports the new permission without a relaunch; move on if so.
setInterval(async () => {
  if (step !== 1 || st.screen === 'granted') return;
  const s = await api.state();
  if (s.screen === st.screen) return;
  st.screen = s.screen; render();
  if (s.screen === 'granted') setTimeout(() => step === 1 && go(2), 900);
}, 1500);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#next').click();
  if (e.key === 'ArrowRight' && !(step === 1 && st.screen !== 'granted')) go(step + 1);
  if (e.key === 'ArrowLeft') go(step - 1);
});

init();
