// Editor document model: constants and pure helpers (no DOM, unit-tested).
//
// A document is a raster `base` (changed only by destructive ops: crop,
// perspective, rotate, flip) + a list of vector annotations + background
// settings. Annotation coordinates are in base-image pixels.

export const TOOLS = [
  ['select', 'Select', 'v'], null,
  ['arrow', 'Arrow', 'a'], ['line', 'Line', 'l'], ['rect', 'Rectangle', 'r'], ['ellipse', 'Ellipse', 'o'], ['text', 'Text', 't'],
  ['counter', 'Counter', 'n'], ['highlight', 'Highlighter', 'h'], ['blur', 'Pixelate', 'b'], null,
  ['crop', 'Crop', 'c'], ['perspective', 'Perspective Crop', 'p'],
];
export const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#0A84FF', '#BF5AF2', '#1C1C1E', '#FFFFFF'];
export const HIGHLIGHT_COLOR = '#FFD60A';
export const BACKDROPS = [
  { id: 'sunset', stops: ['#ff9a5a', '#ff4f7b', '#8a3ffc'], blobs: ['#ffd36e', '#5b4bff'] },
  { id: 'ocean', stops: ['#3ad6ff', '#2f6bff', '#2a2a8f'], blobs: ['#9ff3ff', '#7b2cbf'] },
  { id: 'mint', stops: ['#c8f7c5', '#3ddc97', '#0f9b8e'], blobs: ['#f6ffb0', '#1e6fa8'] },
  { id: 'candy', stops: ['#fbc2eb', '#c39bff', '#7f7fff'], blobs: ['#ffe0f0', '#5f6bff'] },
  { id: 'citrus', stops: ['#fff07a', '#ffb347', '#ff5f6d'], blobs: ['#ffffff', '#ff2e63'] },
  { id: 'aurora', stops: ['#0f2027', '#2c5364', '#1d976c'], blobs: ['#93f9b9', '#6a3093'] },
  { id: 'dusk', stops: ['#2b1055', '#7597de'], blobs: ['#ff7eb3', '#2b1055'] },
  { id: 'graphite', stops: ['#4a4a52', '#1c1c1f'], blobs: ['#6a6a78', '#000000'] },
  { id: 'paper', solid: '#efeff2' },
  { id: 'clear', solid: null },
];
export const RATIOS = { auto: null, '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 };
export const BOX_TYPES = new Set(['rect', 'ellipse', 'blur', 'highlight']);
// Two-point annotations: x1/y1 → x2/y2 with stroke width w.
export const SEGMENT_TYPES = new Set(['arrow', 'line']);
export const DEFAULT_BG = { enabled: false, preset: 'sunset', padding: 8, radius: 12, shadow: 45, ratio: 'auto' };

// Box with positive width/height.
export function norm(a) {
  return { x: Math.min(a.x, a.x + a.w), y: Math.min(a.y, a.y + a.h), w: Math.abs(a.w), h: Math.abs(a.h) };
}

// Composite size (image + background padding/ratio) and where the image sits in it.
export function layout(W, H, bg) {
  if (!bg.enabled) return { cw: W, ch: H, ox: 0, oy: 0 };
  const pad = Math.round((bg.padding / 100) * Math.max(W, H));
  let cw = W + pad * 2, ch = H + pad * 2;
  const r = RATIOS[bg.ratio];
  if (r) { if (cw / ch < r) cw = Math.round(ch * r); else ch = Math.round(cw / r); }
  return { cw, ch, ox: Math.round((cw - W) / 2), oy: Math.round((ch - H) / 2) };
}

// Annotation sizes scale with the image, so Retina captures get proportionally thicker marks.
export function sizeFor(kind, size, W, H) {
  const u = Math.max(2, Math.max(W, H) / 260);
  return {
    stroke: u * [0.75, 1.25, 2][size],
    font: u * [3.2, 4.4, 6.5][size],
    counter: u * [2.6, 3.4, 4.4][size],
  }[kind];
}

export function moveAnn(a, dx, dy) {
  if (SEGMENT_TYPES.has(a.type)) { a.x1 += dx; a.x2 += dx; a.y1 += dy; a.y2 += dy; } else { a.x += dx; a.y += dy; }
}

export const nextCounter = (anns) => Math.max(0, ...anns.filter((a) => a.type === 'counter').map((a) => a.n)) + 1;

// Snapshot undo history. The first entry is the opened image and is never dropped.
export class History {
  constructor(limit = 80) { this.limit = limit; this.reset(null); }
  reset(state) { this.past = state ? [state] : []; this.future = []; }
  push(state) {
    this.past.push(state); this.future = [];
    if (this.past.length > this.limit) this.past.splice(1, 1);
  }
  get top() { return this.past.at(-1); }
  get canUndo() { return this.past.length > 1; }
  get canRedo() { return this.future.length > 0; }
  undo() { if (!this.canUndo) return null; this.future.push(this.past.pop()); return this.top; }
  redo() { const s = this.future.pop(); if (s) this.past.push(s); return s ?? null; }
}
