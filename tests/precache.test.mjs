import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectAssets, currentAndExpected } from '../tools/precache.mjs';

test('sw.js enthält die aktuelle Dateiliste (sonst: node tools/precache.mjs)', () => {
  const { sw, expected } = currentAndExpected();
  assert.equal(sw, expected);
});

test('Precache-Liste enthält die App-Dateien, aber keine Werkzeuge oder Lizenztexte', () => {
  const assets = collectAssets();
  for (const must of ['index.html', 'manifest.webmanifest', 'src/main.js', 'vendor/katex/katex.min.js']) {
    assert.ok(assets.includes(must), `${must} fehlt`);
  }
  assert.ok(!assets.some((p) => /^(tools|tests|docs|node_modules)\//.test(p)));
  assert.ok(!assets.some((p) => /LICENSE/i.test(p)));
});
