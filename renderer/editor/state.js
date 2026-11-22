// Shared mutable editor state and DOM handles.
import { $ } from '../lib.js';
import { COLORS, DEFAULT_BG, History, sizeFor } from './model.js';

export const S = {
  file: null, name: '', siblings: [], base: null, anns: [], draft: null,
  bg: { ...DEFAULT_BG },
  tool: 'select', color: COLORS[0], size: 1, textStyle: 'pill',
  selected: null, mode: 'view', zoom: null, crop: null, quad: null, editingText: null, dirty: false,
  k: 1, // canvas backing pixels per composite pixel
};

// Current composite layout and on-screen scale (CSS px per composite px).
export const view = { L: { cw: 1, ch: 1, ox: 0, oy: 0 }, scale: 1 };

export const history = new History(80);
export const snapshot = () => ({ base: S.base, anns: structuredClone(S.anns), bg: { ...S.bg } });
export const annsChanged = () => JSON.stringify(S.anns) !== JSON.stringify(history.top?.anns);

export const canvas = $('#stage');
export const ctx = canvas.getContext('2d');
export const wrap = $('#stage-wrap');
export const textInput = $('#text-input');

export const sz = (kind, size = S.size) => sizeFor(kind, size, S.base.width, S.base.height);
export const isWarpTool = (t = S.tool) => t === 'crop' || t === 'perspective';
