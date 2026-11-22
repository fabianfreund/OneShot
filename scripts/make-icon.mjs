// Generates build/icon.png (1024×1024), which electron-builder turns into
// .icns (macOS), .ico (Windows) and the Linux icon set.
// Design: sunset gradient tile with the same white "aperture" (ring + dot) as the tray icon.
// Run: npm run icon
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.mjs';

const S = 1024;
const INSET = 100;          // macOS icon grid: ~824px tile inside the 1024 canvas
const TILE = S - INSET * 2;
const RADIUS = TILE * 0.225;
const STOPS = [[0xff, 0x9a, 0x5a], [0xff, 0x4f, 0x7b], [0x8a, 0x3f, 0xfc]];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function gradient(t) {
  const s = clamp(t, 0, 1) * (STOPS.length - 1), i = Math.min(Math.floor(s), STOPS.length - 2);
  return mix(STOPS[i], STOPS[i + 1], s - i);
}
// Signed distance to a rounded rectangle (negative inside).
function sdRoundRect(x, y) {
  const cx = S / 2, cy = S / 2, h = TILE / 2 - RADIUS;
  const qx = Math.abs(x - cx) - h, qy = Math.abs(y - cy) - h;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - RADIUS;
}

const px = new Uint8Array(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const tile = clamp(0.5 - sdRoundRect(x + 0.5, y + 0.5), 0, 1);
    if (!tile) continue;
    let [r, g, b] = gradient((x + y - INSET * 2) / (TILE * 2));
    // Soft highlight top-left for depth.
    const hl = clamp(1 - Math.hypot(x - S * 0.3, y - S * 0.25) / (S * 0.6), 0, 1) * 0.18;
    [r, g, b] = mix([r, g, b], [255, 255, 255], hl);
    // Aperture: ring + centre dot, antialiased.
    const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2);
    const ring = clamp(0.5 - (Math.abs(d - 250) - 34), 0, 1);
    const dot = clamp(0.5 - (d - 92), 0, 1);
    [r, g, b] = mix([r, g, b], [255, 255, 255], Math.max(ring, dot));
    const i = (y * S + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = Math.round(tile * 255);
  }
}

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, encodePNG(S, S, px));
console.log('wrote', out);
