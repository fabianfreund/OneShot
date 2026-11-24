// Dock, popovers and inspector: building the controls and keeping them in sync with state.
import { $, $$ } from '../lib.js';
import { clamp, hexA } from '../util.js';
import { BACKDROPS, BOX_TYPES, COLORS, SEGMENT_TYPES, TOOLS } from './model.js';
import { ICONS, svg } from './icons.js';
import { S, history, sz } from './state.js';
import { relayout, requestRender, setZoom, actualSize } from './view.js';
import { positionTextInput } from './text.js';
import { applyTool, copyOut, dragOut, flip, rotate, saveOut } from './ops.js';
import { commit, redo, setMode, setTool, step, undo } from './app.js';

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1400);
}

export function setHud(text) { const el = $('#hud-text'); if (el.textContent !== text) el.textContent = text; }

// Button id → icon name for the static chrome.
const CHROME_ICONS = {
  undo: 'undo', redo: 'redo', copy: 'copy', save: 'save', dragout: 'drag', prev: 'prev', next: 'next',
  'zoom-fit': 'fit', 'pill-edit': 'edit', 'bg-btn': 'background', 'more-btn': 'transform',
  'rot-l': 'rotl', 'rot-r': 'rotr', 'flip-h': 'fliph', 'flip-v': 'flipv',
};

function swatchBackground(p) {
  if (p.stops) {
    return `radial-gradient(circle at 12% 8%, ${hexA(p.blobs[0], 0.85)}, transparent 62%), `
      + `radial-gradient(circle at 88% 92%, ${hexA(p.blobs[1], 0.85)}, transparent 62%), linear-gradient(135deg, ${p.stops.join(', ')})`;
  }
  return p.solid || '';
}

function button(className, props) {
  const b = document.createElement('button');
  b.className = className;
  Object.assign(b, props);
  return b;
}

// Background edits always switch the background on.
function setBg(patch, { record = true } = {}) {
  const wasOn = S.bg.enabled;
  Object.assign(S.bg, { enabled: true }, patch);
  if (S.bg.enabled !== wasOn) S.zoom = null;
  syncInspector(); relayout();
  if (record) commit();
}

export function buildUI() {
  const tools = $('#tools');
  for (const t of TOOLS) {
    if (!t) { tools.insertAdjacentHTML('beforeend', '<span class="gap"></span>'); continue; }
    const [id, label, key] = t;
    const b = button('tb', { title: `${label}  ${key.toUpperCase()}`, innerHTML: svg(ICONS[id]), onclick: () => setTool(id) });
    b.dataset.tool = id;
    tools.append(b);
  }
  for (const [id, name] of Object.entries(CHROME_ICONS)) $(`#${id}`).innerHTML = svg(ICONS[name]);

  for (const p of BACKDROPS) {
    const b = button(`swatch ${p.id === 'clear' ? 'clear' : ''}`, { title: p.id[0].toUpperCase() + p.id.slice(1), onclick: () => setBg({ preset: p.id }) });
    b.dataset.id = p.id; b.style.background = swatchBackground(p);
    $('#bg-swatches').append(b);
  }
  for (const col of COLORS) {
    const b = button('color', { onclick: () => setStyle({ color: col }) });
    b.style.background = col; b.dataset.c = col;
    $('#colors').append(b);
  }

  $('#bg-on').onchange = (e) => setBg({ enabled: e.target.checked });
  for (const k of ['padding', 'radius', 'shadow']) {
    const el = $(`#bg-${k}`);
    el.oninput = () => setBg({ [k]: +el.value }, { record: false });
    el.onchange = () => commit();
  }
  segWire('#bg-ratio', (v) => setBg({ ratio: v }));
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
  $('#zoom-fit').onclick = () => setZoom(S.zoom ? null : actualSize());
  $('#hud-apply').onclick = applyTool;
  $('#hud-cancel').onclick = () => setTool('select');
  $('#dragout').addEventListener('dragstart', (e) => { e.preventDefault(); dragOut(); });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.pop, #dock')) closePops(); });
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
export function closePops() {
  $$('.pop.open').forEach((p) => p.classList.remove('open'));
  $$('#dock .tb.active').forEach((b) => b.classList.remove('active'));
}
export const popOpen = () => !!$('.pop.open');

function segWire(sel, fn) {
  $(sel).addEventListener('click', (e) => { const v = e.target.closest('button')?.dataset.v; if (v != null) fn(v); });
}
function setSeg(sel, v) { $$(`${sel} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === String(v))); }

// Style changes apply to the current tool and the selected annotation.
function setStyle(patch) {
  Object.assign(S, patch);
  const a = S.selected;
  if (a) {
    if (patch.color && a.type !== 'blur') a.color = patch.color;
    if (patch.size != null) {
      if (SEGMENT_TYPES.has(a.type)) a.w = sz('stroke');
      else if (BOX_TYPES.has(a.type)) a.sw = sz('stroke');
      else if (a.type === 'text') a.fs = sz('font');
      else if (a.type === 'counter') a.r = sz('counter');
    }
    if (patch.textStyle && a.type === 'text') a.style = patch.textStyle;
    if (S.editingText === a) positionTextInput(a);
    else commit();
  }
  syncInspector(); requestRender();
}

export function syncStyleFrom(a) {
  if (a.color && a.type !== 'highlight') S.color = a.color;
  if (a.type === 'text') S.textStyle = a.style;
  syncInspector();
}

export function syncInspector() {
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

export function syncButtons() {
  $('#undo').disabled = !history.canUndo;
  $('#redo').disabled = !history.canRedo;
}

export function setToolButtons(t) {
  $$('#tools .tb').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
}
