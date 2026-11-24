import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BG, History, layout, moveAnn, nextCounter, norm, sizeFor } from '../renderer/editor/model.js';
import { contrast, hexA } from '../renderer/util.js';

test('layout without background is the bare image', () => {
  assert.deepEqual(layout(400, 300, { ...DEFAULT_BG, enabled: false }), { cw: 400, ch: 300, ox: 0, oy: 0 });
});

test('layout pads by a percentage of the long side and centres the image', () => {
  const l = layout(400, 300, { ...DEFAULT_BG, enabled: true, padding: 10, ratio: 'auto' });
  assert.deepEqual(l, { cw: 480, ch: 380, ox: 40, oy: 40 });
});

test('layout honours fixed aspect ratios', () => {
  const sq = layout(400, 200, { ...DEFAULT_BG, enabled: true, padding: 0, ratio: '1:1' });
  assert.equal(sq.cw, sq.ch);
  assert.deepEqual([sq.ox, sq.oy], [0, 100]);
  const wide = layout(300, 300, { ...DEFAULT_BG, enabled: true, padding: 0, ratio: '16:9' });
  assert.ok(Math.abs(wide.cw / wide.ch - 16 / 9) < 0.01);
});

test('norm flips negative boxes', () => {
  assert.deepEqual(norm({ x: 10, y: 10, w: -4, h: -6 }), { x: 6, y: 4, w: 4, h: 6 });
});

test('annotation sizes grow with the image and with the S/M/L setting', () => {
  assert.ok(sizeFor('stroke', 1, 2600, 100) > sizeFor('stroke', 1, 520, 100));
  assert.ok(sizeFor('font', 2, 800, 600) > sizeFor('font', 0, 800, 600));
  assert.equal(sizeFor('stroke', 0, 10, 10), 2 * 0.75); // floor for tiny images
});

test('moveAnn moves both endpoints of a line', () => {
  const line = { type: 'line', x1: 1, y1: 1, x2: 4, y2: 9 };
  moveAnn(line, -1, 3);
  assert.deepEqual(line, { type: 'line', x1: 0, y1: 4, x2: 3, y2: 12 });
});

test('moveAnn moves both arrow endpoints or the box origin', () => {
  const arrow = { type: 'arrow', x1: 0, y1: 0, x2: 5, y2: 5 };
  moveAnn(arrow, 2, -1);
  assert.deepEqual(arrow, { type: 'arrow', x1: 2, y1: -1, x2: 7, y2: 4 });
  const rect = { type: 'rect', x: 1, y: 1, w: 3, h: 3 };
  moveAnn(rect, -1, 2);
  assert.deepEqual([rect.x, rect.y], [0, 3]);
});

test('nextCounter continues after the highest number', () => {
  assert.equal(nextCounter([]), 1);
  assert.equal(nextCounter([{ type: 'counter', n: 3 }, { type: 'rect' }, { type: 'counter', n: 1 }]), 4);
});

test('history undo/redo and the redo branch reset', () => {
  const h = new History(80);
  h.reset('a');
  assert.equal(h.canUndo, false);
  h.push('b'); h.push('c');
  assert.equal(h.undo(), 'b');
  assert.equal(h.undo(), 'a');
  assert.equal(h.undo(), null); // never past the opened image
  assert.equal(h.redo(), 'b');
  h.push('d');
  assert.equal(h.canRedo, false);
  assert.equal(h.top, 'd');
});

test('history cap keeps the original image', () => {
  const h = new History(3);
  h.reset('orig');
  ['1', '2', '3', '4'].forEach((s) => h.push(s));
  assert.deepEqual(h.past, ['orig', '3', '4']);
});

test('color helpers', () => {
  assert.equal(hexA('#FF8000', 0.5), 'rgba(255,128,0,0.5)');
  assert.equal(contrast('#FFFFFF'), '#1c1c1e');
  assert.equal(contrast('#1C1C1E'), '#ffffff');
});
