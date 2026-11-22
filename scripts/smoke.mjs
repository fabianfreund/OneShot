// End-to-end smoke test: launches the real app (isolated debug profile) and checks
// that the editor and the capture overlay load, edit, and render without renderer errors.
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
  if (document.querySelectorAll('#tools .tb').length !== 10) errs.push('tool dock not built');
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

const results = [
  await run('editor', [img], { ONESHOT_DEBUG_JS: EDITOR_JS }),
  await run('overlay', [], { ONESHOT_DEBUG_OVERLAY: img }),
];
for (const r of results) {
  console.log(`${r.ok ? '✔' : '✖'} ${r.name}${r.ok ? `  (${r.shot})` : ''}`);
  r.problems.forEach((p) => console.log(`    ${p}`));
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
