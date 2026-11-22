// OneShot editor/viewer entry: history, loading & folder navigation, modes and
// tools, keyboard/menu/zoom/drop handling, and boot.
import { api, $, param } from '../lib.js';
import { moveAnn, TOOLS } from './model.js';
import { S, view, history, snapshot, canvas, wrap, isWarpTool } from './state.js';
import { relayout, requestRender, setZoom, actualSize } from './view.js';
import { commitText, isTyping } from './text.js';
import { toolCursor } from './pointer.js';
import { applyTool, copyOut, saveOut } from './ops.js';
import {
  buildUI, closePops, popOpen, setHud, setToolButtons, syncButtons, syncInspector, syncStyleFrom, toast,
} from './ui.js';

// ── History ──────────────────────────────────────────────────────────────────
export function commit() {
  history.push(snapshot());
  S.dirty = true; syncButtons();
}
function restore(s) {
  const baseChanged = s.base !== S.base;
  S.base = s.base; S.anns = structuredClone(s.anns); S.bg = { ...s.bg }; S.selected = null;
  if (baseChanged) updateDims();
  syncInspector(); relayout(); syncButtons();
}
export function undo() { const s = history.undo(); if (s) restore(s); }
export function redo() { const s = history.redo(); if (s) restore(s); }

// ── Loading & navigation ─────────────────────────────────────────────────────
async function loadFile(p, { fit = false } = {}) {
  if (S.dirty && !confirm('Discard your edits to this image?')) return;
  let res;
  try { res = await api.readImage(p); } catch { toast('Could not open image'); return; }
  const bmp = await createImageBitmap(new Blob([res.data], { type: res.mime }));
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  Object.assign(S, { file: p, name: res.name, base: c, anns: [], selected: null, crop: null, quad: null, zoom: null, dirty: false, draft: null });
  history.reset(snapshot());
  $('#filename').textContent = res.name;
  document.title = res.name;
  document.body.classList.remove('empty');
  updateDims();
  api.setFile(p);
  if (fit) api.fitWindow(c.width / devicePixelRatio, c.height / devicePixelRatio);
  setTimeout(relayout, fit ? 60 : 0); // again after the window resize lands
  relayout(); syncButtons();
  S.siblings = await api.siblings(p).catch(() => [p]);
  syncNav();
}
export function updateDims() { $('#dims').textContent = `${S.base.width} × ${S.base.height}`; }
function syncNav() {
  const i = S.siblings.indexOf(S.file), n = S.siblings.length;
  $('#counter').textContent = n ? `${i + 1} / ${n}` : '';
  $('#prev').disabled = i <= 0; $('#next').disabled = i < 0 || i >= n - 1;
}
export function step(d) {
  const i = S.siblings.indexOf(S.file), j = i + d;
  if (i >= 0 && j >= 0 && j < S.siblings.length) loadFile(S.siblings[j]);
}

// ── Modes & tools ────────────────────────────────────────────────────────────
export function setMode(m) {
  if (!S.base && m === 'edit') return;
  commitText();
  S.mode = m;
  document.body.classList.toggle('mode-edit', m === 'edit');
  document.body.classList.toggle('mode-view', m === 'view');
  if (m === 'view') { setTool('select'); S.selected = null; closePops(); }
  $('#edit-toggle').textContent = m === 'edit' ? 'Done' : 'Edit';
  S.zoom = null; relayout();
}

export function setTool(t) {
  if (t === S.tool && !isWarpTool(t)) return;
  commitText();
  S.tool = t; S.crop = null; S.quad = null;
  if (t === 'crop') S.crop = { x: 0, y: 0, w: S.base.width, h: S.base.height };
  if (t === 'perspective') {
    const W = S.base.width, H = S.base.height, i = Math.min(W, H) * 0.06;
    S.quad = [[i, i], [W - i, i], [W - i, H - i], [i, H - i]];
  }
  if (isWarpTool(t)) S.selected = null;
  setToolButtons(t);
  document.body.classList.toggle('hud', isWarpTool(t));
  if (t === 'perspective') setHud('Drag the corners onto the edges of the document');
  canvas.style.cursor = toolCursor(t);
  requestRender();
}

export function select(a) { S.selected = a; if (a) syncStyleFrom(a); requestRender(); }

function deleteSelected() {
  S.anns = S.anns.filter((a) => a !== S.selected); S.selected = null; commit(); requestRender();
}

// ── Keyboard, menu, zoom, drop ───────────────────────────────────────────────
api.onMenu((cmd) => {
  const typing = isTyping();
  if (cmd === 'undo') typing ? document.execCommand('undo') : undo();
  if (cmd === 'redo') typing ? document.execCommand('redo') : redo();
  if (cmd === 'copy') typing ? document.execCommand('copy') : copyOut();
  if (cmd === 'save') saveOut();
});

const ARROWS = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };

window.addEventListener('keydown', (e) => {
  if (isTyping()) return;
  const k = e.key.toLowerCase();
  if (e.metaKey || e.ctrlKey) {
    const zoom = { 0: null, 1: actualSize(), '=': view.scale * 1.25, '+': view.scale * 1.25, '-': view.scale / 1.25 };
    if (k in zoom) { setZoom(zoom[k]); e.preventDefault(); }
    return;
  }
  if (!S.base) return;
  if (S.mode === 'view') {
    if (k === 'arrowleft') step(-1);
    else if (k === 'arrowright') step(1);
    else if (k === 'e' || k === 'enter') setMode('edit');
    return;
  }
  if (k === 'escape') {
    if (popOpen()) closePops();
    else if (isWarpTool()) setTool('select');
    else if (S.selected) select(null);
    else setMode('view');
    return;
  }
  if (k === 'enter') { applyTool(); return; }
  if ((k === 'backspace' || k === 'delete') && S.selected) { deleteSelected(); return; }
  if (ARROWS[k] && S.selected) {
    const d = e.shiftKey ? 10 : 1, [dx, dy] = ARROWS[k];
    moveAnn(S.selected, dx * d, dy * d);
    commit(); requestRender(); e.preventDefault(); return;
  }
  const tool = TOOLS.find((t) => t && t[2] === k);
  if (tool) setTool(tool[0]);
});

wrap.addEventListener('wheel', (e) => {
  if (!S.base || !e.ctrlKey) return; // pinch-to-zoom arrives as ctrl+wheel
  e.preventDefault();
  const r = canvas.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
  setZoom(view.scale * Math.exp(-e.deltaY * 0.01));
  const r2 = canvas.getBoundingClientRect();
  wrap.scrollLeft += r2.left + fx * r2.width - e.clientX;
  wrap.scrollTop += r2.top + fy * r2.height - e.clientY;
}, { passive: false });

document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragover'); });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragover'); });
document.addEventListener('drop', (e) => {
  e.preventDefault(); document.body.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f) loadFile(api.pathForFile(f), { fit: !S.base });
});

// Viewer chrome: show on mouse movement, fade when idle.
let idle;
function wake() {
  document.body.classList.add('chrome');
  clearTimeout(idle);
  idle = setTimeout(() => {
    if (!document.querySelector('#pill:hover, #titlebar:hover')) document.body.classList.remove('chrome'); else wake();
  }, 1800);
}
window.addEventListener('mousemove', wake);
new ResizeObserver(() => relayout()).observe(wrap);

// ── Boot ─────────────────────────────────────────────────────────────────────
if (api.platform !== 'darwin') document.body.classList.add('nonmac');
buildUI();
syncInspector();
syncButtons();
const initial = param('file');
if (initial) loadFile(initial, { fit: true }).then(() => { if (param('mode') === 'edit') setMode('edit'); });
wake();
