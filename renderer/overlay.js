'use strict';
// Quick-access card shown in the corner after every capture.
const api = window.oneshot;
const file = new URLSearchParams(location.search).get('file');
const $ = (id) => document.getElementById(id);
const card = $('card');
const LIFE = 10000;

if (api.platform === 'win32') $('reveal').title = 'Show in Explorer';
else if (api.platform !== 'darwin') $('reveal').title = 'Show in Folder';
card.style.setProperty('--life', `${LIFE}ms`);

api.readImage(file).then((r) => {
  const url = URL.createObjectURL(new Blob([r.data], { type: r.mime }));
  $('thumb').src = url;
  $('thumb').onload = () => { $('dims').textContent = `${$('thumb').naturalWidth} × ${$('thumb').naturalHeight}`; };
});

let closing = false;
function dismiss() {
  if (closing) return;
  closing = true;
  card.classList.add('out');
  setTimeout(() => api.closeWindow(), 250);
}

// Auto-dismiss follows the drain line: paused while hovered, restarts the remaining time.
let left = LIFE, started = Date.now(), timer = setTimeout(dismiss, LIFE);
card.addEventListener('mouseenter', () => { clearTimeout(timer); left -= Date.now() - started; });
card.addEventListener('mouseleave', () => { started = Date.now(); timer = setTimeout(dismiss, Math.max(left, 1500)); });

$('copy').onclick = async () => {
  await api.copyFile(file);
  card.classList.add('copied', 'hold');
  setTimeout(dismiss, 900);
};
$('edit').onclick = () => api.edit(file);
$('pin').onclick = () => api.pin(file);
$('reveal').onclick = () => { api.reveal(file); dismiss(); };
$('savecopy').onclick = async () => { card.classList.add('hold'); if (await api.saveCopy(file)) dismiss(); else card.classList.remove('hold'); };
$('close').onclick = (e) => { e.stopPropagation(); dismiss(); };
$('card').addEventListener('dblclick', (e) => { if (!e.target.closest('button')) api.edit(file); });
$('card').addEventListener('dragstart', (e) => { e.preventDefault(); api.dragFile(file); setTimeout(dismiss, 400); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') dismiss();
  if ((e.metaKey || e.ctrlKey) && e.key === 'c') $('copy').click();
});
