// DOM + bridge helpers shared by the renderer pages.
export const api = window.oneshot;
export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => [...document.querySelectorAll(sel)];
export const param = (key) => new URLSearchParams(location.search).get(key);

// Read an image through the main process and return it with a blob: URL.
export async function loadImage(file) {
  const res = await api.readImage(file);
  return { ...res, url: URL.createObjectURL(new Blob([res.data], { type: res.mime })) };
}

// "Alt+Shift+4" → keycaps (⌥ ⇧ 4 on macOS).
const MAC_KEYS = { Alt: '⌥', Shift: '⇧', Cmd: '⌘', CmdOrCtrl: '⌘', Ctrl: '⌃' };
export function keycaps(acc, platform = api.platform) {
  const mac = platform === 'darwin';
  return acc.split('+').map((k) => `<kbd>${mac ? (MAC_KEYS[k] || k) : k}</kbd>`).join('');
}
