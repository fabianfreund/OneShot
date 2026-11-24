// Area selection (Windows/Linux). Main shows this window over one display with a
// frozen screenshot of it; we report the chosen rectangle in window (DIP) coordinates.
import { api, $, param, loadImage } from './lib.js';

const shot = $('#shot');
// Device pixels per DIP, per axis.
const ratio = (axis) => (shot.naturalWidth ? (axis === 'y' ? shot.naturalHeight / innerHeight : shot.naturalWidth / innerWidth) : devicePixelRatio);
let start = null, rect = null, finished = false;

loadImage(param('file')).then(({ url }) => { shot.src = url; });

function finish(r) {
  if (finished) return;
  finished = true;
  if (r) api.select.done(r); else api.select.cancel();
}

function draw() {
  const s = $('#sel').style;
  Object.assign(s, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
  const size = $('#size');
  size.textContent = `${Math.round(rect.w * ratio('x'))} × ${Math.round(rect.h * ratio('y'))}`;
  // Under the selection, or inside it when there is no room at the bottom.
  const below = rect.y + rect.h + 30 < innerHeight;
  size.style.left = `${Math.min(rect.x, innerWidth - size.offsetWidth - 6)}px`;
  size.style.top = `${below ? rect.y + rect.h + 8 : Math.max(rect.y + 8, 6)}px`;
}

window.addEventListener('pointermove', (e) => {
  document.body.classList.remove('idle');
  $('#gx').style.top = `${e.clientY}px`;
  $('#gy').style.left = `${e.clientX}px`;
  if (!start) return;
  const x = Math.max(0, Math.min(e.clientX, innerWidth)), y = Math.max(0, Math.min(e.clientY, innerHeight));
  rect = { x: Math.min(start.x, x), y: Math.min(start.y, y), w: Math.abs(x - start.x), h: Math.abs(y - start.y) };
  if (rect.w > 2 || rect.h > 2) document.body.classList.add('dragging');
  draw();
});
window.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  try { document.documentElement.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
  start = { x: e.clientX, y: e.clientY };
  rect = null;
});
window.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || !start) return;
  start = null;
  // A plain click (no real drag) takes the whole display.
  finish(rect && rect.w >= 4 && rect.h >= 4 ? rect : { x: 0, y: 0, w: innerWidth, h: innerHeight });
});
window.addEventListener('contextmenu', (e) => { e.preventDefault(); finish(null); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') finish(null);
  if (e.key === 'Enter') finish({ x: 0, y: 0, w: innerWidth, h: innerHeight });
});
