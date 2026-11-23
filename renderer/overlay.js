// Quick-access card shown in the corner after every capture.
import { api, $, param, loadImage } from './lib.js';

const file = param('file');
const card = $('#card');
const thumb = $('#thumb');
const LIFE = 10000;

if (api.platform === 'win32') $('#reveal').title = 'Show in Explorer';
else if (api.platform !== 'darwin') $('#reveal').title = 'Show in Folder';
card.style.setProperty('--life', `${LIFE}ms`);
document.body.classList.toggle('right', param('side') === 'right');
document.body.classList.toggle('top', param('vert') === 'top');
document.body.classList.toggle('small', param('size') === 'small');
document.body.classList.toggle('copied', param('copied') === '1'); // auto-copied right after the capture

thumb.onload = () => { $('#dims').textContent = `${thumb.naturalWidth} × ${thumb.naturalHeight}`; };
loadImage(file).then(({ url }) => { thumb.src = url; });

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

$('#copy').onclick = async () => {
  if (!(await api.copyFile(file))) return;
  card.classList.add('copied', 'hold');
  setTimeout(dismiss, 900);
};
$('#edit').onclick = () => api.edit(file);
$('#pin').onclick = () => api.pin(file);
$('#reveal').onclick = () => { api.reveal(file); dismiss(); };
$('#savecopy').onclick = async () => { card.classList.add('hold'); if (await api.saveCopy(file)) dismiss(); else card.classList.remove('hold'); };
$('#close').onclick = (e) => { e.stopPropagation(); dismiss(); };
card.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) api.edit(file); });
thumb.addEventListener('dragstart', (e) => { e.preventDefault(); api.dragFile(file); setTimeout(dismiss, 400); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') dismiss();
  if ((e.metaKey || e.ctrlKey) && e.key === 'c') $('#copy').click();
});
