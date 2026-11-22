import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyHomography, quadSize, solveHomography, warpPixels } from '../renderer/editor/warp.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// Solid image with one distinct pixel per quadrant so orientation is checkable.
function image(w, h, colorAt) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(colorAt(x, y), (y * w + x) * 4);
  return { data, width: w, height: h };
}
const px = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

test('homography maps the four source corners onto the destination quad', () => {
  const src = [[0, 0], [100, 0], [100, 50], [0, 50]];
  const dst = [[10, 5], [120, 20], [110, 90], [0, 70]];
  const Hm = solveHomography(src, dst);
  assert.ok(Hm);
  src.forEach(([x, y], i) => {
    const [u, v] = applyHomography(Hm, x, y);
    close(u, dst[i][0]); close(v, dst[i][1]);
  });
});

test('identity quad gives the identity homography', () => {
  const r = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const Hm = solveHomography(r, r);
  [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => close(Hm[i], v));
});

test('degenerate quad (collapsed corners) is rejected', () => {
  assert.equal(solveHomography([[0, 0], [10, 0], [10, 10], [0, 10]], [[5, 5], [5, 5], [5, 5], [5, 5]]), null);
  assert.equal(warpPixels(image(10, 10, () => [0, 0, 0, 255]), [[1, 1], [2, 1], [2, 2], [1, 2]]), null);
});

test('output size uses the longer of each pair of opposite edges', () => {
  assert.deepEqual(quadSize([[0, 0], [30, 0], [40, 20], [0, 20]]), { w: 40, h: 22 });
});

test('warping the full-image quad reproduces the image', () => {
  const src = image(8, 6, (x, y) => [x * 30, y * 40, 100, 255]);
  const out = warpPixels(src, [[0, 0], [8, 0], [8, 6], [0, 6]]);
  assert.equal(out.width, 8); assert.equal(out.height, 6);
  assert.deepEqual([...out.data], [...src.data]);
});

test('warp keeps orientation: corners land in the matching corners', () => {
  const RED = [255, 0, 0, 255], GREEN = [0, 255, 0, 255], BLUE = [0, 0, 255, 255], WHITE = [255, 255, 255, 255];
  const src = image(40, 40, (x, y) => (y < 20 ? (x < 20 ? RED : GREEN) : (x < 20 ? BLUE : WHITE)));
  // A tilted quad around the image centre.
  const out = warpPixels(src, [[4, 2], [36, 6], [38, 36], [2, 38]]);
  assert.deepEqual(px(out, 1, 1), RED);
  assert.deepEqual(px(out, out.width - 2, 1), GREEN);
  assert.deepEqual(px(out, 1, out.height - 2), BLUE);
  assert.deepEqual(px(out, out.width - 2, out.height - 2), WHITE);
});
