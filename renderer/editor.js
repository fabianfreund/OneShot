'use strict';
// OneShot editor/viewer.
// Document model: a raster `base` (changed only by destructive ops: crop,
// perspective, rotate) + a list of vector annotations + background settings.
// Everything is re-composited on each frame, so annotations stay editable.

const api = window.oneshot;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;

const ICONS = {
  select: '<path d="M6 3.5l12.5 7.3-5.6 1.5-2.7 5.5z"/>',
  arrow: '<path d="M5 19L18 6M9.5 5.5H18.5V14.5"/>',
  rect: '<rect x="4" y="5.5" width="16" height="13" rx="2.5"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
  text: '<path d="M5.5 7V5h13v2M12 5v14M9 19h6"/>',
  counter: '<circle cx="12" cy="12" r="8.5"/><path d="M10.5 9.5L12.5 8v8"/>',
  highlight: '<path d="M4 20.5h16"/><path d="M8 16.5l-1-3 8.5-8.5 4 4-8.5 8.5z"/>',
  blur: '<path d="M4 4h4.5v4.5H4zM15.5 4H20v4.5h-4.5zM9.75 9.75h4.5v4.5h-4.5zM4 15.5h4.5V20H4zM15.5 15.5H20V20h-4.5z"/>',
  crop: '<path d="M6.5 2.5v15h15M2.5 6.5h15v15"/>',
  perspective: '<path d="M7.5 5h9l3.5 14H4z"/><circle cx="7.5" cy="5" r="1"/><circle cx="16.5" cy="5" r="1"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6.5a2.5 2.5 0 00-2.5-2.5H6.5A2.5 2.5 0 004 6.5V13a2.5 2.5 0 002.5 2.5h2"/>',
  save: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
  drag: '<path d="M8 9l4-4 4 4M12 5v10"/><path d="M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4"/>',
  edit: '<path d="M4.5 19.5h4l10.5-10.5-4-4L4.5 15.5z"/><path d="M13 7l4 4"/>',
  prev: '<path d="M14.5 6l-6 6 6 6"/>',
  next: '<path d="M9.5 6l6 6-6 6"/>',
  fit: '<path d="M4 9V5.5A1.5 1.5 0 015.5 4H9M15 4h3.5A1.5 1.5 0 0120 5.5V9M20 15v3.5a1.5 1.5 0 01-1.5 1.5H15M9 20H5.5A1.5 1.5 0 014 18.5V15"/>',
  rotl: '<path d="M4 11a8 8 0 112.3 5.7"/><path d="M4 4v7h7"/>',
  rotr: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
  fliph: '<path d="M12 3v18"/><path d="M8.5 7.5L4 12l4.5 4.5zM15.5 7.5L20 12l-4.5 4.5z"/>',
  flipv: '<path d="M3 12h18"/><path d="M7.5 8.5L12 4l4.5 4.5zM7.5 15.5L12 20l4.5-4.5z"/>',
  background: '<rect x="3" y="3" width="18" height="18" rx="5"/><rect x="7.5" y="7.5" width="9" height="9" rx="2"/>',
  transform: '<rect x="4" y="9" width="11" height="11" rx="2"/><path d="M9 4.5h3.5A7.5 7.5 0 0120 12v1.5"/><path d="M17.5 11l2.5 2.5 2.5-2.5"/>',
};

const TOOLS = [
  ['select', 'Select', 'v'], null,
  ['arrow', 'Arrow', 'a'], ['rect', 'Rectangle', 'r'], ['ellipse', 'Ellipse', 'o'], ['text', 'Text', 't'],
  ['counter', 'Counter', 'n'], ['highlight', 'Highlighter', 'h'], ['blur', 'Pixelate', 'b'], null,
  ['crop', 'Crop', 'c'], ['perspective', 'Perspective Crop', 'p'],
];
const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#0A84FF', '#BF5AF2', '#1C1C1E', '#FFFFFF'];
const BACKDROPS = [
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
const RATIOS = { auto: null, '1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9 };
const BOX_TYPES = new Set(['rect', 'ellipse', 'blur', 'highlight']);

const S = {
  file: null, name: '', siblings: [], base: null, anns: [], draft: null,
  bg: { enabled: false, preset: 'sunset', padding: 8, radius: 12, shadow: 45, ratio: 'auto' },
  tool: 'select', color: COLORS[0], size: 1, textStyle: 'pill',
  selected: null, mode: 'view', zoom: null, crop: null, quad: null, editingText: null, dirty: false, k: 1,
};
let undoStack = [], redoStack = [];
let L = { cw: 1, ch: 1, ox: 0, oy: 0 };
let viewScale = 1;
const canvas = $('#stage');
const ctx = canvas.getContext('2d');
const wrap = $('#stage-wrap');
const mctx = document.createElement('canvas').getContext('2d'); // text measuring

// ── Helpers ──────────────────────────────────────────────────────────────────
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function contrast(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.7 ? '#1c1c1e' : '#ffffff';
}
function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  c.beginPath(); c.roundRect(x, y, w, h, r);
}
function norm(a) {
  return { x: Math.min(a.x, a.x + a.w), y: Math.min(a.y, a.y + a.h), w: Math.abs(a.w), h: Math.abs(a.h) };
}
function unit() { return Math.max(2, Math.max(S.base.width, S.base.height) / 260); }
function sz(kind, size = S.size) {
  const u = unit();
  return {
    stroke: u * [0.75, 1.25, 2][size],
    font: u * [3.2, 4.4, 6.5][size],
    counter: u * [2.6, 3.4, 4.4][size],
  }[kind];
}
const textFont = (fs) => `600 ${fs}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
function textMetrics(a) {
  mctx.font = textFont(a.fs);
  const lines = (a.text || ' ').split('\n');
  const pad = a.fs * 0.4, lh = a.fs * 1.25;
  const tw = Math.max(a.fs * 0.5, ...lines.map((l) => mctx.measureText(l || ' ').width));
  return { lines, pad, lh, w: tw + pad * 2, h: lines.length * lh + pad * 2 };
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1400);
}

// ── Layout & rendering ───────────────────────────────────────────────────────
function layout() {
  const W = S.base.width, H = S.base.height;
  if (!S.bg.enabled) return { cw: W, ch: H, ox: 0, oy: 0 };
  const pad = Math.round((S.bg.padding / 100) * Math.max(W, H));
  let cw = W + pad * 2, ch = H + pad * 2;
  const r = RATIOS[S.bg.ratio];
  if (r) { if (cw / ch < r) cw = Math.round(ch * r); else ch = Math.round(cw / r); }
  return { cw, ch, ox: Math.round((cw - W) / 2), oy: Math.round((ch - H) / 2) };
}

function fitScale() {
  const m = S.mode === 'edit' ? 24 : 28, bottom = S.mode === 'edit' ? 64 : 0;
  return Math.min((wrap.clientWidth - m * 2) / L.cw, (wrap.clientHeight - bottom - m * 2) / L.ch, 1);
}

function relayout() {
  if (!S.base) return;
  L = layout();
  viewScale = S.zoom ?? fitScale();
  const dpr = devicePixelRatio;
  S.k = Math.min(viewScale * dpr, 2, 12000 / L.cw, 12000 / L.ch);
  canvas.width = Math.max(1, Math.round(L.cw * S.k));
  canvas.height = Math.max(1, Math.round(L.ch * S.k));
  canvas.style.width = `${L.cw * viewScale}px`;
  canvas.style.height = `${L.ch * viewScale}px`;
  canvas.style.imageRendering = viewScale * dpr > S.k + 0.01 ? 'pixelated' : 'auto';
  document.body.classList.toggle('bg-on', S.bg.enabled);
  render();
  if (S.editingText) positionTextInput(S.editingText);
}

let raf = 0;
function requestRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }

function render() {
  if (!S.base) return;
  ctx.setTransform(S.k, 0, 0, S.k, 0, 0);
  ctx.clearRect(0, 0, L.cw, L.ch);
  compose(ctx, L, S.k);
  if (S.mode === 'edit') drawOverlay(ctx);
}

function drawBackdrop(c, w, h, p) {
  if (!p.stops) { if (p.solid) { c.fillStyle = p.solid; c.fillRect(0, 0, w, h); } return; }
  const g = c.createLinearGradient(0, 0, w, h);
  p.stops.forEach((col, i) => g.addColorStop(i / (p.stops.length - 1), col));
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  (p.blobs || []).forEach((col, i) => {
    const cx = i ? w * 0.88 : w * 0.12, cy = i ? h * 0.92 : h * 0.08, R = Math.max(w, h) * 0.62;
    const rg = c.createRadialGradient(cx, cy, 0, cx, cy, R);
    rg.addColorStop(0, hexA(col, 0.85)); rg.addColorStop(1, hexA(col, 0));
    c.fillStyle = rg; c.fillRect(0, 0, w, h);
  });
}

// scale = device pixels per composite pixel (shadows aren't affected by transforms)
function compose(c, lay, scale) {
  const W = S.base.width, H = S.base.height, { ox, oy } = lay, bg = S.bg;
  if (bg.enabled) {
    const big = Math.max(W, H), r = (bg.radius / 1000) * big;
    drawBackdrop(c, lay.cw, lay.ch, BACKDROPS.find((b) => b.id === bg.preset));
    if (bg.shadow > 0) {
      c.save();
      c.shadowColor = `rgba(0,0,0,${0.12 + (bg.shadow / 100) * 0.38})`;
      c.shadowBlur = (bg.shadow / 100) * big * 0.045 * scale;
      c.shadowOffsetY = (bg.shadow / 100) * big * 0.014 * scale;
      c.fillStyle = '#000'; rr(c, ox, oy, W, H, r); c.fill();
      c.restore();
    }
    c.save(); rr(c, ox, oy, W, H, r); c.clip(); c.drawImage(S.base, ox, oy); c.restore();
  } else {
    c.drawImage(S.base, 0, 0);
  }
  c.save(); c.translate(ox, oy);
  for (const a of S.anns) if (a !== S.editingText) drawAnn(c, a, scale);
  if (S.draft) drawAnn(c, S.draft, scale);
  c.restore();
}

function drawArrow(c, a, scale) {
  const { x1, y1, x2, y2, w } = a;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len, px = -uy, py = ux;
  const head = Math.min(len * 0.55, w * 4.6), hw = w * 2.5;
  const bx = x2 - ux * head, by = y2 - uy * head;
  const tail = w * 0.3, neck = w * 0.85;
  c.save();
  c.shadowColor = 'rgba(0,0,0,.28)'; c.shadowBlur = w * 1.2 * scale; c.shadowOffsetY = w * 0.25 * scale;
  c.beginPath();
  c.moveTo(x1 + px * tail, y1 + py * tail);
  c.lineTo(bx + px * neck, by + py * neck);
  c.lineTo(bx + px * hw, by + py * hw);
  c.lineTo(x2, y2);
  c.lineTo(bx - px * hw, by - py * hw);
  c.lineTo(bx - px * neck, by - py * neck);
  c.lineTo(x1 - px * tail, y1 - py * tail);
  c.closePath();
  c.fillStyle = a.color; c.strokeStyle = a.color; c.lineJoin = 'round'; c.lineWidth = w * 0.35;
  c.fill(); c.stroke();
  c.restore();
}

function drawAnn(c, a, scale) {
  switch (a.type) {
    case 'arrow': drawArrow(c, a, scale); break;
    case 'rect': case 'ellipse': {
      const b = norm(a);
      c.save();
      c.shadowColor = 'rgba(0,0,0,.22)'; c.shadowBlur = a.sw * scale; c.shadowOffsetY = a.sw * 0.2 * scale;
      c.strokeStyle = a.color; c.lineWidth = a.sw; c.lineJoin = 'round';
      if (a.type === 'rect') rr(c, b.x, b.y, b.w, b.h, a.sw * 1.6);
      else { c.beginPath(); c.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); }
      c.stroke(); c.restore(); break;
    }
    case 'highlight': {
      const b = norm(a);
      c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = hexA(a.color, 0.55);
      rr(c, b.x, b.y, b.w, b.h, a.sw * 0.6); c.fill(); c.restore(); break;
    }
    case 'blur': {
      const W = S.base.width, H = S.base.height, b = norm(a);
      const x = clamp(b.x, 0, W), y = clamp(b.y, 0, H);
      const w = clamp(b.x + b.w, 0, W) - x, h = clamp(b.y + b.h, 0, H) - y;
      if (w < 1 || h < 1) break;
      const px = Math.max(6, Math.round(Math.max(W, H) / 110));
      const tw = Math.max(1, Math.ceil(w / px)), th = Math.max(1, Math.ceil(h / px));
      const t = drawAnn.tmp || (drawAnn.tmp = document.createElement('canvas'));
      t.width = tw; t.height = th;
      t.getContext('2d').drawImage(S.base, x, y, w, h, 0, 0, tw, th);
      c.save(); c.imageSmoothingEnabled = false; c.drawImage(t, 0, 0, tw, th, x, y, w, h); c.restore();
      break;
    }
    case 'counter': {
      c.save();
      c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = a.r * 0.4 * scale; c.shadowOffsetY = a.r * 0.08 * scale;
      c.beginPath(); c.arc(a.x, a.y, a.r, 0, Math.PI * 2); c.fillStyle = a.color; c.fill();
      c.shadowColor = 'transparent';
      c.lineWidth = a.r * 0.14; c.strokeStyle = 'rgba(255,255,255,.95)'; c.stroke();
      c.fillStyle = contrast(a.color); c.font = textFont(a.r * 1.1);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(a.n), a.x, a.y + a.r * 0.04);
      c.restore(); break;
    }
    case 'text': {
      const m = textMetrics(a);
      c.save(); c.font = textFont(a.fs); c.textBaseline = 'middle';
      if (a.style === 'pill') {
        c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = a.fs * 0.4 * scale; c.shadowOffsetY = a.fs * 0.06 * scale;
        c.fillStyle = a.color; rr(c, a.x, a.y, m.w, m.h, a.fs * 0.38); c.fill();
        c.shadowColor = 'transparent';
      }
      m.lines.forEach((ln, i) => {
        const tx = a.x + m.pad, ty = a.y + m.pad + i * m.lh + m.lh / 2;
        if (a.style === 'outline') {
          c.lineJoin = 'round'; c.lineWidth = a.fs * 0.22; c.strokeStyle = contrast(a.color); c.strokeText(ln, tx, ty);
        }
        if (a.style === 'plain') { c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = a.fs * 0.2 * scale; }
        c.fillStyle = a.style === 'pill' ? contrast(a.color) : a.color;
        c.fillText(ln, tx, ty);
      });
      c.restore(); break;
    }
  }
}

// ── Selection, crop & perspective overlays ───────────────────────────────────
function bbox(a) {
  switch (a.type) {
    case 'arrow': return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
    case 'counter': return { x: a.x - a.r, y: a.y - a.r, w: a.r * 2, h: a.r * 2 };
    case 'text': { const m = textMetrics(a); return { x: a.x, y: a.y, w: m.w, h: m.h }; }
    default: return norm(a);
  }
}
function handles(a) {
  if (a.type === 'arrow') return [['p1', a.x1, a.y1], ['p2', a.x2, a.y2]];
  if (!BOX_TYPES.has(a.type)) return [];
  const b = norm(a);
  return [['nw', b.x, b.y], ['ne', b.x + b.w, b.y], ['se', b.x + b.w, b.y + b.h], ['sw', b.x, b.y + b.h]];
}
function cropHandles(c) {
  const { x, y, w, h } = c;
  return [['nw', x, y], ['n', x + w / 2, y], ['ne', x + w, y], ['e', x + w, y + h / 2],
    ['se', x + w, y + h], ['s', x + w / 2, y + h], ['sw', x, y + h], ['w', x, y + h / 2]];
}
const tol = () => 9 / viewScale;
const nearest = (list, p, r = tol()) => list.find(([, x, y]) => Math.hypot(p.x - x, p.y - y) <= r);

function distSeg(p, a) {
  const dx = a.x2 - a.x1, dy = a.y2 - a.y1, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((p.x - a.x1) * dx + (p.y - a.y1) * dy) / l2, 0, 1);
  return Math.hypot(p.x - (a.x1 + t * dx), p.y - (a.y1 + t * dy));
}
function hit(a, p) {
  if (a.type === 'arrow') return distSeg(p, a) <= a.w * 1.6 + tol();
  if (a.type === 'counter') return Math.hypot(p.x - a.x, p.y - a.y) <= a.r + tol() / 2;
  const b = bbox(a), t = tol() / 2;
  return p.x >= b.x - t && p.x <= b.x + b.w + t && p.y >= b.y - t && p.y <= b.y + b.h + t;
}
function topHit(p) { for (let i = S.anns.length - 1; i >= 0; i--) if (hit(S.anns[i], p)) return S.anns[i]; return null; }

function drawHandle(c, x, y, r) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5 / viewScale; c.strokeStyle = '#0a84ff'; c.stroke();
}

function drawOverlay(c) {
  const vs = viewScale, W = S.base.width, H = S.base.height;
  c.save(); c.translate(L.ox, L.oy);
  const a = S.selected;
  if (a && a !== S.editingText && S.tool !== 'crop' && S.tool !== 'perspective') {
    if (a.type !== 'arrow') {
      const b = bbox(a), m = 4 / vs;
      c.setLineDash([4 / vs, 3 / vs]); c.lineWidth = 1 / vs; c.strokeStyle = '#0a84ff';
      c.strokeRect(b.x - m, b.y - m, b.w + m * 2, b.h + m * 2); c.setLineDash([]);
    }
    for (const [, x, y] of handles(a)) drawHandle(c, x, y, 4.5 / vs);
  }
  if (S.tool === 'crop' && S.crop) {
    const k = S.crop;
    c.fillStyle = 'rgba(0,0,0,.5)';
    c.beginPath(); c.rect(0, 0, W, H); c.rect(k.x, k.y, k.w, k.h); c.fill('evenodd');
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1 / vs; c.beginPath();
    for (let i = 1; i < 3; i++) {
      c.moveTo(k.x + (k.w * i) / 3, k.y); c.lineTo(k.x + (k.w * i) / 3, k.y + k.h);
      c.moveTo(k.x, k.y + (k.h * i) / 3); c.lineTo(k.x + k.w, k.y + (k.h * i) / 3);
    }
    c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 1.5 / vs; c.strokeRect(k.x, k.y, k.w, k.h);
    const bl = Math.min(18 / vs, k.w / 3, k.h / 3); c.lineWidth = 4 / vs; c.lineCap = 'round'; c.beginPath();
    for (const [sx, sy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const x = k.x + sx * k.w, y = k.y + sy * k.h, dx = sx ? -1 : 1, dy = sy ? -1 : 1;
      c.moveTo(x + dx * bl, y); c.lineTo(x, y); c.lineTo(x, y + dy * bl);
    }
    c.stroke();
    setHud(`${Math.round(k.w)} × ${Math.round(k.h)}`);
  }
  if (S.tool === 'perspective' && S.quad) {
    const q = S.quad;
    c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.rect(0, 0, W, H);
    c.moveTo(...q[0]); q.slice(1).forEach((pt) => c.lineTo(...pt)); c.closePath(); c.fill('evenodd');
    const lerp = (p, r, t) => [p[0] + (r[0] - p[0]) * t, p[1] + (r[1] - p[1]) * t];
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1 / vs; c.beginPath();
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      c.moveTo(...lerp(q[0], q[1], t)); c.lineTo(...lerp(q[3], q[2], t));
      c.moveTo(...lerp(q[0], q[3], t)); c.lineTo(...lerp(q[1], q[2], t));
    }
    c.stroke();
    c.strokeStyle = '#0a84ff'; c.lineWidth = 2 / vs; c.beginPath();
    c.moveTo(...q[0]); q.slice(1).forEach((pt) => c.lineTo(...pt)); c.closePath(); c.stroke();
    q.forEach(([x, y]) => drawHandle(c, x, y, 7 / vs));
  }
  c.restore();
}

// ── History ──────────────────────────────────────────────────────────────────
const snap = () => ({ base: S.base, anns: structuredClone(S.anns), bg: { ...S.bg } });
function commit() {
  undoStack.push(snap()); redoStack = [];
  if (undoStack.length > 80) undoStack.splice(1, 1);
  S.dirty = true; syncButtons();
}
function restore(s) {
  const baseChanged = s.base !== S.base;
  S.base = s.base; S.anns = structuredClone(s.anns); S.bg = { ...s.bg }; S.selected = null;
  if (baseChanged) updateDims();
  syncInspector(); relayout(); syncButtons();
}
function undo() { if (undoStack.length > 1) { redoStack.push(undoStack.pop()); restore(undoStack.at(-1)); } }
function redo() { const s = redoStack.pop(); if (s) { undoStack.push(s); restore(s); } }

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
  undoStack = [snap()]; redoStack = [];
  $('#filename').textContent = res.name;
  document.title = res.name;
  document.body.classList.remove('empty');
  updateDims();
  api.setFile(p);
  if (fit) api.fitWindow(c.width / devicePixelRatio, c.height / devicePixelRatio);
  setTimeout(relayout, fit ? 60 : 0);
  relayout(); syncButtons();
  S.siblings = await api.siblings(p).catch(() => [p]);
  syncNav();
}
function updateDims() { $('#dims').textContent = `${S.base.width} × ${S.base.height}`; }
function syncNav() {
  const i = S.siblings.indexOf(S.file), n = S.siblings.length;
  $('#counter').textContent = n ? `${i + 1} / ${n}` : '';
  $('#prev').disabled = i <= 0; $('#next').disabled = i < 0 || i >= n - 1;
}
function step(d) {
  const i = S.siblings.indexOf(S.file), j = i + d;
  if (i >= 0 && j >= 0 && j < S.siblings.length) loadFile(S.siblings[j]);
}

// ── Modes & tools ────────────────────────────────────────────────────────────
function setMode(m) {
  if (!S.base && m === 'edit') return;
  commitText();
  S.mode = m;
  document.body.classList.toggle('mode-edit', m === 'edit');
  document.body.classList.toggle('mode-view', m === 'view');
  if (m === 'view') { setTool('select'); S.selected = null; closePops(); }
  $('#edit-toggle').textContent = m === 'edit' ? 'Done' : 'Edit';
  S.zoom = null; relayout();
}

function setTool(t) {
  if (t === S.tool && t !== 'crop' && t !== 'perspective') return;
  commitText();
  S.tool = t; S.crop = null; S.quad = null;
  if (t === 'crop') S.crop = { x: 0, y: 0, w: S.base.width, h: S.base.height };
  if (t === 'perspective') {
    const W = S.base.width, H = S.base.height, i = Math.min(W, H) * 0.06;
    S.quad = [[i, i], [W - i, i], [W - i, H - i], [i, H - i]];
  }
  if (t === 'crop' || t === 'perspective') S.selected = null;
  $$('#tools .tb').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  document.body.classList.toggle('hud', t === 'crop' || t === 'perspective');
  if (t === 'perspective') setHud('Drag the corners onto the edges of the document');
  canvas.style.cursor = t === 'select' ? 'default' : t === 'text' ? 'text' : 'crosshair';
  requestRender();
}
function setHud(text) { const el = $('#hud-text'); if (el.textContent !== text) el.textContent = text; }

function select(a) { S.selected = a; if (a) syncStyleFrom(a); requestRender(); }

// ── Pointer interaction ──────────────────────────────────────────────────────
let drag = null, lastTextCommit = 0;
function toImg(e) {
  const r = canvas.getBoundingClientRect(), f = L.cw / r.width;
  return { x: (e.clientX - r.left) * f - L.ox, y: (e.clientY - r.top) * f - L.oy };
}

canvas.addEventListener('pointerdown', (e) => {
  if (!S.base || S.mode !== 'edit' || e.button !== 0) return;
  if (performance.now() - lastTextCommit < 150) return;
  canvas.setPointerCapture(e.pointerId);
  const p = toImg(e), t = S.tool, W = S.base.width, H = S.base.height;

  if (t === 'crop') {
    const h = nearest(cropHandles(S.crop), p);
    const k = S.crop, inside = p.x > k.x && p.x < k.x + k.w && p.y > k.y && p.y < k.y + k.h;
    drag = h ? { kind: 'crop-resize', h: h[0], orig: { ...k } } : inside ? { kind: 'crop-move', start: p, orig: { ...k } }
      : { kind: 'crop-new', start: { x: clamp(p.x, 0, W), y: clamp(p.y, 0, H) } };
    return;
  }
  if (t === 'perspective') {
    let best = -1, bd = Infinity;
    S.quad.forEach(([x, y], i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
    if (bd < 40 / viewScale) drag = { kind: 'quad', i: best };
    return;
  }
  if (S.selected) {
    const h = nearest(handles(S.selected), p);
    if (h) { drag = { kind: 'handle', h: h[0], a: S.selected, orig: structuredClone(S.selected) }; return; }
  }
  if (t === 'select') {
    const a = topHit(p); select(a);
    if (a) drag = { kind: 'move', a, start: p, orig: structuredClone(a), moved: false };
    return;
  }
  if (t === 'counter') {
    const n = Math.max(0, ...S.anns.filter((a) => a.type === 'counter').map((a) => a.n)) + 1;
    const a = { type: 'counter', x: p.x, y: p.y, n, color: S.color, r: sz('counter') };
    S.anns.push(a); select(a); commit(); return;
  }
  if (t === 'text') { startText(null, p); return; }
  if (t === 'arrow') S.draft = { type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: S.color, w: sz('stroke') };
  else S.draft = { type: t, x: p.x, y: p.y, w: 0, h: 0, color: t === 'highlight' ? '#FFD60A' : S.color, sw: sz('stroke') };
  drag = { kind: 'draft', start: p };
});

canvas.addEventListener('pointermove', (e) => {
  if (!S.base || S.mode !== 'edit') return;
  const p = toImg(e);
  if (!drag) return updateCursor(p);
  const W = S.base.width, H = S.base.height;
  switch (drag.kind) {
    case 'draft': {
      const d = S.draft;
      if (d.type === 'arrow') {
        let x = p.x, y = p.y;
        if (e.shiftKey) {
          const ang = Math.round(Math.atan2(y - d.y1, x - d.x1) / (Math.PI / 12)) * (Math.PI / 12);
          const len = Math.hypot(x - d.x1, y - d.y1);
          x = d.x1 + Math.cos(ang) * len; y = d.y1 + Math.sin(ang) * len;
        }
        d.x2 = x; d.y2 = y;
      } else {
        d.w = p.x - d.x; d.h = p.y - d.y;
        if (e.shiftKey) { const s = Math.max(Math.abs(d.w), Math.abs(d.h)); d.w = Math.sign(d.w || 1) * s; d.h = Math.sign(d.h || 1) * s; }
      }
      break;
    }
    case 'move': {
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y, a = drag.a, o = drag.orig;
      if (a.type === 'arrow') Object.assign(a, { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy });
      else Object.assign(a, { x: o.x + dx, y: o.y + dy });
      drag.moved = true; break;
    }
    case 'handle': {
      const a = drag.a, h = drag.h;
      if (a.type === 'arrow') { if (h === 'p1') { a.x1 = p.x; a.y1 = p.y; } else { a.x2 = p.x; a.y2 = p.y; } }
      else {
        const o = norm(drag.orig);
        let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
        if (h.includes('w')) x1 = p.x; if (h.includes('e')) x2 = p.x;
        if (h.includes('n')) y1 = p.y; if (h.includes('s')) y2 = p.y;
        Object.assign(a, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });
      }
      drag.moved = true; break;
    }
    case 'crop-new': case 'crop-resize': case 'crop-move': {
      const min = 8;
      if (drag.kind === 'crop-move') {
        const o = drag.orig;
        S.crop = { ...o, x: clamp(o.x + p.x - drag.start.x, 0, W - o.w), y: clamp(o.y + p.y - drag.start.y, 0, H - o.h) };
      } else if (drag.kind === 'crop-new') {
        const s = drag.start, x = clamp(p.x, 0, W), y = clamp(p.y, 0, H);
        S.crop = { x: Math.min(s.x, x), y: Math.min(s.y, y), w: Math.max(min, Math.abs(x - s.x)), h: Math.max(min, Math.abs(y - s.y)) };
      } else {
        const o = drag.orig, h = drag.h;
        let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
        if (h.includes('w')) x1 = clamp(p.x, 0, x2 - min);
        if (h.includes('e')) x2 = clamp(p.x, x1 + min, W);
        if (h.includes('n')) y1 = clamp(p.y, 0, y2 - min);
        if (h.includes('s')) y2 = clamp(p.y, y1 + min, H);
        S.crop = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      }
      break;
    }
    case 'quad': S.quad[drag.i] = [clamp(p.x, 0, W), clamp(p.y, 0, H)]; break;
  }
  requestRender();
});

canvas.addEventListener('pointerup', () => {
  if (!drag) return;
  const k = drag.kind; drag = null;
  if (k === 'draft') {
    const d = S.draft; S.draft = null;
    const big = d.type === 'arrow' ? Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 4 / viewScale
      : Math.abs(d.w) > 3 / viewScale && Math.abs(d.h) > 3 / viewScale;
    if (big) {
      if (d.type !== 'arrow') Object.assign(d, norm(d));
      S.anns.push(d); select(d); commit();
    }
  } else if ((k === 'move' || k === 'handle')) {
    if (undoStack.length && JSON.stringify(S.anns) !== JSON.stringify(undoStack.at(-1).anns)) commit();
  }
  requestRender();
});

canvas.addEventListener('dblclick', (e) => {
  if (S.mode === 'view') { setMode('edit'); return; }
  const a = topHit(toImg(e));
  if (a?.type === 'text') startText(a);
});

function updateCursor(p) {
  let cur = S.tool === 'select' ? 'default' : S.tool === 'text' ? 'text' : 'crosshair';
  const resize = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', p1: 'move', p2: 'move' };
  if (S.tool === 'crop' && S.crop) {
    const h = nearest(cropHandles(S.crop), p), k = S.crop;
    cur = h ? resize[h[0]] : (p.x > k.x && p.x < k.x + k.w && p.y > k.y && p.y < k.y + k.h) ? 'move' : 'crosshair';
  } else if (S.tool === 'perspective') {
    cur = S.quad.some(([x, y]) => Math.hypot(p.x - x, p.y - y) < 40 / viewScale) ? 'grab' : 'default';
  } else {
    const h = S.selected && nearest(handles(S.selected), p);
    if (h) cur = resize[h[0]];
    else if (S.tool === 'select' && topHit(p)) cur = 'move';
  }
  canvas.style.cursor = cur;
}

// ── Text ─────────────────────────────────────────────────────────────────────
const ta = $('#text-input');
function startText(a, p) {
  if (!a) {
    a = { type: 'text', x: p.x, y: p.y - sz('font') * 0.8, text: '', color: S.color, fs: sz('font'), style: S.textStyle };
    S.anns.push(a);
  }
  S.editingText = a; S.selected = a;
  ta.value = a.text; ta.style.display = 'block';
  positionTextInput(a);
  requestAnimationFrame(() => { ta.focus(); ta.select(); });
  requestRender();
}
function positionTextInput(a) {
  const r = canvas.getBoundingClientRect(), f = r.width / L.cw;
  const m = textMetrics({ ...a, text: ta.value });
  const pill = a.style === 'pill';
  Object.assign(ta.style, {
    left: `${r.left + (a.x + L.ox) * f}px`, top: `${r.top + (a.y + L.oy) * f}px`,
    width: `${m.w * f + 4}px`, height: `${m.h * f}px`,
    fontSize: `${a.fs * f}px`, padding: `${m.pad * f}px`,
    borderRadius: `${a.fs * 0.38 * f}px`,
    color: pill ? contrast(a.color) : a.color,
    background: pill ? a.color : 'transparent',
    webkitTextStroke: a.style === 'outline' ? `${a.fs * 0.06 * f}px ${contrast(a.color)}` : '0',
  });
}
ta.addEventListener('input', () => S.editingText && positionTextInput(S.editingText));
ta.addEventListener('blur', () => commitText());
ta.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || !e.shiftKey))) { e.preventDefault(); ta.blur(); }
});
function commitText() {
  const a = S.editingText;
  if (!a) return;
  S.editingText = null;
  a.text = ta.value.replace(/\s+$/, '');
  ta.style.display = 'none';
  if (!a.text) { S.anns = S.anns.filter((x) => x !== a); S.selected = null; }
  if (JSON.stringify(S.anns) !== JSON.stringify(undoStack.at(-1)?.anns)) commit();
  lastTextCommit = performance.now();
  requestRender();
}

// ── Destructive ops: crop, perspective, rotate, flip ─────────────────────────
function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function flattened() {
  const c = newCanvas(S.base.width, S.base.height), x = c.getContext('2d');
  x.drawImage(S.base, 0, 0);
  for (const a of S.anns) drawAnn(x, a, 1);
  return c;
}
function applyCrop() {
  const k = S.crop, x = Math.round(k.x), y = Math.round(k.y), w = Math.round(k.w), h = Math.round(k.h);
  const c = newCanvas(w, h); c.getContext('2d').drawImage(S.base, x, y, w, h, 0, 0, w, h);
  for (const a of S.anns) {
    if (a.type === 'arrow') { a.x1 -= x; a.x2 -= x; a.y1 -= y; a.y2 -= y; } else { a.x -= x; a.y -= y; }
  }
  S.base = c; finishDestructive();
}
function applyPerspective() {
  const out = warp(flattened(), S.quad);
  if (!out) { toast('Those corners don’t form a valid shape'); return; }
  S.base = out; S.anns = []; finishDestructive();
}
function finishDestructive() {
  updateDims(); commit(); setTool('select'); S.zoom = null; relayout();
}
function rotate(dir) {
  const src = flattened(), c = newCanvas(src.height, src.width), x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2); x.rotate((dir * Math.PI) / 2); x.drawImage(src, -src.width / 2, -src.height / 2);
  S.base = c; S.anns = []; S.selected = null; finishDestructive();
}
function flip(horizontal) {
  const src = flattened(), c = newCanvas(src.width, src.height), x = c.getContext('2d');
  if (horizontal) { x.translate(c.width, 0); x.scale(-1, 1); } else { x.translate(0, c.height); x.scale(1, -1); }
  x.drawImage(src, 0, 0);
  S.base = c; S.anns = []; S.selected = null; finishDestructive();
}

// Perspective correction: solve the homography that maps the output rectangle
// onto the user's quad, then inverse-map every output pixel (bilinear sampling).
function solveHomography(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c]; if (Math.abs(d) < 1e-10) return null;
    for (let k = c; k <= n; k++) A[c][k] /= d;
    for (let r = 0; r < n; r++) if (r !== c && A[r][c]) { const f = A[r][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  return [...A.map((r) => r[n]), 1];
}
function warp(src, quad) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const w = Math.round(Math.max(d(quad[0], quad[1]), d(quad[3], quad[2])));
  const h = Math.round(Math.max(d(quad[0], quad[3]), d(quad[1], quad[2])));
  if (w < 4 || h < 4) return null;
  const Hm = solveHomography([[0, 0], [w, 0], [w, h], [0, h]], quad);
  if (!Hm) return null;
  const sw = src.width, sh = src.height;
  const s = src.getContext('2d').getImageData(0, 0, sw, sh).data;
  const out = new ImageData(w, h), o = out.data;
  for (let y = 0; y < h; y++) {
    const Y = y + 0.5;
    for (let x = 0; x < w; x++) {
      const X = x + 0.5, z = Hm[6] * X + Hm[7] * Y + Hm[8];
      const sx = clamp((Hm[0] * X + Hm[1] * Y + Hm[2]) / z - 0.5, 0, sw - 1);
      const sy = clamp((Hm[3] * X + Hm[4] * Y + Hm[5]) / z - 0.5, 0, sh - 1);
      const x0 = sx | 0, y0 = sy | 0, x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      const oi = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * fx;
        const bot = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * fx;
        o[oi + c] = top + (bot - top) * fy;
      }
    }
  }
  const c = newCanvas(w, h); c.getContext('2d').putImageData(out, 0, 0);
  return c;
}

// ── Export ───────────────────────────────────────────────────────────────────
function exportCanvas() {
  commitText();
  const lay = layout(), c = newCanvas(lay.cw, lay.ch);
  compose(c.getContext('2d'), lay, 1);
  return c;
}
async function exportBuffer() {
  const blob = await new Promise((r) => exportCanvas().toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
const stem = () => S.name.replace(/\.[^.]+$/, '');
async function copyOut() {
  if (!S.base) return;
  await api.copyImage(await exportBuffer());
  toast('Copied to clipboard');
}
async function saveOut() {
  if (!S.base) return;
  const dir = S.file.slice(0, S.file.lastIndexOf('/') + 1);
  const out = await api.saveAs(await exportBuffer(), `${dir}${stem()} edited.png`);
  if (out) { S.dirty = false; toast('Saved'); }
}

// ── Inspector wiring ─────────────────────────────────────────────────────────
function buildUI() {
  const tools = $('#tools');
  for (const t of TOOLS) {
    if (!t) { tools.insertAdjacentHTML('beforeend', '<span class="gap"></span>'); continue; }
    const [id, label, key] = t;
    const b = document.createElement('button');
    b.className = 'tb'; b.dataset.tool = id; b.title = `${label}  ${key.toUpperCase()}`; b.innerHTML = svg(ICONS[id]);
    b.onclick = () => setTool(id);
    tools.append(b);
  }
  const ic = { undo: 'undo', redo: 'redo', copy: 'copy', save: 'save', dragout: 'drag', prev: 'prev', next: 'next', 'zoom-fit': 'fit', 'pill-edit': 'edit', 'bg-btn': 'background', 'more-btn': 'transform', 'rot-l': 'rotl', 'rot-r': 'rotr', 'flip-h': 'fliph', 'flip-v': 'flipv' };
  for (const [id, name] of Object.entries(ic)) $(`#${id}`).innerHTML = svg(ICONS[name]);

  const sw = $('#bg-swatches');
  for (const p of BACKDROPS) {
    const b = document.createElement('button');
    b.className = `swatch ${p.id === 'clear' ? 'clear' : ''}`; b.dataset.id = p.id; b.title = p.id[0].toUpperCase() + p.id.slice(1);
    if (p.stops) b.style.background = `radial-gradient(circle at 12% 8%, ${hexA(p.blobs[0], 0.85)}, transparent 62%), radial-gradient(circle at 88% 92%, ${hexA(p.blobs[1], 0.85)}, transparent 62%), linear-gradient(135deg, ${p.stops.join(', ')})`;
    else if (p.solid) b.style.background = p.solid;
    b.onclick = () => { S.bg.preset = p.id; S.bg.enabled = true; syncInspector(); relayout(); commit(); };
    sw.append(b);
  }
  const colors = $('#colors');
  for (const col of COLORS) {
    const b = document.createElement('button');
    b.className = 'color'; b.style.background = col; b.dataset.c = col;
    b.onclick = () => setStyle({ color: col });
    colors.append(b);
  }
  $('#bg-on').onchange = (e) => { S.bg.enabled = e.target.checked; syncInspector(); S.zoom = null; relayout(); commit(); };
  for (const k of ['padding', 'radius', 'shadow']) {
    const el = $(`#bg-${k}`);
    el.oninput = () => { S.bg[k] = +el.value; if (!S.bg.enabled) { S.bg.enabled = true; syncInspector(); } relayout(); };
    el.onchange = () => commit();
  }
  segWire('#bg-ratio', (v) => { S.bg.ratio = v; S.bg.enabled = true; syncInspector(); relayout(); commit(); });
  segWire('#size', (v) => setStyle({ size: +v }));
  segWire('#text-style', (v) => setStyle({ textStyle: v }));

  $('#style-btn').onclick = (e) => togglePop('#pop-style', e.currentTarget);
  $('#bg-btn').onclick = (e) => togglePop('#pop-bg', e.currentTarget);
  $('#more-btn').onclick = (e) => togglePop('#pop-more', e.currentTarget);
  $('#rot-l').onclick = () => rotate(-1);
  $('#rot-r').onclick = () => rotate(1);
  $('#flip-h').onclick = () => flip(true);
  $('#flip-v').onclick = () => flip(false);
  $('#undo').onclick = undo;
  $('#redo').onclick = redo;
  $('#copy').onclick = copyOut;
  $('#save').onclick = saveOut;
  $('#edit-toggle').onclick = () => setMode(S.mode === 'edit' ? 'view' : 'edit');
  $('#pill-edit').onclick = () => setMode('edit');
  $('#prev').onclick = () => step(-1);
  $('#next').onclick = () => step(1);
  $('#zoom-fit').onclick = () => { S.zoom = S.zoom ? null : 1 / devicePixelRatio; relayout(); };
  $('#hud-apply').onclick = applyTool;
  $('#hud-cancel').onclick = () => setTool('select');
  $('#dragout').addEventListener('dragstart', (e) => {
    e.preventDefault();
    if (S.base) api.dragData(exportCanvas().toDataURL('image/png'), `${stem() || 'OneShot'}.png`);
  });
}
// Popovers open upward from their dock button.
function togglePop(id, btn) {
  const pop = $(id), wasOpen = pop.classList.contains('open');
  closePops();
  if (wasOpen) return;
  pop.classList.add('open'); btn.classList.add('active');
  const br = btn.getBoundingClientRect(), dr = $('#dock').getBoundingClientRect(), w = pop.offsetWidth;
  pop.style.left = `${clamp(br.left + br.width / 2 - w / 2, 10, innerWidth - w - 10)}px`;
  pop.style.bottom = `${innerHeight - dr.top + 8}px`;
}
function closePops() {
  $$('.pop.open').forEach((p) => p.classList.remove('open'));
  $$('#dock .tb.active').forEach((b) => b.classList.remove('active'));
}
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.pop, #dock')) closePops(); });

function segWire(sel, fn) {
  $(sel).addEventListener('click', (e) => { const v = e.target.closest('button')?.dataset.v; if (v != null) fn(v); });
}
function setSeg(sel, v) { $$(`${sel} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === String(v))); }

function setStyle(patch) {
  Object.assign(S, patch);
  const a = S.selected;
  if (a) {
    if (patch.color && a.type !== 'blur') a.color = patch.color;
    if (patch.size != null) {
      if (a.type === 'arrow') a.w = sz('stroke'); else if (BOX_TYPES.has(a.type)) a.sw = sz('stroke');
      else if (a.type === 'text') a.fs = sz('font'); else if (a.type === 'counter') a.r = sz('counter');
    }
    if (patch.textStyle && a.type === 'text') a.style = patch.textStyle;
    if (S.editingText === a) positionTextInput(a);
    else commit();
  }
  syncInspector(); requestRender();
}
function syncStyleFrom(a) {
  if (a.color && a.type !== 'highlight') S.color = a.color;
  if (a.type === 'text') S.textStyle = a.style;
  syncInspector();
}
function syncInspector() {
  const bg = S.bg;
  $('#bg-on').checked = bg.enabled;
  $('#pop-bg').classList.toggle('on', bg.enabled);
  $('#bg-btn').classList.toggle('on', bg.enabled);
  $('#style-btn .dot').style.background = S.color;
  $$('.swatch').forEach((b) => b.classList.toggle('on', bg.enabled && b.dataset.id === bg.preset));
  $('#bg-padding').value = bg.padding; $('#bg-radius').value = bg.radius; $('#bg-shadow').value = bg.shadow;
  setSeg('#bg-ratio', bg.ratio); setSeg('#size', S.size); setSeg('#text-style', S.textStyle);
  $$('.color').forEach((b) => b.classList.toggle('on', b.dataset.c === S.color));
}
function syncButtons() {
  $('#undo').disabled = undoStack.length <= 1;
  $('#redo').disabled = !redoStack.length;
}
function applyTool() { if (S.tool === 'crop') applyCrop(); else if (S.tool === 'perspective') applyPerspective(); }

// ── Keyboard, menu, zoom, drop ───────────────────────────────────────────────
api.onMenu((cmd) => {
  const typing = document.activeElement === ta;
  if (cmd === 'undo') typing ? document.execCommand('undo') : undo();
  if (cmd === 'redo') typing ? document.execCommand('redo') : redo();
  if (cmd === 'copy') typing ? document.execCommand('copy') : copyOut();
  if (cmd === 'save') saveOut();
});

window.addEventListener('keydown', (e) => {
  if (e.target === ta) return;
  const k = e.key.toLowerCase();
  if (e.metaKey) {
    if (k === '0') { S.zoom = null; relayout(); e.preventDefault(); }
    if (k === '1') { S.zoom = 1 / devicePixelRatio; relayout(); e.preventDefault(); }
    if (k === '=' || k === '+') { S.zoom = Math.min(8, viewScale * 1.25); relayout(); e.preventDefault(); }
    if (k === '-') { S.zoom = Math.max(0.05, viewScale / 1.25); relayout(); e.preventDefault(); }
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
    if ($('.pop.open')) closePops();
    else if (S.tool === 'crop' || S.tool === 'perspective') setTool('select');
    else if (S.selected) select(null);
    else setMode('view');
    return;
  }
  if (k === 'enter') { applyTool(); return; }
  if ((k === 'backspace' || k === 'delete') && S.selected) {
    S.anns = S.anns.filter((a) => a !== S.selected); S.selected = null; commit(); requestRender(); return;
  }
  if (k.startsWith('arrow') && S.selected) {
    const d = e.shiftKey ? 10 : 1, a = S.selected;
    const dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0;
    if (a.type === 'arrow') { a.x1 += dx; a.x2 += dx; a.y1 += dy; a.y2 += dy; } else { a.x += dx; a.y += dy; }
    commit(); requestRender(); e.preventDefault(); return;
  }
  const tool = TOOLS.find((t) => t && t[2] === k);
  if (tool) setTool(tool[0]);
});

wrap.addEventListener('wheel', (e) => {
  if (!S.base || !e.ctrlKey) return; // pinch-to-zoom arrives as ctrl+wheel
  e.preventDefault();
  const r = canvas.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
  S.zoom = clamp(viewScale * Math.exp(-e.deltaY * 0.01), 0.05, 8);
  relayout();
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
  idle = setTimeout(() => { if (!document.querySelector('#pill:hover, #titlebar:hover')) document.body.classList.remove('chrome'); else wake(); }, 1800);
}
window.addEventListener('mousemove', wake);

new ResizeObserver(() => relayout()).observe(wrap);

// ── Boot ─────────────────────────────────────────────────────────────────────
buildUI();
syncInspector();
syncButtons();
const params = new URLSearchParams(location.search);
const initial = params.get('file');
if (initial) loadFile(initial, { fit: true }).then(() => { if (params.get('mode') === 'edit') setMode('edit'); });
wake();
