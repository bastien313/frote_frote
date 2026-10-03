// PWA consistency checks: every runtime file is precached by the service worker,
// versions match, and the manifest references existing icons.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

test('service worker precaches every runtime file', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const files = [...walk(join(root, 'src')), ...walk(join(root, 'css')), ...walk(join(root, 'icons'))]
    .map((p) => './' + relative(root, p).split('\\').join('/'));
  for (const f of files) assert.ok(sw.includes(`'${f}'`), `${f} is missing from ASSETS in sw.js`);
  for (const m of sw.matchAll(/'(\.\/[^']+)'/g)) {
    const p = m[1];
    if (p === './') continue;
    assert.ok(existsSync(join(root, p)), `sw.js lists ${p} which does not exist`);
  }
});

test('versions match between sw.js, main.js and package.json', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8').match(/const VERSION = '([^']+)'/)[1];
  const main = readFileSync(join(root, 'src/main.js'), 'utf8').match(/export const VERSION = '([^']+)'/)[1];
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  assert.equal(sw, main, 'sw.js VERSION must equal src/main.js VERSION');
  assert.equal(pkg, main, 'package.json version must equal src/main.js VERSION');
});

test('manifest is valid and its icons exist', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.ok(m.name && m.short_name && m.start_url && m.display);
  assert.ok(m.icons.some((i) => i.sizes === '192x192'));
  assert.ok(m.icons.some((i) => i.sizes === '512x512'));
  for (const i of m.icons) assert.ok(existsSync(join(root, i.src)), `missing icon ${i.src}`);
});
