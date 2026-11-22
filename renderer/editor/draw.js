// Painting the document (backdrop, image, annotations), the edit overlay
// (selection, crop, perspective), and hit testing.
import { clamp, contrast, hexA } from '../util.js';
import { BACKDROPS, BOX_TYPES, norm } from './model.js';
import { S, view, isWarpTool } from './state.js';
import { setHud } from './ui.js';

const mctx = document.createElement('canvas').getContext('2d'); // text measuring
const pixelTmp = document.createElement('canvas'); // pixelate scratch

export const textFont = (fs) => `600 ${fs}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif`;
export function textMetrics(a) {
  mctx.font = textFont(a.fs);
  const lines = (a.text || ' ').split('\n');
  const pad = a.fs * 0.4, lh = a.fs * 1.25;
  const tw = Math.max(a.fs * 0.5, ...lines.map((l) => mctx.measureText(l || ' ').width));
  return { lines, pad, lh, w: tw + pad * 2, h: lines.length * lh + pad * 2 };
}

function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  c.beginPath(); c.roundRect(x, y, w, h, r);
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

// Backdrop → shadow → rounded image → annotations.
// scale = device pixels per composite pixel (shadows aren't affected by transforms).
export function compose(c, lay, scale) {
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

function drawText(c, a, scale) {
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
  c.restore();
}

export function drawAnn(c, a, scale) {
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
      pixelTmp.width = tw; pixelTmp.height = th;
      pixelTmp.getContext('2d').drawImage(S.base, x, y, w, h, 0, 0, tw, th);
      c.save(); c.imageSmoothingEnabled = false; c.drawImage(pixelTmp, 0, 0, tw, th, x, y, w, h); c.restore();
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
    case 'text': drawText(c, a, scale); break;
  }
}

// ── Geometry & hit testing ───────────────────────────────────────────────────
export function bbox(a) {
  switch (a.type) {
    case 'arrow': return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
    case 'counter': return { x: a.x - a.r, y: a.y - a.r, w: a.r * 2, h: a.r * 2 };
    case 'text': { const m = textMetrics(a); return { x: a.x, y: a.y, w: m.w, h: m.h }; }
    default: return norm(a);
  }
}
export function handles(a) {
  if (a.type === 'arrow') return [['p1', a.x1, a.y1], ['p2', a.x2, a.y2]];
  if (!BOX_TYPES.has(a.type)) return [];
  const b = norm(a);
  return [['nw', b.x, b.y], ['ne', b.x + b.w, b.y], ['se', b.x + b.w, b.y + b.h], ['sw', b.x, b.y + b.h]];
}
export function cropHandles({ x, y, w, h }) {
  return [['nw', x, y], ['n', x + w / 2, y], ['ne', x + w, y], ['e', x + w, y + h / 2],
    ['se', x + w, y + h], ['s', x + w / 2, y + h], ['sw', x, y + h], ['w', x, y + h / 2]];
}
export const tol = () => 9 / view.scale;
export const nearest = (list, p, r = tol()) => list.find(([, x, y]) => Math.hypot(p.x - x, p.y - y) <= r);
export const insideRect = (p, k) => p.x > k.x && p.x < k.x + k.w && p.y > k.y && p.y < k.y + k.h;

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
export function topHit(p) {
  for (let i = S.anns.length - 1; i >= 0; i--) if (hit(S.anns[i], p)) return S.anns[i];
  return null;
}

// ── Edit overlay ─────────────────────────────────────────────────────────────
function drawHandle(c, x, y, r) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5 / view.scale; c.strokeStyle = '#0a84ff'; c.stroke();
}

function drawSelection(c, a, vs) {
  if (a.type !== 'arrow') {
    const b = bbox(a), m = 4 / vs;
    c.setLineDash([4 / vs, 3 / vs]); c.lineWidth = 1 / vs; c.strokeStyle = '#0a84ff';
    c.strokeRect(b.x - m, b.y - m, b.w + m * 2, b.h + m * 2); c.setLineDash([]);
  }
  for (const [, x, y] of handles(a)) drawHandle(c, x, y, 4.5 / vs);
}

function drawCrop(c, k, vs, W, H) {
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

function drawQuad(c, q, vs, W, H) {
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

export function drawOverlay(c) {
  const vs = view.scale, W = S.base.width, H = S.base.height;
  c.save(); c.translate(view.L.ox, view.L.oy);
  if (S.selected && S.selected !== S.editingText && !isWarpTool()) drawSelection(c, S.selected, vs);
  if (S.tool === 'crop' && S.crop) drawCrop(c, S.crop, vs, W, H);
  if (S.tool === 'perspective' && S.quad) drawQuad(c, S.quad, vs, W, H);
  c.restore();
}
