// In-place text editing: a <textarea> positioned over the canvas while typing.
import { contrast } from '../util.js';
import { S, view, canvas, textInput as ta, sz, annsChanged } from './state.js';
import { textMetrics } from './draw.js';
import { requestRender } from './view.js';
import { commit } from './app.js';

let lastCommit = 0;
// A click right after committing text (blur) shouldn't also start a new shape.
export const justCommittedText = () => performance.now() - lastCommit < 150;
export const isTyping = () => document.activeElement === ta;

export function startText(a, p) {
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

export function positionTextInput(a) {
  const r = canvas.getBoundingClientRect(), f = r.width / view.L.cw;
  const m = textMetrics({ ...a, text: ta.value });
  const pill = a.style === 'pill';
  Object.assign(ta.style, {
    left: `${r.left + (a.x + view.L.ox) * f}px`, top: `${r.top + (a.y + view.L.oy) * f}px`,
    width: `${m.w * f + 4}px`, height: `${m.h * f}px`,
    fontSize: `${a.fs * f}px`, padding: `${m.pad * f}px`,
    borderRadius: `${a.fs * 0.38 * f}px`,
    color: pill ? contrast(a.color) : a.color,
    background: pill ? a.color : 'transparent',
    webkitTextStroke: a.style === 'outline' ? `${a.fs * 0.06 * f}px ${contrast(a.color)}` : '0',
  });
}

export function commitText() {
  const a = S.editingText;
  if (!a) return;
  S.editingText = null;
  a.text = ta.value.replace(/\s+$/, '');
  ta.style.display = 'none';
  if (!a.text) { S.anns = S.anns.filter((x) => x !== a); S.selected = null; }
  if (annsChanged()) commit();
  lastCommit = performance.now();
  requestRender();
}

ta.addEventListener('input', () => S.editingText && positionTextInput(S.editingText));
ta.addEventListener('blur', () => commitText());
ta.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || !e.shiftKey))) { e.preventDefault(); ta.blur(); }
});
