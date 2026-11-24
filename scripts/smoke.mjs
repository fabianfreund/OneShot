// End-to-end smoke test: launches the real app (isolated debug profile) and checks
// that the editor, capture overlay, welcome flow and Home load and render without renderer errors.
// Run: npm run smoke
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const electron = createRequire(import.meta.url)('electron'); // path to the binary
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneshot-smoke-'));

// 400×300 test image.
const img = path.join(dir, 'smoke.png');
const rgba = new Uint8Array(400 * 300 * 4).map((_, i) => [0x80, 0x40, 0xc0, 0xff][i % 4]);
fs.writeFileSync(img, encodePNG(400, 300, rgba));

// Runs in the editor page; throwing marks the run as failed.
const EDITOR_JS = `(async () => {
  const q = (s) => document.querySelector(s), errs = [];
  q('#edit-toggle').click();
  if (document.querySelectorAll('#tools .tb').length !== 11) errs.push('tool dock not built');
  q('.swatch').click();          // background on → commit
  q('#rot-r').click();           // destructive op → new base
  if (q('#undo').disabled) errs.push('undo not enabled after edits');
  if (q('#dims').textContent !== '300 × 400') errs.push('rotate failed: ' + q('#dims').textContent);
  if (errs.length) throw new Error(errs.join('; '));
})()`;

function run(name, args, env) {
  return new Promise((resolve) => {
    const shot = path.join(dir, `${name}.png`);
    const child = spawn(electron, [root, ...args], {
      env: { ...process.env, ...env, ONESHOT_DEBUG_SHOT: shot, ONESHOT_DEBUG_QUIT: '1' },
    });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    const timer = setTimeout(() => { log += '\n[smoke] timed out'; child.kill(); }, 30000);
    child.on('exit', () => {
      clearTimeout(timer);
      const problems = log.split('\n').filter((l) => /\[renderer:error\]|debug js error|timed out/.test(l));
      if (!fs.existsSync(shot)) problems.push('no screenshot written');
      resolve({ name, ok: problems.length === 0, problems, shot });
    });
  });
}

// Walks the welcome flow to the last step.
const ONBOARDING_JS = `(async () => {
  const q = (s) => document.querySelector(s), wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 4 && !q('.step:last-child.current'); i++) { (q('#skip:not(.hidden)') || q('#next')).click(); await wait(150); }
  if (!q('.step:last-child.current')) throw new Error('welcome flow did not reach the last step');
  if (!q('[data-sc="area"] kbd')) throw new Error('shortcut keycaps missing');
})()`;
const HOME_JS = `(async () => {
  const q = (s) => document.querySelector(s);
  if (!q('.cap kbd')) throw new Error('capture shortcuts missing');
  if (!q('#dir').textContent) throw new Error('capture folder missing');
  if (document.querySelectorAll('.slot').length !== 4 || !q('#size .on')) throw new Error('preview settings missing');
})()`;

// Copies the capture for real (Electron's clipboard API changed in v45 and broke this silently).
const OVERLAY_JS = `(async () => {
  const file = new URLSearchParams(location.search).get('file');
  if (!(await window.oneshot.copyFile(file))) throw new Error('copy to clipboard failed');
})()`;

// Drags a selection without letting go, so the window stays up for the screenshot.
const SELECT_JS = `(async () => {
  const ev = (t, x, y) => window.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  ev('pointerdown', 40, 30); ev('pointermove', 240, 180);
  if (!document.body.classList.contains('dragging')) throw new Error('selection did not start');
  if (!/^\\d+ × \\d+$/.test(document.querySelector('#size').textContent)) throw new Error('selection size missing');
})()`;

const results = [
  await run('editor', [img], { ONESHOT_DEBUG_JS: EDITOR_JS }),
  await run('overlay', [], { ONESHOT_DEBUG_OVERLAY: img, ONESHOT_DEBUG_JS: OVERLAY_JS }),
  await run('select', [], { ONESHOT_DEBUG_SELECT: img, ONESHOT_DEBUG_JS: SELECT_JS }),
  await run('onboarding', [], { ONESHOT_DEBUG_WINDOW: 'onboarding', ONESHOT_DEBUG_JS: ONBOARDING_JS }),
  await run('home', [], { ONESHOT_DEBUG_WINDOW: 'home', ONESHOT_DEBUG_JS: HOME_JS }),
];
for (const r of results) {
  console.log(`${r.ok ? '✔' : '✖'} ${r.name}${r.ok ? `  (${r.shot})` : ''}`);
  r.problems.forEach((p) => console.log(`    ${p}`));
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
