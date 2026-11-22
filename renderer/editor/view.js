// Fitting the composite into the window, the canvas backing store, and redraws.
import { clamp } from '../util.js';
import { layout } from './model.js';
import { S, view, canvas, ctx, wrap } from './state.js';
import { compose, drawOverlay } from './draw.js';
import { positionTextInput } from './text.js';

export const docLayout = () => layout(S.base.width, S.base.height, S.bg);

function fitScale() {
  const edit = S.mode === 'edit', m = edit ? 24 : 28, bottom = edit ? 64 : 0;
  return Math.min((wrap.clientWidth - m * 2) / view.L.cw, (wrap.clientHeight - bottom - m * 2) / view.L.ch, 1);
}

export function relayout() {
  if (!S.base) return;
  const L = view.L = docLayout();
  view.scale = S.zoom ?? fitScale();
  const dpr = devicePixelRatio;
  S.k = Math.min(view.scale * dpr, 2, 12000 / L.cw, 12000 / L.ch);
  canvas.width = Math.max(1, Math.round(L.cw * S.k));
  canvas.height = Math.max(1, Math.round(L.ch * S.k));
  canvas.style.width = `${L.cw * view.scale}px`;
  canvas.style.height = `${L.ch * view.scale}px`;
  canvas.style.imageRendering = view.scale * dpr > S.k + 0.01 ? 'pixelated' : 'auto';
  document.body.classList.toggle('bg-on', S.bg.enabled);
  render();
  if (S.editingText) positionTextInput(S.editingText);
}

export function render() {
  if (!S.base) return;
  ctx.setTransform(S.k, 0, 0, S.k, 0, 0);
  ctx.clearRect(0, 0, view.L.cw, view.L.ch);
  compose(ctx, view.L, S.k);
  if (S.mode === 'edit') drawOverlay(ctx);
}

let raf = 0;
export function requestRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }

// Client coordinates → base-image coordinates.
export function toImg(e) {
  const r = canvas.getBoundingClientRect(), f = view.L.cw / r.width;
  return { x: (e.clientX - r.left) * f - view.L.ox, y: (e.clientY - r.top) * f - view.L.oy };
}

// null = fit to window.
export function setZoom(z) { S.zoom = z == null ? null : clamp(z, 0.05, 8); relayout(); }
export const actualSize = () => 1 / devicePixelRatio;
