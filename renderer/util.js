// Pure helpers shared by every renderer page (no DOM, so Node tests can import them).
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Readable text color on top of `hex`.
export function contrast(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.7 ? '#1c1c1e' : '#ffffff';
}
