// Perspective correction (pure, unit-tested): solve the homography that maps the
// output rectangle onto the user's quad, then inverse-map every output pixel
// with bilinear sampling. Works on ImageData-shaped objects {data, width, height}.
import { clamp } from '../util.js';

// 8-unknown homography from 4 point pairs (Gaussian elimination). null if degenerate.
export function solveHomography(src, dst) {
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

export function applyHomography(Hm, x, y) {
  const z = Hm[6] * x + Hm[7] * y + Hm[8];
  return [(Hm[0] * x + Hm[1] * y + Hm[2]) / z, (Hm[3] * x + Hm[4] * y + Hm[5]) / z];
}

// Output size: the longer of each pair of opposite edges.
export function quadSize(quad) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return {
    w: Math.round(Math.max(d(quad[0], quad[1]), d(quad[3], quad[2]))),
    h: Math.round(Math.max(d(quad[0], quad[3]), d(quad[1], quad[2]))),
  };
}

// quad = [tl, tr, br, bl] in source pixels. Returns {data, width, height} or null.
export function warpPixels(src, quad) {
  const { w, h } = quadSize(quad);
  if (w < 4 || h < 4) return null;
  const Hm = solveHomography([[0, 0], [w, 0], [w, h], [0, h]], quad);
  if (!Hm) return null;
  const sw = src.width, sh = src.height, s = src.data;
  const o = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const Y = y + 0.5;
    for (let x = 0; x < w; x++) {
      const [mx, my] = applyHomography(Hm, x + 0.5, Y);
      const sx = clamp(mx - 0.5, 0, sw - 1), sy = clamp(my - 0.5, 0, sh - 1);
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
  return { data: o, width: w, height: h };
}
