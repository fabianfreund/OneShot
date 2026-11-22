// Destructive ops (crop, perspective, rotate, flip) and export (copy, save, drag-out).
import { api } from '../lib.js';
import { moveAnn } from './model.js';
import { warpPixels } from './warp.js';
import { S } from './state.js';
import { compose, drawAnn } from './draw.js';
import { docLayout, relayout } from './view.js';
import { commitText } from './text.js';
import { commit, setTool, updateDims } from './app.js';
import { toast } from './ui.js';

function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Base image with annotations burned in (for ops that can't keep vectors aligned).
function flattened() {
  const c = newCanvas(S.base.width, S.base.height), x = c.getContext('2d');
  x.drawImage(S.base, 0, 0);
  for (const a of S.anns) drawAnn(x, a, 1);
  return c;
}

function replaceBase(c, { keepAnns = false } = {}) {
  S.base = c;
  if (!keepAnns) { S.anns = []; S.selected = null; }
  updateDims(); commit(); setTool('select'); S.zoom = null; relayout();
}

// Crop keeps annotations editable by shifting them.
export function applyCrop() {
  const k = S.crop, x = Math.round(k.x), y = Math.round(k.y), w = Math.round(k.w), h = Math.round(k.h);
  const c = newCanvas(w, h); c.getContext('2d').drawImage(S.base, x, y, w, h, 0, 0, w, h);
  for (const a of S.anns) moveAnn(a, -x, -y);
  replaceBase(c, { keepAnns: true });
}

export function applyPerspective() {
  const src = flattened();
  const out = warpPixels(src.getContext('2d').getImageData(0, 0, src.width, src.height), S.quad);
  if (!out) { toast('Those corners don’t form a valid shape'); return; }
  const c = newCanvas(out.width, out.height);
  c.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
  replaceBase(c);
}

export function applyTool() {
  if (S.tool === 'crop') applyCrop();
  else if (S.tool === 'perspective') applyPerspective();
}

export function rotate(dir) {
  const src = flattened(), c = newCanvas(src.height, src.width), x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2); x.rotate((dir * Math.PI) / 2); x.drawImage(src, -src.width / 2, -src.height / 2);
  replaceBase(c);
}

export function flip(horizontal) {
  const src = flattened(), c = newCanvas(src.width, src.height), x = c.getContext('2d');
  if (horizontal) { x.translate(c.width, 0); x.scale(-1, 1); } else { x.translate(0, c.height); x.scale(1, -1); }
  x.drawImage(src, 0, 0);
  replaceBase(c);
}

// ── Export: always rendered at 1:1 ───────────────────────────────────────────
function exportCanvas() {
  commitText();
  const lay = docLayout(), c = newCanvas(lay.cw, lay.ch);
  compose(c.getContext('2d'), lay, 1);
  return c;
}
async function exportBuffer() {
  const blob = await new Promise((r) => exportCanvas().toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
const stem = () => S.name.replace(/\.[^.]+$/, '');

export async function copyOut() {
  if (!S.base) return;
  await api.copyImage(await exportBuffer());
  toast('Copied to clipboard');
}

export async function saveOut() {
  if (!S.base) return;
  // Main resolves the folder next to the original, so this works with any path separator.
  const out = await api.saveAs(await exportBuffer(), `${stem()} edited.png`, S.file);
  if (out) { S.dirty = false; toast('Saved'); }
}

export function dragOut() {
  if (S.base) api.dragData(exportCanvas().toDataURL('image/png'), `${stem() || 'OneShot'}.png`);
}
