// Mouse/pen interaction on the canvas: drawing, selecting, moving, resizing, crop and perspective handles.
import { clamp } from '../util.js';
import { HIGHLIGHT_COLOR, SEGMENT_TYPES, nextCounter, norm } from './model.js';
import { S, view, canvas, sz, annsChanged } from './state.js';
import { cropHandles, handles, insideRect, nearest, topHit } from './draw.js';
import { requestRender, toImg } from './view.js';
import { justCommittedText, startText } from './text.js';
import { commit, select, setMode } from './app.js';

const MIN_CROP = 8;
const QUAD_GRAB = 40; // screen px
const RESIZE_CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', p1: 'move', p2: 'move' };

let drag = null;

export const toolCursor = (t = S.tool) => (t === 'select' ? 'default' : t === 'text' ? 'text' : 'crosshair');

function nearestQuadCorner(p) {
  let best = -1, bd = Infinity;
  S.quad.forEach(([x, y], i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
  return bd < QUAD_GRAB / view.scale ? best : -1;
}

function beginDrag(p) {
  const t = S.tool, W = S.base.width, H = S.base.height;
  if (t === 'crop') {
    const h = nearest(cropHandles(S.crop), p);
    if (h) return { kind: 'crop-resize', h: h[0], orig: { ...S.crop } };
    if (insideRect(p, S.crop)) return { kind: 'crop-move', start: p, orig: { ...S.crop } };
    return { kind: 'crop-new', start: { x: clamp(p.x, 0, W), y: clamp(p.y, 0, H) } };
  }
  if (t === 'perspective') {
    const i = nearestQuadCorner(p);
    return i >= 0 ? { kind: 'quad', i } : null;
  }
  if (S.selected) {
    const h = nearest(handles(S.selected), p);
    if (h) return { kind: 'handle', h: h[0], a: S.selected, orig: structuredClone(S.selected) };
  }
  if (t === 'select') {
    const a = topHit(p); select(a);
    return a ? { kind: 'move', a, start: p, orig: structuredClone(a) } : null;
  }
  if (t === 'counter') {
    const a = { type: 'counter', x: p.x, y: p.y, n: nextCounter(S.anns), color: S.color, r: sz('counter') };
    S.anns.push(a); select(a); commit();
    return null;
  }
  if (t === 'text') { startText(null, p); return null; }
  if (SEGMENT_TYPES.has(t)) S.draft = { type: t, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: S.color, w: sz('stroke') };
  else S.draft = { type: t, x: p.x, y: p.y, w: 0, h: 0, color: t === 'highlight' ? HIGHLIGHT_COLOR : S.color, sw: sz('stroke') };
  return { kind: 'draft', start: p };
}

function updateDraft(d, p, shift) {
  if (SEGMENT_TYPES.has(d.type)) {
    let x = p.x, y = p.y;
    if (shift) { // snap to 15°
      const step = Math.PI / 12, ang = Math.round(Math.atan2(y - d.y1, x - d.x1) / step) * step;
      const len = Math.hypot(x - d.x1, y - d.y1);
      x = d.x1 + Math.cos(ang) * len; y = d.y1 + Math.sin(ang) * len;
    }
    d.x2 = x; d.y2 = y;
  } else {
    d.w = p.x - d.x; d.h = p.y - d.y;
    if (shift) { const s = Math.max(Math.abs(d.w), Math.abs(d.h)); d.w = Math.sign(d.w || 1) * s; d.h = Math.sign(d.h || 1) * s; }
  }
}

function resizeAnn(a, h, orig, p) {
  if (SEGMENT_TYPES.has(a.type)) { if (h === 'p1') { a.x1 = p.x; a.y1 = p.y; } else { a.x2 = p.x; a.y2 = p.y; } return; }
  const o = norm(orig);
  let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
  if (h.includes('w')) x1 = p.x;
  if (h.includes('e')) x2 = p.x;
  if (h.includes('n')) y1 = p.y;
  if (h.includes('s')) y2 = p.y;
  Object.assign(a, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });
}

function updateCrop(p, W, H) {
  const o = drag.orig;
  if (drag.kind === 'crop-move') {
    S.crop = { ...o, x: clamp(o.x + p.x - drag.start.x, 0, W - o.w), y: clamp(o.y + p.y - drag.start.y, 0, H - o.h) };
  } else if (drag.kind === 'crop-new') {
    const s = drag.start, x = clamp(p.x, 0, W), y = clamp(p.y, 0, H);
    S.crop = { x: Math.min(s.x, x), y: Math.min(s.y, y), w: Math.max(MIN_CROP, Math.abs(x - s.x)), h: Math.max(MIN_CROP, Math.abs(y - s.y)) };
  } else {
    const h = drag.h;
    let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
    if (h.includes('w')) x1 = clamp(p.x, 0, x2 - MIN_CROP);
    if (h.includes('e')) x2 = clamp(p.x, x1 + MIN_CROP, W);
    if (h.includes('n')) y1 = clamp(p.y, 0, y2 - MIN_CROP);
    if (h.includes('s')) y2 = clamp(p.y, y1 + MIN_CROP, H);
    S.crop = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
}

function updateCursor(p) {
  let cur = toolCursor();
  if (S.tool === 'crop' && S.crop) {
    const h = nearest(cropHandles(S.crop), p);
    cur = h ? RESIZE_CURSOR[h[0]] : insideRect(p, S.crop) ? 'move' : 'crosshair';
  } else if (S.tool === 'perspective') {
    cur = nearestQuadCorner(p) >= 0 ? 'grab' : 'default';
  } else {
    const h = S.selected && nearest(handles(S.selected), p);
    if (h) cur = RESIZE_CURSOR[h[0]];
    else if (S.tool === 'select' && topHit(p)) cur = 'move';
  }
  canvas.style.cursor = cur;
}

canvas.addEventListener('pointerdown', (e) => {
  if (!S.base || S.mode !== 'edit' || e.button !== 0 || justCommittedText()) return;
  canvas.setPointerCapture(e.pointerId);
  drag = beginDrag(toImg(e));
});

canvas.addEventListener('pointermove', (e) => {
  if (!S.base || S.mode !== 'edit') return;
  const p = toImg(e);
  if (!drag) return updateCursor(p);
  const W = S.base.width, H = S.base.height;
  switch (drag.kind) {
    case 'draft': updateDraft(S.draft, p, e.shiftKey); break;
    case 'move': {
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y, o = drag.orig;
      if (SEGMENT_TYPES.has(o.type)) Object.assign(drag.a, { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy });
      else Object.assign(drag.a, { x: o.x + dx, y: o.y + dy });
      break;
    }
    case 'handle': resizeAnn(drag.a, drag.h, drag.orig, p); break;
    case 'crop-new': case 'crop-resize': case 'crop-move': updateCrop(p, W, H); break;
    case 'quad': S.quad[drag.i] = [clamp(p.x, 0, W), clamp(p.y, 0, H)]; break;
  }
  requestRender();
});

canvas.addEventListener('pointerup', () => {
  if (!drag) return;
  const k = drag.kind; drag = null;
  if (k === 'draft') {
    const d = S.draft; S.draft = null;
    const big = SEGMENT_TYPES.has(d.type) ? Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 4 / view.scale
      : Math.abs(d.w) > 3 / view.scale && Math.abs(d.h) > 3 / view.scale;
    if (big) {
      if (!SEGMENT_TYPES.has(d.type)) Object.assign(d, norm(d));
      S.anns.push(d); select(d); commit();
    }
  } else if ((k === 'move' || k === 'handle') && annsChanged()) {
    commit();
  }
  requestRender();
});

canvas.addEventListener('dblclick', (e) => {
  if (S.mode === 'view') { setMode('edit'); return; }
  const a = topHit(toImg(e));
  if (a?.type === 'text') startText(a);
});
