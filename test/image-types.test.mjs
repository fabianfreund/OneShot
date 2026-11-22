import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { IMAGE_EXTS } = require('../image-types.js');
const pkg = require('../package.json');

test('image types match the file associations in package.json', () => {
  const declared = pkg.build.fileAssociations.flatMap((a) => a.ext);
  assert.deepEqual([...IMAGE_EXTS].sort(), [...declared].sort());
});

test('every runtime file is packed into the app', () => {
  for (const f of ['main.js', 'preload.js', 'image-types.js']) assert.ok(pkg.build.files.includes(f), `${f} missing from build.files`);
});

// electron-builder strips `build` (and devDependencies, scripts) from the packaged package.json,
// so main-process code must not read them at runtime.
test('main process does not read stripped package.json fields', () => {
  for (const f of ['main.js', 'preload.js', 'image-types.js']) {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\.(build|scripts|devDependencies)\b/, `${f} reads a field that is missing in packaged builds`);
  }
});
